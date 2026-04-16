import { inject, Injectable } from '@angular/core';

import { ModuleKey, SubscriptionPlan } from '@core/models';
import { SupabaseService } from '@core/services/supabase.service';

import {
  CreateSubscriptionPlanPayload,
  UpdateSubscriptionPlanPayload,
} from '../models/platform-admin.model';

const PLAN_COLUMNS =
  'id, key, name, description, sort_order, is_active, stripe_price_id, created_at';

/**
 * Mutating access to `subscription_plans` for the platform admin area.
 *
 * The tenant-facing `SubscriptionPlansService` is read-only; this
 * service adds create/update/delete. RLS policy
 * `subscription_plans_write_by_platform_admin` refuses writes from
 * non-platform-admins at the DB level.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAdminPlansService {
  private readonly supabase = inject(SupabaseService);

  async getPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await this.supabase.client
      .from('subscription_plans')
      .select(PLAN_COLUMNS)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getPlanById(id: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await this.supabase.client
      .from('subscription_plans')
      .select(PLAN_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async getPlanModuleKeys(planId: string): Promise<readonly ModuleKey[]> {
    const { data, error } = await this.supabase.client
      .from('subscription_plan_modules')
      .select('module_key')
      .eq('plan_id', planId);
    if (error) throw error;
    return (data ?? []).map((r) => r['module_key'] as ModuleKey);
  }

  async createPlan(payload: CreateSubscriptionPlanPayload): Promise<SubscriptionPlan> {
    const { data, error } = await this.supabase.client
      .from('subscription_plans')
      .insert({
        key: payload.key,
        name: payload.name,
        description: payload.description ?? '',
        sort_order: payload.sortOrder ?? 0,
        is_active: payload.isActive ?? true,
        stripe_price_id: payload.stripePriceId ?? null,
      })
      .select(PLAN_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async updatePlan(
    id: string,
    payload: UpdateSubscriptionPlanPayload,
  ): Promise<SubscriptionPlan> {
    const row: Record<string, unknown> = {};
    if (payload.name !== undefined) row['name'] = payload.name;
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.sortOrder !== undefined) row['sort_order'] = payload.sortOrder;
    if (payload.isActive !== undefined) row['is_active'] = payload.isActive;
    // Empty-string inputs from the admin form mean "clear mapping"; store
    // as null so the `stripe_price_id IS NOT NULL` index stays tight.
    if (payload.stripePriceId !== undefined) {
      row['stripe_price_id'] =
        payload.stripePriceId?.trim() ? payload.stripePriceId.trim() : null;
    }

    const { data, error } = await this.supabase.client
      .from('subscription_plans')
      .update(row)
      .eq('id', id)
      .select(PLAN_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  /**
   * Replace a plan's module membership with the given set. Does its own
   * diff against the current rows so we only insert or delete what
   * actually changed — avoids needlessly bumping `created_at` for
   * unchanged rows and keeps history useful.
   */
  async setPlanModules(
    planId: string,
    moduleKeys: readonly ModuleKey[],
  ): Promise<void> {
    const current = new Set(await this.getPlanModuleKeys(planId));
    const desired = new Set(moduleKeys);

    const toAdd = [...desired].filter((k) => !current.has(k));
    const toRemove = [...current].filter((k) => !desired.has(k));

    if (toAdd.length > 0) {
      const { error } = await this.supabase.client
        .from('subscription_plan_modules')
        .insert(toAdd.map((k) => ({ plan_id: planId, module_key: k })));
      if (error) throw error;
    }

    if (toRemove.length > 0) {
      const { error } = await this.supabase.client
        .from('subscription_plan_modules')
        .delete()
        .eq('plan_id', planId)
        .in('module_key', toRemove);
      if (error) throw error;
    }
  }

  /** Quick platform-level metric for the admin dashboard. */
  async getCount(): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('subscription_plans')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }
}

function mapRow(row: Record<string, unknown>): SubscriptionPlan {
  return {
    id: row['id'] as string,
    key: row['key'] as SubscriptionPlan['key'],
    name: row['name'] as string,
    description: (row['description'] as string) ?? '',
    sortOrder: (row['sort_order'] as number) ?? 0,
    isActive: (row['is_active'] as boolean) ?? true,
    stripePriceId: (row['stripe_price_id'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
  };
}
