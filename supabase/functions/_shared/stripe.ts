import Stripe from 'npm:stripe@14';

/**
 * Shared Stripe client initialization.
 *
 * Reads `STRIPE_SECRET_KEY` from environment. In Supabase, set via:
 *
 *   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
 *   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * API version is pinned so object shapes stay stable across Stripe's
 * monthly release cadence. Bump deliberately, not implicitly.
 */
export function createStripe(): Stripe {
  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY must be set in the function environment.');
  }
  return new Stripe(secret, {
    apiVersion: '2024-06-20',
    // Deno's standard fetch is the right transport — Stripe's default
    // Node http client doesn't work under Deno.
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function getWebhookSecret(): string {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be set in the function environment.');
  }
  return secret;
}

/**
 * Maps Stripe's subscription status to our `subscription_status` enum.
 * Stripe has a few states we deliberately flatten: `incomplete`,
 * `incomplete_expired`, and `unpaid` all become `inactive`. Callers
 * should treat the returned value as opaque to the DB's enum.
 */
export function mapStripeStatus(
  status: Stripe.Subscription.Status,
): 'trialing' | 'active' | 'past_due' | 'canceled' | 'inactive' {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
      return status;
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
    default:
      return 'inactive';
  }
}

/**
 * Converts a Stripe Unix timestamp (seconds) to an ISO string for
 * Postgres `timestamptz` columns. Returns null for null/undefined.
 */
export function stripeTimestampToIso(value: number | null | undefined): string | null {
  if (value == null) return null;
  return new Date(value * 1000).toISOString();
}

export { Stripe };
