import { computed, inject, Injectable, signal } from '@angular/core';

import { Subscription } from '../models/subscription.model';
import {
  canAccessPlatform,
  getRemainingTrialDays,
  isSubscriptionHealthy,
  isTrialExpired,
} from '../utils/subscription-access.util';
import {
  mapSubscriptionRow,
  SUBSCRIPTION_COLUMNS,
} from '../utils/subscription-mappers.util';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/**
 * Tenant-scoped subscription reads + reactive access signals.
 *
 * Writes don't live here — the tenant app cannot modify billing data
 * (RLS enforces this at the DB level and this surface doesn't expose
 * mutation methods). For operator-side mutations, see
 * `PlatformAdminSubscriptionsService`.
 *
 * Caching + concurrency
 * ---------------------
 * The service holds a cached `current` signal loaded once on sign-in
 * and refreshable on demand. `refresh()` uses a monotonic generation
 * counter so that out-of-order responses (e.g. shell bootstrap and
 * `billingAccessGuard` both calling refresh near each other) can't
 * overwrite a newer result with a staler one.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _current = signal<Subscription | null>(null);
  private readonly _loaded = signal(false);
  /** Monotonic sequence for discarding stale concurrent responses. */
  private refreshGeneration = 0;

  readonly current = this._current.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  readonly hasAccess = computed(() => canAccessPlatform(this._current()));
  readonly remainingTrialDays = computed(() =>
    getRemainingTrialDays(this._current()),
  );
  readonly trialExpired = computed(() => isTrialExpired(this._current()));
  /** True when status is `active` or `trialing` — i.e. the subscription
   *  is in a "fully functional" state (not past_due, not winding down). */
  readonly isHealthy = computed(() => isSubscriptionHealthy(this._current()));

  /**
   * Loads the current tenant's subscription and caches it. Safe to
   * call multiple times; only the latest-generation response wins.
   */
  async refresh(): Promise<Subscription | null> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) {
      this._current.set(null);
      this._loaded.set(true);
      return null;
    }
    const generation = ++this.refreshGeneration;
    const sub = await this.getTenantSubscription(tenantId);
    // Drop the result if a newer refresh started while we were
    // fetching — its write will land later with fresher data.
    if (generation !== this.refreshGeneration) return this._current();
    this._current.set(sub);
    this._loaded.set(true);
    return sub;
  }

  /**
   * Fetches the subscription row for a given tenant. Callers that
   * just need the currently-signed-in tenant's state should read
   * `current()` after `refresh()` instead of invoking this directly.
   */
  async getTenantSubscription(tenantId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase.client
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSubscriptionRow(data) : null;
  }

  /** Tenant is in a non-expired trial. */
  isTrialActive(): boolean {
    const sub = this._current();
    return !!sub && sub.status === 'trialing' && !isTrialExpired(sub);
  }

  /**
   * Alias of `isHealthy()` — kept on the service surface because the
   * Phase 12 spec calls it out explicitly. New code should prefer the
   * `isHealthy` signal for templates and the function form for logic.
   */
  isSubscriptionActive(): boolean {
    return this.isHealthy();
  }
}
