import { computed, inject, Injectable, signal } from '@angular/core';

import { Subscription } from '../models/subscription.model';
import {
  canAccessPlatform,
  getRemainingTrialDays,
  isSubscriptionHealthy,
  isTrialExpired,
} from '../utils/subscription-access.util';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/**
 * Tenant-scoped subscription reads + reactive access signals.
 *
 * Writes don't live here — the tenant app cannot modify billing data
 * (RLS enforces that at the DB level and this surface doesn't expose
 * mutation methods). For operator-side mutations, see
 * `PlatformAdminSubscriptionsService`.
 *
 * The service holds a cached `current` signal that's loaded once on
 * sign-in (and refreshable on demand) so the billing guard and the
 * billing page can read subscription state synchronously from
 * templates and `CanActivate` functions without each path issuing its
 * own query.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _current = signal<Subscription | null>(null);
  private readonly _loaded = signal(false);

  readonly current = this._current.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  readonly hasAccess = computed(() => canAccessPlatform(this._current()));
  readonly remainingTrialDays = computed(() =>
    getRemainingTrialDays(this._current()),
  );
  readonly trialExpired = computed(() => isTrialExpired(this._current()));
  readonly isHealthy = computed(() => isSubscriptionHealthy(this._current()));

  /**
   * Loads the current tenant's subscription and caches it in the
   * `current` signal. Safe to call multiple times; a null `tenantId`
   * clears the cache so stale state doesn't leak across sign-out.
   */
  async refresh(): Promise<Subscription | null> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) {
      this._current.set(null);
      this._loaded.set(true);
      return null;
    }
    const sub = await this.getTenantSubscription(tenantId);
    this._current.set(sub);
    this._loaded.set(true);
    return sub;
  }

  /**
   * Fetches the subscription row for a given tenant. Callers that just
   * need the currently-signed-in tenant's state should read `current()`
   * after calling `refresh()` instead of invoking this directly.
   */
  async getTenantSubscription(tenantId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  /**
   * Convenience for "is the current user's tenant currently in an
   * active trial?". Used by the billing page and future in-product
   * nudges.
   */
  isTrialActive(): boolean {
    const sub = this._current();
    return !!sub && sub.status === 'trialing' && !isTrialExpired(sub);
  }

  /**
   * Convenience for "is the current subscription in a state where the
   * product should be fully functional?". Distinct from `hasAccess()`
   * — `past_due` has access but isn't fully healthy.
   */
  isSubscriptionActive(): boolean {
    return this.isHealthy();
  }
}

const SUBSCRIPTION_COLUMNS = [
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

function mapRow(row: unknown): Subscription {
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

/** Shared mapper so PlatformAdminSubscriptionsService doesn't duplicate. */
export const mapSubscriptionRow = mapRow;
export const SUBSCRIPTION_SELECT_COLUMNS = SUBSCRIPTION_COLUMNS;
