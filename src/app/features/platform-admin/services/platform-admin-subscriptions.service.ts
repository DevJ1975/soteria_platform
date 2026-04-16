import { inject, Injectable } from '@angular/core';

import {
  BillingEventType,
  CreateSubscriptionPayload,
  Subscription,
  SubscriptionStatus,
  UpdateSubscriptionPayload,
} from '@core/models';
import { BillingEventsService } from '@core/services/billing-events.service';
import { SupabaseService } from '@core/services/supabase.service';
import {
  mapSubscriptionRow,
  SUBSCRIPTION_COLUMNS,
} from '@core/utils/subscription-mappers.util';

/** Default trial length when the admin UI hits "Start / restart trial". */
const TRIAL_DEFAULT_DAYS = 14;

/**
 * Cross-tenant subscription writes for the platform admin area.
 *
 * Why a separate service from `SubscriptionService`
 * -------------------------------------------------
 * Tenant-facing `SubscriptionService` is read-only and scoped to the
 * caller's own tenant. This service is the operator-side write surface
 * and deliberately skips any `.eq('tenant_id', …)` — RLS policies
 * (migration 120015 + the platform-admin-access policies from 120014)
 * allow cross-tenant visibility for `platform_admin` callers.
 *
 * Every write also emits a `billing_events` row so the audit trail is
 * maintained even when operators nudge state by hand. The underlying
 * DB triggers insert automatic events (`subscription_created`,
 * `trial_started`) for structural changes; this service handles the
 * "someone clicked a button" events.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAdminSubscriptionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly events = inject(BillingEventsService);

  /** Fetches the subscription for a tenant (there's exactly one). */
  async getByTenantId(tenantId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSubscriptionRow(data) : null;
  }

  /**
   * Creates a subscription. Used only for recovery (e.g., backfill
   * missed a tenant, or a deleted row needs to be restored). The
   * `tenants_create_subscription` trigger normally handles the happy
   * path at signup time.
   */
  async createSubscription(
    payload: CreateSubscriptionPayload,
  ): Promise<Subscription> {
    const row = {
      tenant_id: payload.tenantId,
      plan_id: payload.planId ?? null,
      status: payload.status ?? 'trialing',
      trial_start_date: payload.trialStartDate ?? null,
      trial_end_date: payload.trialEndDate ?? null,
      current_period_start: payload.currentPeriodStart ?? null,
      current_period_end: payload.currentPeriodEnd ?? null,
    };
    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .insert(row)
      .select(SUBSCRIPTION_COLUMNS)
      .single();
    if (error) throw error;
    const subscription = mapSubscriptionRow(data);
    await this.logEvent(subscription, 'subscription_created', {
      manual: true,
      status: subscription.status,
    });
    return subscription;
  }

  async updateSubscription(
    id: string,
    payload: UpdateSubscriptionPayload,
  ): Promise<Subscription> {
    const row = toSnakeCase(payload);
    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .update(row)
      .eq('id', id)
      .select(SUBSCRIPTION_COLUMNS)
      .single();
    if (error) throw error;
    return mapSubscriptionRow(data);
  }

  /**
   * Plan change with audit logging. Sort-order heuristic classifies
   * the change as upgrade / downgrade / sideways; imperfect but
   * adequate until explicit plan tiers are defined.
   */
  async changePlan(
    subscription: Subscription,
    newPlanId: string | null,
  ): Promise<Subscription> {
    if (newPlanId === subscription.planId) return subscription;

    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .update({ plan_id: newPlanId })
      .eq('id', subscription.id)
      .select(SUBSCRIPTION_COLUMNS)
      .single();
    if (error) throw error;
    const updated = mapSubscriptionRow(data);

    const eventType = await this.classifyPlanChange(
      subscription.planId,
      newPlanId,
    );
    await this.logEvent(updated, eventType, {
      previous_plan_id: subscription.planId,
      new_plan_id: newPlanId,
    });
    return updated;
  }

  /**
   * Starts (or restarts) a trial. Refuses to downgrade an already-
   * active paying subscription back into trial — that's almost never
   * what the operator means to do from a single-button UI, and it
   * loses the current_period_* state that Stripe will want later.
   * Callers can still bypass by using `updateSubscription()` directly
   * if the situation really warrants it.
   */
  async startTrial(
    subscription: Subscription,
    trialDays = TRIAL_DEFAULT_DAYS,
  ): Promise<Subscription> {
    if (subscription.status === 'active') {
      throw new Error(
        'Refusing to reset a trial on an active paying subscription. ' +
          'Cancel or downgrade first, then start the trial.',
      );
    }
    const now = new Date();
    const end = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .update({
        status: 'trialing',
        trial_start_date: now.toISOString(),
        trial_end_date: end.toISOString(),
        cancel_at: null,
        canceled_at: null,
      })
      .eq('id', subscription.id)
      .select(SUBSCRIPTION_COLUMNS)
      .single();
    if (error) throw error;
    const updated = mapSubscriptionRow(data);
    await this.logEvent(updated, 'trial_started', {
      trial_days: trialDays,
      trial_end_date: end.toISOString(),
      manual: true,
    });
    return updated;
  }

  /**
   * Cancels a subscription. Defaults to "cancel at end of current
   * period" semantics — access continues until `cancel_at`. Pass
   * `immediate: true` to terminate access right away.
   */
  async cancelSubscription(
    subscription: Subscription,
    options: { immediate?: boolean } = {},
  ): Promise<Subscription> {
    const now = new Date();
    const cancelAt = options.immediate
      ? now
      : subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : now;

    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .update({
        status: options.immediate ? 'inactive' : 'canceled',
        cancel_at: cancelAt.toISOString(),
        canceled_at: now.toISOString(),
      })
      .eq('id', subscription.id)
      .select(SUBSCRIPTION_COLUMNS)
      .single();
    if (error) throw error;
    const updated = mapSubscriptionRow(data);
    await this.logEvent(updated, 'subscription_canceled', {
      immediate: !!options.immediate,
      cancel_at: cancelAt.toISOString(),
    });
    return updated;
  }

  /**
   * Admin override: set the status to any value. Logs a
   * `status_changed` event with both the previous and new status for
   * traceability. Intended for support / recovery scenarios; day-to-
   * day transitions should go through the dedicated methods above.
   */
  async setStatus(
    subscription: Subscription,
    newStatus: SubscriptionStatus,
  ): Promise<Subscription> {
    if (newStatus === subscription.status) return subscription;

    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .update({ status: newStatus })
      .eq('id', subscription.id)
      .select(SUBSCRIPTION_COLUMNS)
      .single();
    if (error) throw error;
    const updated = mapSubscriptionRow(data);
    await this.logEvent(updated, 'status_changed', {
      previous_status: subscription.status,
      new_status: newStatus,
      admin_override: true,
    });
    return updated;
  }

  private async classifyPlanChange(
    previousPlanId: string | null,
    newPlanId: string | null,
  ): Promise<BillingEventType> {
    if (!previousPlanId || !newPlanId) return 'plan_changed';
    const { data, error } = await this.supabase.client
      .from('subscription_plans')
      .select('id, sort_order')
      .in('id', [previousPlanId, newPlanId]);
    if (error || !data) return 'plan_changed';
    const prev = data.find((p) => p['id'] === previousPlanId);
    const next = data.find((p) => p['id'] === newPlanId);
    if (!prev || !next) return 'plan_changed';
    const prevOrder = prev['sort_order'] as number;
    const nextOrder = next['sort_order'] as number;
    if (nextOrder > prevOrder) return 'plan_upgraded';
    if (nextOrder < prevOrder) return 'plan_downgraded';
    return 'plan_changed';
  }

  private logEvent(
    subscription: Subscription,
    eventType: BillingEventType,
    metadata: Record<string, unknown>,
  ): Promise<unknown> {
    return this.events.logEvent({
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      eventType,
      metadata,
    });
  }
}

function toSnakeCase(payload: UpdateSubscriptionPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (payload.planId !== undefined) out['plan_id'] = payload.planId;
  if (payload.status !== undefined) out['status'] = payload.status;
  if (payload.trialStartDate !== undefined) out['trial_start_date'] = payload.trialStartDate;
  if (payload.trialEndDate !== undefined) out['trial_end_date'] = payload.trialEndDate;
  if (payload.currentPeriodStart !== undefined) out['current_period_start'] = payload.currentPeriodStart;
  if (payload.currentPeriodEnd !== undefined) out['current_period_end'] = payload.currentPeriodEnd;
  if (payload.cancelAt !== undefined) out['cancel_at'] = payload.cancelAt;
  if (payload.canceledAt !== undefined) out['canceled_at'] = payload.canceledAt;
  if (payload.externalCustomerId !== undefined) out['external_customer_id'] = payload.externalCustomerId;
  if (payload.externalSubscriptionId !== undefined) out['external_subscription_id'] = payload.externalSubscriptionId;
  if (payload.metadata !== undefined) out['metadata'] = payload.metadata;
  return out;
}
