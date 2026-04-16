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
import { createStripe } from '../_shared/stripe.ts';

/**
 * POST /functions/v1/create-portal-session
 *
 * Body: { returnUrl?: string }
 *
 * Creates a Stripe Customer Portal session and returns its URL. The
 * portal is Stripe's hosted surface for "manage my subscription" —
 * change plan, update payment method, cancel, view invoices.
 *
 * Refuses if the tenant doesn't yet have an `external_customer_id`
 * (they haven't completed a Checkout, so Stripe has no customer to
 * manage). Frontend interprets the 409 as "run the Upgrade flow first."
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('POST only.', 405);

  try {
    const admin = createAdminClient();
    const stripe = createStripe();

    const { tenantId } = await authenticateRequest(req, admin);

    const { data: sub, error: subErr } = await admin
      .from('subscriptions')
      .select('external_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub?.['external_customer_id']) {
      return errorResponse(
        'No billing portal available — please complete a subscription purchase first.',
        409,
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      returnUrl?: string;
    };
    const returnUrl =
      body.returnUrl ??
      `${req.headers.get('origin') ?? 'http://localhost:4200'}/app/billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: sub['external_customer_id'] as string,
      return_url: returnUrl,
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('create-portal-session failed', err);
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});
