import { Subscription, SubscriptionStatus } from '../models/subscription.model';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Access statuses — still inside the window where we let the tenant
 * use the product. Centralized here so the guard, the helper, and any
 * future middleware stay in lockstep.
 */
const ACCESS_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'trialing',
  'active',
  'past_due',
  'canceled', // conditional — see canAccessPlatform()
]);

/**
 * True when the tenant should still be able to use the product. Pulls
 * every access rule into one place:
 *
 *   - `trialing` → allow until `trialEndDate`
 *   - `active`   → allow
 *   - `past_due` → allow (grace; dunning happens elsewhere)
 *   - `canceled` → allow until `cancelAt` (null = forever; caller should
 *                  set `cancelAt = now` when downgrading to "no access")
 *   - `inactive` → deny
 *
 * `null` (no subscription row yet) → deny. The trial subscription is
 * auto-provisioned by a DB trigger, so seeing `null` means something is
 * wrong; failing closed is the safer default.
 */
export function canAccessPlatform(
  subscription: Subscription | null,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (!ACCESS_STATUSES.has(subscription.status)) return false;

  if (subscription.status === 'trialing') {
    return !isTrialExpired(subscription, now);
  }

  if (subscription.status === 'canceled') {
    return !isCancellationEffective(subscription, now);
  }

  return true;
}

/**
 * True when the subscription is a trial and the trial end date is in
 * the past. Returns false for non-trial statuses so callers can use it
 * unconditionally.
 */
export function isTrialExpired(
  subscription: Subscription | null,
  now: Date = new Date(),
): boolean {
  if (!subscription || subscription.status !== 'trialing') return false;
  if (!subscription.trialEndDate) return false;
  return new Date(subscription.trialEndDate).getTime() <= now.getTime();
}

/**
 * Whole days between `now` and `trialEndDate`. Rounds up so "17 hours
 * left" still reads as "1 day left" in the UI — matches how SaaS
 * billing pages conventionally phrase trial countdowns.
 *
 * Returns 0 for expired trials, and null when the subscription isn't
 * in a trial state or has no end date.
 */
export function getRemainingTrialDays(
  subscription: Subscription | null,
  now: Date = new Date(),
): number | null {
  if (!subscription || subscription.status !== 'trialing') return null;
  if (!subscription.trialEndDate) return null;
  const end = new Date(subscription.trialEndDate).getTime();
  const diff = end - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

/**
 * For a `canceled` subscription: has `cancelAt` already passed?
 * (If cancelAt is null we treat the cancellation as not yet effective —
 * the operator presumably set status to canceled but didn't pick a
 * date. The billing page will prompt them to.)
 */
export function isCancellationEffective(
  subscription: Subscription | null,
  now: Date = new Date(),
): boolean {
  if (!subscription || subscription.status !== 'canceled') return false;
  if (!subscription.cancelAt) return false;
  return new Date(subscription.cancelAt).getTime() <= now.getTime();
}

/**
 * Thin boolean for templates: does the subscription grant an *active*
 * product experience? Subtly different from `canAccessPlatform` — a
 * tenant in `past_due` can still use the product (access is allowed)
 * but their subscription is not "healthy" (past_due).
 */
export function isSubscriptionHealthy(
  subscription: Subscription | null,
): boolean {
  if (!subscription) return false;
  return subscription.status === 'active' || subscription.status === 'trialing';
}
