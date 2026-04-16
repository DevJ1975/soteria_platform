import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Service-role Supabase client for Edge Functions.
 *
 * Webhook handlers and checkout/portal endpoints need to bypass RLS —
 * the webhook runs without a user context, and checkout runs on behalf
 * of the signed-in user but needs to write billing data that RLS
 * deliberately locks down for normal tenant users.
 *
 * The service role key is pulled from environment. Never expose it to
 * the client; all access goes through edge functions.
 */
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the function environment.',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verifies a user JWT and resolves tenant + email from their profile.
 * Used by the checkout and portal endpoints so we can tie the Stripe
 * session back to the correct tenant without trusting client-supplied
 * ids.
 */
export async function authenticateRequest(
  req: Request,
  admin: SupabaseClient,
): Promise<{ userId: string; tenantId: string; email: string }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    throw new HttpError(401, 'Missing bearer token.');
  }
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) {
    throw new HttpError(401, 'Invalid or expired token.');
  }
  const userId = userData.user.id;
  const { data: profile, error: profileErr } = await admin
    .from('user_profiles')
    .select('tenant_id, email, role')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr || !profile) {
    throw new HttpError(403, 'No profile found for user.');
  }
  return {
    userId,
    tenantId: profile['tenant_id'] as string,
    email: (profile['email'] as string) ?? userData.user.email ?? '',
  };
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
