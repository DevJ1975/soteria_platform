import { errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import {
  createStripe,
  getWebhookSecret,
  mapStripeStatus,
  Stripe,
  stripeTimestampToIso,
} from '../_shared/stripe.ts';

/**
 * POST /functions/v1/stripe-webhook
 *
 * Stripe webhook sink. Verifies signature, dedupes by `event.id`, and
 * translates the Stripe event into an internal subscription update +
 * `billing_events` row.
 *
 * Event map (see docs/admin-guide.md § Billing & subscriptions)
 * ------------------------------------------------------------
 *   checkout.session.completed     → capture customer + subscription ids,
 *                                    pull the live subscription and sync.
 *   customer.subscription.updated  → sync status, period dates, cancel_at,
 *                                    plan (if price id changed).
 *   customer.subscription.deleted  → status → inactive, canceled_at = now.
 *   invoice.payment_succeeded      → status → active (if not already),
 *                                    advance current_period_end.
 *   invoice.payment_failed         → status → past_due.
 *
 * Everything else is intentionally acknowledged (`{ received: true }`)
 * without action so Stripe's retry logic doesn't thrash.
 *
 * This function uses the service-role Supabase client — it runs without
 * a user JWT and bypasses RLS by design.
 *
 * Deploying
 * ---------
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *
 * `--no-verify-jwt` is required: Stripe's signed webhook is the auth;
 * there's no Supabase user on the request.
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('POST only.', 405);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return errorResponse('Missing stripe-signature header.', 400);

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = createStripe();
    // constructEventAsync — Deno's crypto is async, unlike Node's.
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      getWebhookSecret(),
    );
  } catch (err) {
    console.error('Stripe signature verification failed', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Signature verification failed.',
      400,
    );
  }

  try {
    const admin = createAdminClient();
    const stripe = createStripe();

    // Idempotency check — Stripe retries on non-2xx, and networks drop
    // responses occasionally. Unique partial index on external_event_id
    // gives us O(log n) skip. If the event already ran we still return
    // 200 so Stripe stops retrying.
    const { data: existing, error: existingErr } = await admin
      .from('billing_events')
      .select('id')
      .eq('external_event_id', event.id)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) return jsonResponse({ received: true, duplicate: true });

    await routeEvent(event, admin, stripe);

    return jsonResponse({ received: true });
  } catch (err) {
    console.error('stripe-webhook failed for event', event.type, err);
    // 500 so Stripe retries — transient DB blips shouldn't drop events.
    return errorResponse(
      err instanceof Error ? err.message : 'Webhook handling failed.',
      500,
    );
  }
});

// ----------------------------------------------------------------------------
// Event routing
// ----------------------------------------------------------------------------

async function routeEvent(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
  stripe: Stripe,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session, event, admin, stripe);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionSync(sub, event, admin);
      return;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(sub, event, admin);
      return;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePaid(invoice, event, admin, stripe);
      return;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoiceFailed(invoice, event, admin, stripe);
      return;
    }
    default:
      // Unhandled event types are acknowledged so Stripe doesn't
      // retry — but also logged for visibility.
      console.info('[stripe-webhook] unhandled event', event.type);
      await logExternalEvent(admin, event, null, null);
  }
}

// ----------------------------------------------------------------------------
// Event handlers
// ----------------------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
  stripe: Stripe,
): Promise<void> {
  const tenantId =
    (session.metadata?.['soteria_tenant_id'] as string | undefined) ??
    (session.client_reference_id ?? null);
  if (!tenantId) {
    throw new Error('checkout.session.completed missing soteria_tenant_id.');
  }

  // session.subscription may be a string or an expanded object — pull
  // the full subscription from Stripe so we have every field we care
  // about in one place.
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
  if (!subscriptionId) {
    throw new Error('checkout.session.completed has no subscription id.');
  }

  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof stripeSub.customer === 'string'
      ? stripeSub.customer
      : stripeSub.customer.id;

  const planId = await resolvePlanIdFromSubscription(stripeSub, admin);

  const updateRow = {
    plan_id: planId,
    status: mapStripeStatus(stripeSub.status),
    billing_provider: 'stripe',
    external_customer_id: customerId,
    external_subscription_id: stripeSub.id,
    current_period_start: stripeTimestampToIso(stripeSub.current_period_start),
    current_period_end: stripeTimestampToIso(stripeSub.current_period_end),
    cancel_at: stripeTimestampToIso(stripeSub.cancel_at ?? null),
    canceled_at: stripeTimestampToIso(stripeSub.canceled_at ?? null),
    trial_start_date: stripeTimestampToIso(stripeSub.trial_start ?? null),
    trial_end_date: stripeTimestampToIso(stripeSub.trial_end ?? null),
  };

  const { error } = await admin
    .from('subscriptions')
    .update(updateRow)
    .eq('tenant_id', tenantId);
  if (error) throw error;

  await logExternalEvent(admin, event, tenantId, 'subscription_reactivated', {
    stripe_subscription_id: stripeSub.id,
    plan_id: planId,
  });
}

async function handleSubscriptionSync(
  stripeSub: Stripe.Subscription,
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const tenantId =
    (stripeSub.metadata?.['soteria_tenant_id'] as string | undefined) ?? null;
  // Look up by tenant id first (fastest), fall back to external
  // subscription id if we lost the metadata.
  const existing = await findExistingSubscription(
    admin,
    tenantId,
    stripeSub.id,
  );
  if (!existing) {
    console.warn(
      '[stripe-webhook] subscription.updated for unknown Soteria tenant',
      stripeSub.id,
    );
    await logExternalEvent(admin, event, tenantId, null);
    return;
  }

  const newPlanId = await resolvePlanIdFromSubscription(stripeSub, admin);
  const newStatus = mapStripeStatus(stripeSub.status);

  const updateRow = {
    plan_id: newPlanId,
    status: newStatus,
    billing_provider: 'stripe',
    external_customer_id:
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id,
    external_subscription_id: stripeSub.id,
    current_period_start: stripeTimestampToIso(stripeSub.current_period_start),
    current_period_end: stripeTimestampToIso(stripeSub.current_period_end),
    cancel_at: stripeTimestampToIso(stripeSub.cancel_at ?? null),
    canceled_at: stripeTimestampToIso(stripeSub.canceled_at ?? null),
    trial_start_date: stripeTimestampToIso(stripeSub.trial_start ?? null),
    trial_end_date: stripeTimestampToIso(stripeSub.trial_end ?? null),
  };

  const { error } = await admin
    .from('subscriptions')
    .update(updateRow)
    .eq('id', existing.id);
  if (error) throw error;

  // Derive the richest event type from the diff.
  const eventType =
    existing.plan_id !== newPlanId
      ? 'plan_changed'
      : existing.status !== newStatus
        ? 'status_changed'
        : 'external_sync';

  await logExternalEvent(admin, event, existing.tenant_id, eventType, {
    previous_status: existing.status,
    new_status: newStatus,
    previous_plan_id: existing.plan_id,
    new_plan_id: newPlanId,
  });
}

async function handleSubscriptionDeleted(
  stripeSub: Stripe.Subscription,
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const existing = await findExistingSubscription(
    admin,
    stripeSub.metadata?.['soteria_tenant_id'] ?? null,
    stripeSub.id,
  );
  if (!existing) return;

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: 'inactive',
      canceled_at: stripeTimestampToIso(stripeSub.canceled_at ?? null) ??
        new Date().toISOString(),
      cancel_at:
        stripeTimestampToIso(stripeSub.cancel_at ?? null) ??
        new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (error) throw error;

  await logExternalEvent(admin, event, existing.tenant_id, 'subscription_canceled', {
    stripe_subscription_id: stripeSub.id,
    immediate: true,
  });
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
  stripe: Stripe,
): Promise<void> {
  if (!invoice.subscription) return;
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id;

  const existing = await findExistingSubscription(admin, null, subscriptionId);
  if (!existing) return;

  // Pull the fresh subscription to sync the new period window — the
  // invoice itself doesn't carry current_period_end in a stable place.
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: mapStripeStatus(stripeSub.status),
      current_period_start: stripeTimestampToIso(stripeSub.current_period_start),
      current_period_end: stripeTimestampToIso(stripeSub.current_period_end),
    })
    .eq('id', existing.id);
  if (error) throw error;

  await logExternalEvent(admin, event, existing.tenant_id, 'status_changed', {
    trigger: 'invoice.payment_succeeded',
    new_status: stripeSub.status,
  });
}

async function handleInvoiceFailed(
  invoice: Stripe.Invoice,
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
  _stripe: Stripe,
): Promise<void> {
  if (!invoice.subscription) return;
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id;

  const existing = await findExistingSubscription(admin, null, subscriptionId);
  if (!existing) return;

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('id', existing.id);
  if (error) throw error;

  await logExternalEvent(admin, event, existing.tenant_id, 'status_changed', {
    trigger: 'invoice.payment_failed',
    new_status: 'past_due',
  });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface SubscriptionLookupResult {
  id: string;
  tenant_id: string;
  status: string;
  plan_id: string | null;
}

async function findExistingSubscription(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string | null,
  stripeSubscriptionId: string | null,
): Promise<SubscriptionLookupResult | null> {
  // Prefer tenant_id (unique, fastest). Fall back to external id —
  // necessary when Stripe strips metadata on certain events.
  if (tenantId) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, tenant_id, status, plan_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as unknown as SubscriptionLookupResult;
  }
  if (stripeSubscriptionId) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, tenant_id, status, plan_id')
      .eq('external_subscription_id', stripeSubscriptionId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as unknown as SubscriptionLookupResult;
  }
  return null;
}

/**
 * Resolves the Stripe subscription's current Price id back to our
 * `subscription_plans.id`. Subscription items can in theory have
 * multiple prices; we use the first.
 */
async function resolvePlanIdFromSubscription(
  stripeSub: Stripe.Subscription,
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  // Fast path: check the metadata we set at checkout time.
  const metaPlanId = stripeSub.metadata?.['soteria_plan_id'];
  if (metaPlanId) return metaPlanId;

  const priceId = stripeSub.items.data[0]?.price.id;
  if (!priceId) return null;

  const { data, error } = await admin
    .from('subscription_plans')
    .select('id')
    .eq('stripe_price_id', priceId)
    .maybeSingle();
  if (error) throw error;
  return (data?.['id'] as string | null) ?? null;
}

async function logExternalEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
  tenantId: string | null,
  internalEventType:
    | 'subscription_created'
    | 'subscription_reactivated'
    | 'subscription_canceled'
    | 'status_changed'
    | 'plan_changed'
    | 'plan_upgraded'
    | 'plan_downgraded'
    | 'external_sync'
    | 'trial_started'
    | 'trial_ended'
    | null,
  extraMetadata: Record<string, unknown> = {},
): Promise<void> {
  if (!tenantId) return; // Can't attribute — skip the log.
  const eventType = internalEventType ?? 'external_sync';
  const { error } = await admin.from('billing_events').insert({
    tenant_id: tenantId,
    event_type: eventType,
    external_event_id: event.id,
    metadata: {
      stripe_event_type: event.type,
      stripe_event_id: event.id,
      ...extraMetadata,
    },
  });
  if (error) throw error;
}
