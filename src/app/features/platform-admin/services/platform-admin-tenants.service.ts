import { inject, Injectable } from '@angular/core';

import { Tenant } from '@core/models';
import { SupabaseService } from '@core/services/supabase.service';

import {
  CreateTenantPayload,
  TenantSummary,
  UpdateTenantPayload,
} from '../models/platform-admin.model';

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
    // Embedded select pulls the plan's name alongside each tenant, so
    // the list page doesn't N+1 a plan lookup per row.
    const { data, error } = await this.supabase.client
      .from('tenants')
      .select(
        'id, name, slug, status, plan_id, created_at, updated_at, plan:subscription_plans(name)',
      )
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((r) => {
      // PostgREST embeds can come back as an object *or* an array
      // (depending on relationship metadata). Handle both: we asked
      // for a single-parent `plan` so we only care about the first.
      const planField = r['plan'] as
        | { name: string }
        | { name: string }[]
        | null
        | undefined;
      const plan = Array.isArray(planField) ? planField[0] : planField;
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
    });
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    const { data, error } = await this.supabase.client
      .from('tenants')
      .select('id, name, slug, status, plan_id, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: data['id'] as string,
          name: data['name'] as string,
          slug: data['slug'] as string,
          status: (data['status'] as Tenant['status']) ?? 'active',
          planId: (data['plan_id'] as string | null) ?? null,
          createdAt: data['created_at'] as string,
          updatedAt: data['updated_at'] as string,
        }
      : null;
  }

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
    return {
      id: data['id'] as string,
      name: data['name'] as string,
      slug: data['slug'] as string,
      status: data['status'] as Tenant['status'],
      planId: (data['plan_id'] as string | null) ?? null,
      createdAt: data['created_at'] as string,
      updatedAt: data['updated_at'] as string,
    };
  }

  async updateTenant(id: string, payload: UpdateTenantPayload): Promise<Tenant> {
    const row: Record<string, unknown> = {};
    if (payload.name !== undefined) row['name'] = payload.name;
    if (payload.slug !== undefined) row['slug'] = payload.slug;
    if (payload.planId !== undefined) row['plan_id'] = payload.planId;
    if (payload.status !== undefined) row['status'] = payload.status;

    const { data, error } = await this.supabase.client
      .from('tenants')
      .update(row)
      .eq('id', id)
      .select('id, name, slug, status, plan_id, created_at, updated_at')
      .single();
    if (error) throw error;
    return {
      id: data['id'] as string,
      name: data['name'] as string,
      slug: data['slug'] as string,
      status: data['status'] as Tenant['status'],
      planId: (data['plan_id'] as string | null) ?? null,
      createdAt: data['created_at'] as string,
      updatedAt: data['updated_at'] as string,
    };
  }

  async assignTenantPlan(tenantId: string, planId: string | null): Promise<void> {
    const { error } = await this.supabase.client
      .from('tenants')
      .update({ plan_id: planId })
      .eq('id', tenantId);
    if (error) throw error;
  }

  /** Quick platform-level metric: how many tenants exist. */
  async getCount(): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('tenants')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }

  /** Most-recent tenants for the platform dashboard. */
  async getRecent(limit = 5): Promise<TenantSummary[]> {
    const all = await this.getTenants();
    return all.slice(0, limit);
  }
}
