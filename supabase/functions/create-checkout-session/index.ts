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
 * POST /functions/v1/create-checkout-session
 *
 * Body: { planId: string, returnUrl?: string }
 *
 * Flow
 * ----
 * 1. Verify caller's JWT → resolve tenant + email from user_profiles.
 * 2. Look up the target plan's `stripe_price_id`. Refuse if unset —
 *    the operator has to map the plan to a Stripe Price first.
 * 3. Reuse an existing Stripe customer when the tenant already has
 *    one (`subscriptions.external_customer_id`). Otherwise let
 *    Stripe create one on-demand; the webhook captures the id on
 *    `checkout.session.completed`.
 * 4. Create a Checkout Session carrying our tenant/plan/user ids in
 *    metadata so the webhook can resolve back without a lookup.
 * 5. Return the session URL; the client redirects.
 *
 * `subscriptions` isn't mutated here — the webhook does the DB write
 * when Checkout completes. Keeps the flow transactional: either the
 * session succeeds and the webhook updates state, or nothing changes.
 */
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('POST only.', 405);

  try {
    const admin = createAdminClient();
    const stripe = createStripe();

    const { userId, tenantId, email } = await authenticateRequest(req, admin);

    const body = (await req.json().catch(() => ({}))) as {
      planId?: string;
      returnUrl?: string;
    };
    if (!body.planId) return errorResponse('planId is required.', 400);

    // Plan must exist, be active, and have a Stripe Price id.
    const { data: plan, error: planErr } = await admin
      .from('subscription_plans')
      .select('id, name, stripe_price_id, is_active')
      .eq('id', body.planId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan) return errorResponse('Plan not found.', 404);
    if (!plan['is_active']) return errorResponse('Plan is inactive.', 400);
    if (!plan['stripe_price_id']) {
      return errorResponse(
        'Plan is not mapped to a Stripe price. Contact support.',
        400,
      );
    }

    // Reuse existing Stripe customer if we already have one for this
    // tenant — otherwise Checkout mints a new one and the webhook
    // captures it.
    const { data: existingSub, error: subErr } = await admin
      .from('subscriptions')
      .select('id, external_customer_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (subErr) throw subErr;

    const baseUrl =
      body.returnUrl ?? req.headers.get('origin') ?? 'http://localhost:4200';
    const successUrl = `${baseUrl}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/app/billing?checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan['stripe_price_id'] as string, quantity: 1 }],
      ...(existingSub?.['external_customer_id']
        ? { customer: existingSub['external_customer_id'] as string }
        : { customer_email: email }),
      // Metadata on the resulting Subscription object — the webhook
      // uses these to resolve back to our tenant without a join.
      subscription_data: {
        metadata: {
          soteria_tenant_id: tenantId,
          soteria_plan_id: plan['id'] as string,
        },
      },
      // Belt-and-suspenders: same metadata on the Session itself.
      client_reference_id: tenantId,
      metadata: {
        soteria_tenant_id: tenantId,
        soteria_plan_id: plan['id'] as string,
        soteria_user_id: userId,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Tax collection off for Phase 13; enable when we have the
      // operational hookup.
      automatic_tax: { enabled: false },
      allow_promotion_codes: true,
    });

    return jsonResponse({ url: session.url, sessionId: session.id });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('create-checkout-session failed', err);
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500);
  }
});
