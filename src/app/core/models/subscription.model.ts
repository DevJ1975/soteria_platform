/**
 * Billing lifecycle shapes.
 *
 * Schema reference: migration `20260417120015_billing_subscriptions.sql`.
 * One `Subscription` per tenant, source of truth for plan assignment.
 */

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'inactive';

/**
 * Which external provider, if any, owns this subscription's billing.
 *   - `manual`: Soteria-internal lifecycle (trials, operator overrides).
 *     No external billing attached.
 *   - `stripe`: synchronized with a Stripe Subscription via webhook.
 */
export type BillingProvider = 'manual' | 'stripe';

/**
 * Event types match the enum defined on the DB side and are
 * intentionally shaped like Stripe's — once webhook handling lands, we
 * can map a Stripe event type to one of these 1:1 without schema churn.
 */
export type BillingEventType =
  | 'subscription_created'
  | 'trial_started'
  | 'trial_ended'
  | 'plan_upgraded'
  | 'plan_downgraded'
  | 'plan_changed'
  | 'subscription_canceled'
  | 'subscription_reactivated'
  | 'status_changed'
  | 'external_sync';

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string | null;
  status: SubscriptionStatus;

  /**
   * Which provider owns this row's billing lifecycle. Default
   * `manual` for freshly-created tenants (trials); flips to `stripe`
   * on `checkout.session.completed`.
   */
  billingProvider: BillingProvider;

  /** Populated while the tenant is in, or has been through, a trial. */
  trialStartDate: string | null;
  trialEndDate: string | null;

  /** Paid-period markers. Null during trial or once inactive. */
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;

  /**
   * Future timestamp when a cancellation takes effect. If
   * `cancel_at > now`, the tenant retains access until that time. Null
   * unless the tenant is on the cancellation path.
   */
  cancelAt: string | null;

  /** When the cancellation request was *made* (audit only). */
  canceledAt: string | null;

  /** External provider ids — populated once Stripe Checkout completes. */
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;

  metadata: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export interface BillingEvent {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  eventType: BillingEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Subscriptions are never directly created from the tenant app — the
 * trial row is auto-provisioned on tenant insert. This payload is used
 * by the platform admin area for explicit creation (e.g., replacing an
 * accidentally-deleted row, or seeding a tenant with a specific state).
 */
export interface CreateSubscriptionPayload {
  tenantId: string;
  planId: string | null;
  status?: SubscriptionStatus;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}

export interface UpdateSubscriptionPayload {
  planId?: string | null;
  status?: SubscriptionStatus;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAt?: string | null;
  canceledAt?: string | null;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Compact row shape for cross-tenant admin views (tenant list page,
 * future dunning dashboard, etc.). Joins the plan's display name in
 * the same round-trip so the list page doesn't N+1.
 */
export interface TenantSubscriptionSummary {
  id: string;
  tenantId: string;
  planId: string | null;
  planName: string | null;
  status: SubscriptionStatus;
  trialEndDate: string | null;
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}
