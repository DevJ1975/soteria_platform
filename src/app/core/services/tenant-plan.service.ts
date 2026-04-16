import { inject, Injectable } from '@angular/core';

import { ModuleKey } from '../models';
import { TenantModuleOverride } from '../models/subscription-plan.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/**
 * Per-tenant plan + override management.
 *
 * Mutating methods here change data that drives the whole app's module
 * access (sidebar, route guards). After a successful call the caller is
 * responsible for telling `ModuleRegistryService.refresh()` to re-resolve
 * — we don't do it implicitly because not every caller wants the reactive
 * refresh to fire before they're done with a batch of updates.
 */
@Injectable({ providedIn: 'root' })
export class TenantPlanService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** Returns the tenant's current `plan_id`, or null if unset. */
  async getTenantPlanId(tenantId?: string): Promise<string | null> {
    const id = tenantId ?? this.auth.tenantId();
    if (!id) return null;
    const { data, error } = await this.supabase.client
      .from('tenants')
      .select('plan_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data?.['plan_id'] as string | null) ?? null;
  }

  /**
   * @deprecated Since Phase 12 the `subscriptions` table is the source of
   * truth for plan assignment — writing directly to `tenants.plan_id` is
   * overwritten by the `sync_tenant_plan_from_subscription` trigger on
   * the next subscription update. Prefer
   * `PlatformAdminSubscriptionsService.changePlan()` for operator
   * flows; tenant self-serve plan change isn't available until
   * Stripe-gated billing ships.
   *
   * Left in place to support ad-hoc platform-admin scripts that need
   * to bypass the subscription path (e.g., tests, data migrations).
   */
  async updateTenantPlan(tenantId: string, planId: string | null): Promise<void> {
    const { error } = await this.supabase.client
      .from('tenants')
      .update({ plan_id: planId })
      .eq('id', tenantId);
    if (error) throw error;
  }

  /** Returns all explicit module overrides for a tenant. */
  async getTenantModuleOverrides(tenantId?: string): Promise<TenantModuleOverride[]> {
    const id = tenantId ?? this.auth.tenantId();
    if (!id) return [];
    const { data, error } = await this.supabase.client
      .from('tenant_modules')
      .select('id, tenant_id, module_key, is_enabled, config, created_at, updated_at')
      .eq('tenant_id', id);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      moduleKey: r['module_key'] as ModuleKey,
      isEnabled: r['is_enabled'] as boolean,
      config: (r['config'] as Record<string, unknown>) ?? {},
      createdAt: r['created_at'] as string,
      updatedAt: r['updated_at'] as string,
    }));
  }

  /**
   * Sets an explicit override for (tenant × module). `is_enabled = true`
   * force-enables; `false` force-disables; passing `null` removes the
   * override so plan default kicks back in.
   */
  async setTenantModuleOverride(
    tenantId: string,
    moduleKey: ModuleKey,
    isEnabled: boolean | null,
  ): Promise<void> {
    if (isEnabled === null) {
      const { error } = await this.supabase.client
        .from('tenant_modules')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('module_key', moduleKey);
      if (error) throw error;
      return;
    }

    // Upsert — one row per (tenant, module) thanks to the table's
    // unique constraint.
    const { error } = await this.supabase.client
      .from('tenant_modules')
      .upsert(
        {
          tenant_id: tenantId,
          module_key: moduleKey,
          is_enabled: isEnabled,
        },
        { onConflict: 'tenant_id,module_key' },
      );
    if (error) throw error;
  }
}
