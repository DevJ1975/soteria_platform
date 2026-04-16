import { inject, Injectable } from '@angular/core';

import { Tenant } from '@core/models';
import { SupabaseService } from '@core/services/supabase.service';
import { firstEmbedded } from '@shared/utils/postgrest.util';

import {
  CreateTenantPayload,
  TenantSummary,
  UpdateTenantPayload,
} from '../models/platform-admin.model';

/** Columns plus the embedded plan name; keep in one place so the list
 *  and "recent" methods don't drift. */
const TENANT_SUMMARY_SELECT =
  'id, name, slug, status, plan_id, created_at, updated_at, plan:subscription_plans(name)';

/**
 * Cross-tenant tenant management for the platform admin area.
 *
 * Why it's separate from `TenantService`
 * --------------------------------------
 * Tenant-facing services (`TenantService`, every module service) add
 * `.eq('tenant_id', …)` defensively so the client surface is explicit
 * about scope. The admin service deliberately skips that filter — it
 * wants the cross-tenant visibility RLS permits for `platform_admin`
 * callers. Two different intents, two different surfaces.
 *
 * Authorization is enforced by the RLS policies added in migration
 * 120014. If a non-platform-admin somehow reaches these methods (they
 * shouldn't — the route guard blocks them), the DB returns empty
 * selects and refuses writes.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAdminTenantsService {
  private readonly supabase = inject(SupabaseService);

  async getTenants(): Promise<TenantSummary[]> {
    const { data, error } = await this.supabase.client
      .from('tenants')
      .select(TENANT_SUMMARY_SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapSummaryRow);
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    const { data, error } = await this.supabase.client
      .from('tenants')
      .select('id, name, slug, status, plan_id, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapTenantRow(data) : null;
  }

  /**
   * Creates a tenant. The `tenants_create_subscription` trigger
   * automatically provisions a trialing subscription row + billing
   * events on insert — no manual subscription handling needed here.
   *
   * `planId` on the create payload is the *initial* plan the trial
   * runs against. Subsequent plan changes go through
   * `PlatformAdminSubscriptionsService.changePlan`.
   */
  async createTenant(payload: CreateTenantPayload): Promise<Tenant> {
    const { data, error } = await this.supabase.client
      .from('tenants')
      .insert({
        name: payload.name,
        slug: payload.slug,
        plan_id: payload.planId ?? null,
        status: payload.status ?? 'trial',
      })
      .select('id, name, slug, status, plan_id, created_at, updated_at')
      .single();
    if (error) throw error;
    return mapTenantRow(data);
  }

  /**
   * Updates tenant identity fields (name, slug, status). Does **not**
   * accept `planId` — plan assignment is owned by
   * `PlatformAdminSubscriptionsService` since Phase 12, because
   * `subscriptions.plan_id` is the source of truth and a direct write
   * to `tenants.plan_id` gets overwritten on the next subscription
   * update by the `sync_tenant_plan_from_subscription` trigger.
   */
  async updateTenant(id: string, payload: UpdateTenantPayload): Promise<Tenant> {
    const row: Record<string, unknown> = {};
    if (payload.name !== undefined) row['name'] = payload.name;
    if (payload.slug !== undefined) row['slug'] = payload.slug;
    if (payload.status !== undefined) row['status'] = payload.status;

    const { data, error } = await this.supabase.client
      .from('tenants')
      .update(row)
      .eq('id', id)
      .select('id, name, slug, status, plan_id, created_at, updated_at')
      .single();
    if (error) throw error;
    return mapTenantRow(data);
  }

  /** Quick platform-level metric: how many tenants exist. */
  async getCount(): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('tenants')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Most-recent tenants for the platform dashboard. Applies `.limit()`
   * at the DB so we don't pull the whole tenant table for a 5-row card.
   */
  async getRecent(limit = 5): Promise<TenantSummary[]> {
    const { data, error } = await this.supabase.client
      .from('tenants')
      .select(TENANT_SUMMARY_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapSummaryRow);
  }
}

function mapSummaryRow(row: unknown): TenantSummary {
  const r = row as Record<string, unknown>;
  const plan = firstEmbedded<{ name: string }>(r['plan']);
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    slug: r['slug'] as string,
    status: r['status'] as TenantSummary['status'],
    planId: (r['plan_id'] as string | null) ?? null,
    planName: plan?.name ?? null,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapTenantRow(row: unknown): Tenant {
  const r = row as Record<string, unknown>;
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    slug: r['slug'] as string,
    status: (r['status'] as Tenant['status']) ?? 'active',
    planId: (r['plan_id'] as string | null) ?? null,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}
