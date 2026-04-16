import { inject, Injectable } from '@angular/core';

import { ModuleKey } from '../models';
import {
  SubscriptionPlan,
  SubscriptionPlanModule,
} from '../models/subscription-plan.model';
import { SupabaseService } from './supabase.service';

/**
 * Read-only access to the platform subscription-plan catalogue and the
 * plan→module mapping. Plans are defined via migration, not mutated at
 * runtime, so there are no create/update/delete methods. RLS on the
 * underlying tables makes them readable by any authenticated user.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionPlansService {
  private readonly supabase = inject(SupabaseService);

  async getPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await this.supabase.client
      .from('subscription_plans')
      .select('id, key, name, description, sort_order, is_active, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPlanRow);
  }

  async getPlanById(id: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await this.supabase.client
      .from('subscription_plans')
      .select('id, key, name, description, sort_order, is_active, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapPlanRow(data) : null;
  }

  /**
   * Returns the module keys included in a plan's default set. Shape-
   * friendly for union-into-Set usage in access resolution.
   */
  async getPlanModuleKeys(planId: string): Promise<readonly ModuleKey[]> {
    const { data, error } = await this.supabase.client
      .from('subscription_plan_modules')
      .select('module_key')
      .eq('plan_id', planId);
    if (error) throw error;
    return (data ?? []).map((r) => r.module_key as ModuleKey);
  }

  /** Full join rows — useful for admin UIs enumerating plan ↔ module links. */
  async getPlanModules(planId: string): Promise<SubscriptionPlanModule[]> {
    const { data, error } = await this.supabase.client
      .from('subscription_plan_modules')
      .select('id, plan_id, module_key, created_at')
      .eq('plan_id', planId);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r['id'] as string,
      planId: r['plan_id'] as string,
      moduleKey: r['module_key'] as ModuleKey,
      createdAt: r['created_at'] as string,
    }));
  }
}

function mapPlanRow(row: Record<string, unknown>): SubscriptionPlan {
  return {
    id: row['id'] as string,
    key: row['key'] as SubscriptionPlan['key'],
    name: row['name'] as string,
    description: (row['description'] as string) ?? '',
    sortOrder: (row['sort_order'] as number) ?? 0,
    isActive: (row['is_active'] as boolean) ?? true,
    createdAt: row['created_at'] as string,
  };
}
