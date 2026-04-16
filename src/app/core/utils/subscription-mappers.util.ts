import { BillingEvent, Subscription } from '../models/subscription.model';

/**
 * DB row ↔ domain model converters for the billing tables.
 *
 * Lives in `@core/utils` (and not on either service) because both the
 * tenant-facing `SubscriptionService` and the operator-side
 * `PlatformAdminSubscriptionsService` need the exact same mapping.
 * Centralizing here keeps column additions (future Stripe fields etc.)
 * a one-file change.
 */

export const SUBSCRIPTION_COLUMNS = [
  'id',
  'tenant_id',
  'plan_id',
  'status',
  'trial_start_date',
  'trial_end_date',
  'current_period_start',
  'current_period_end',
  'cancel_at',
  'canceled_at',
  'external_customer_id',
  'external_subscription_id',
  'metadata',
  'created_at',
  'updated_at',
].join(', ');

export const BILLING_EVENT_COLUMNS =
  'id, tenant_id, subscription_id, event_type, metadata, created_at';

export function mapSubscriptionRow(row: unknown): Subscription {
  const r = row as Record<string, unknown>;
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    planId: (r['plan_id'] as string | null) ?? null,
    status: r['status'] as Subscription['status'],
    trialStartDate: (r['trial_start_date'] as string | null) ?? null,
    trialEndDate: (r['trial_end_date'] as string | null) ?? null,
    currentPeriodStart: (r['current_period_start'] as string | null) ?? null,
    currentPeriodEnd: (r['current_period_end'] as string | null) ?? null,
    cancelAt: (r['cancel_at'] as string | null) ?? null,
    canceledAt: (r['canceled_at'] as string | null) ?? null,
    externalCustomerId: (r['external_customer_id'] as string | null) ?? null,
    externalSubscriptionId:
      (r['external_subscription_id'] as string | null) ?? null,
    metadata: (r['metadata'] as Record<string, unknown>) ?? {},
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

export function mapBillingEventRow(row: unknown): BillingEvent {
  const r = row as Record<string, unknown>;
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    subscriptionId: (r['subscription_id'] as string | null) ?? null,
    eventType: r['event_type'] as BillingEvent['eventType'],
    metadata: (r['metadata'] as Record<string, unknown>) ?? {},
    createdAt: r['created_at'] as string,
  };
}
