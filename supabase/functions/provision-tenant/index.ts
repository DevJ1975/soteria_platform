import {
  errorResponse,
  handlePreflight,
  jsonResponse,
} from '../_shared/cors.ts';
import {
  authenticateRequest,
  createAdminClient,
  HttpError,
} from '../_shared/supabase-admin.ts';

/**
 * POST /functions/v1/provision-tenant
 *
 * Body:
 *   {
 *     tenantName:       string,
 *     tenantSlug:       string,
 *     planId?:          string | null,
 *     siteName:         string,
 *     siteTimezone:     string,
 *     siteType?:        string | null,
 *     adminEmail:       string,
 *     adminFirstName:   string,
 *     adminLastName?:   string,
 *   }
 *
 * Flow
 * ----
 * 1. Verify the caller has `role = 'platform_admin'`.
 * 2. Call `provision_tenant_environment` RPC — single transaction that
 *    creates the tenant (triggers auto-create trial subscription +
 *    default site + tenant_settings) and customizes the default site
 *    with operator-provided name / timezone / type. Returns the
 *    tenant + site ids.
 * 3. Invite the tenant admin via `auth.admin.inviteUserByEmail` with
 *    the new tenant/site ids baked into invite metadata. On signup
 *    the invited user's `handle_new_user` trigger picks up the
 *    metadata, creates their `user_profiles` row against the named
 *    tenant, and the downstream `ensure_user_primary_membership`
 *    trigger wires them to the default site.
 *
 * Atomicity
 * ---------
 * The RPC half is transactional. The invite half is not — if the
 * invite fails (SMTP down, duplicate email), the tenant + site +
 * settings are already committed. We return a partial-success
 * response so the operator can retry the invite without creating a
 * duplicate tenant.
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('POST only.', 405);

  try {
    const admin = createAdminClient();
    const { userId } = await authenticateRequest(req, admin);

    // Authorization — only platform_admin callers may provision.
    const { data: callerProfile, error: callerErr } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (callerErr) throw callerErr;
    if (callerProfile?.['role'] !== 'platform_admin') {
      return errorResponse('Forbidden — platform_admin role required.', 403);
    }

    const body = (await req.json().catch(() => ({}))) as ProvisionTenantBody;
    const validationError = validateBody(body);
    if (validationError) return errorResponse(validationError, 400);

    // 1. DB transaction: tenant + site + settings.
    const { data: envData, error: envErr } = await admin.rpc(
      'provision_tenant_environment',
      {
        p_name: body.tenantName.trim(),
        p_slug: body.tenantSlug.trim(),
        p_plan_id: body.planId ?? null,
        p_site_name: body.siteName.trim(),
        p_site_timezone: body.siteTimezone.trim(),
        p_site_type: body.siteType?.trim() || null,
      },
    );
    if (envErr) {
      // Surface unique-violation (slug already exists) with a friendly
      // message; other errors bubble as 500.
      const msg = envErr.message ?? '';
      const status =
        msg.includes('duplicate key') || msg.includes('already exists')
          ? 409
          : 500;
      return errorResponse(envErr.message, status);
    }

    const tenantId = (envData as { tenant_id: string; site_id: string }).tenant_id;
    const siteId = (envData as { tenant_id: string; site_id: string }).site_id;

    // 2. Invite the admin. Soteria-prefixed metadata keys are the
    //    contract with `handle_new_user` — don't rename without
    //    updating the migration.
    const fullName =
      body.adminLastName?.trim()
        ? `${body.adminFirstName.trim()} ${body.adminLastName.trim()}`
        : body.adminFirstName.trim();

    const { data: inviteData, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(body.adminEmail.trim(), {
        data: {
          full_name: fullName,
          soteria_tenant_id: tenantId,
          soteria_site_id: siteId,
          soteria_role: 'admin',
        },
        redirectTo:
          `${req.headers.get('origin') ?? 'http://localhost:4200'}/auth/login`,
      });

    if (inviteErr) {
      return jsonResponse(
        {
          tenantId,
          siteId,
          inviteSent: false,
          inviteError: inviteErr.message,
          // Tenant has been committed — operator can retry invite
          // from the tenant edit page (future "Resend invite" button).
        },
        207, // Multi-status — partial success.
      );
    }

    return jsonResponse({
      tenantId,
      siteId,
      inviteSent: true,
      invitedUserId: inviteData.user?.id ?? null,
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('provision-tenant failed', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Unknown error',
      500,
    );
  }
});

interface ProvisionTenantBody {
  tenantName?: string;
  tenantSlug?: string;
  planId?: string | null;
  siteName?: string;
  siteTimezone?: string;
  siteType?: string | null;
  adminEmail?: string;
  adminFirstName?: string;
  adminLastName?: string;
}

function validateBody(body: ProvisionTenantBody): string | null {
  if (!body.tenantName?.trim()) return 'tenantName is required.';
  if (!body.tenantSlug?.trim()) return 'tenantSlug is required.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.tenantSlug.trim())) {
    return 'tenantSlug must be lowercase letters, numbers, and hyphens.';
  }
  if (!body.siteName?.trim()) return 'siteName is required.';
  if (!body.siteTimezone?.trim()) return 'siteTimezone is required.';
  if (!body.adminEmail?.trim()) return 'adminEmail is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.adminEmail.trim())) {
    return 'adminEmail must be a valid email.';
  }
  if (!body.adminFirstName?.trim()) return 'adminFirstName is required.';
  return null;
}
