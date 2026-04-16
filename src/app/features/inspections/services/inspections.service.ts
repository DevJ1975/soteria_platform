import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';
import { escapeIlikePattern } from '@shared/utils/errors.util';

import {
  CreateInspectionPayload,
  Inspection,
  InspectionFilters,
  UpdateInspectionPayload,
} from '../models/inspection.model';

/**
 * Data access for `public.inspections`.
 *
 * Tenant isolation strategy
 * -------------------------
 * Two layers guard cross-tenant access:
 *   1. **RLS policies** in Supabase enforce it at the DB. This is the
 *      authoritative layer — if the client is compromised, it still can't
 *      read another tenant's rows.
 *   2. **Explicit `.eq('tenant_id', …)`** filters here. Purely defensive.
 *      They make intent obvious at every call site and mean a misconfigured
 *      RLS policy can't silently leak rows through this service.
 *
 * The service ALSO fills `tenant_id` and `created_by` from AuthService on
 * insert so the form can't forge them — the DB policy still rejects forged
 * rows, but failing client-side first gives a clearer error.
 */
@Injectable({ providedIn: 'root' })
export class InspectionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** List inspections for the current tenant, optionally filtered. */
  async getInspections(filters: InspectionFilters = {}): Promise<Inspection[]> {
    const tenantId = this.requireTenantId();

    let query = this.supabase.client
      .from('inspections')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.priority && filters.priority !== 'all') {
      query = query.eq('priority', filters.priority);
    }
    if (filters.assignedTo === 'me') {
      const userId = this.auth.session()?.user.id;
      if (userId) query = query.eq('assigned_to', userId);
    } else if (filters.assignedTo && filters.assignedTo !== 'all') {
      query = query.eq('assigned_to', filters.assignedTo);
    }
    if (filters.searchText?.trim()) {
      // Escape `%` and `_` so the user's text matches literally — otherwise
      // "50%" would behave like a wildcard.
      const pattern = escapeIlikePattern(filters.searchText.trim());
      query = query.ilike('title', `%${pattern}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getInspectionById(id: string): Promise<Inspection | null> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('inspections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async createInspection(payload: CreateInspectionPayload): Promise<Inspection> {
    const tenantId = this.requireTenantId();
    const userId = this.auth.session()?.user.id;
    if (!userId) throw new Error('Not authenticated.');

    // Business rule: if the caller created this inspection already marked
    // complete, stamp the completed_at at submit time so we don't lose the
    // audit trail. Only fill when not explicitly provided.
    const completedAt =
      payload.status === 'completed' ? new Date().toISOString() : null;

    const row = {
      tenant_id: tenantId,
      created_by: userId,
      title: payload.title,
      description: payload.description ?? '',
      inspection_type: payload.inspectionType,
      status: payload.status ?? 'draft',
      priority: payload.priority,
      assigned_to: payload.assignedTo ?? null,
      due_date: payload.dueDate ?? null,
      site_id: payload.siteId ?? null,
      completed_at: completedAt,
    };

    const { data, error } = await this.supabase.client
      .from('inspections')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async updateInspection(
    id: string,
    payload: UpdateInspectionPayload,
  ): Promise<Inspection> {
    const tenantId = this.requireTenantId();

    // Build a sparse row: only send what the caller explicitly set. Using
    // `undefined` as the "don't touch" sentinel preserves PATCH semantics.
    const row: Record<string, unknown> = {};
    if (payload.title !== undefined) row['title'] = payload.title;
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.inspectionType !== undefined) row['inspection_type'] = payload.inspectionType;
    if (payload.status !== undefined) row['status'] = payload.status;
    if (payload.priority !== undefined) row['priority'] = payload.priority;
    if (payload.assignedTo !== undefined) row['assigned_to'] = payload.assignedTo;
    if (payload.dueDate !== undefined) row['due_date'] = payload.dueDate;
    if (payload.completedAt !== undefined) row['completed_at'] = payload.completedAt;
    if (payload.siteId !== undefined) row['site_id'] = payload.siteId;

    // Derive completed_at from status transitions unless the caller set it
    // explicitly. Moving TO completed stamps now; moving AWAY from completed
    // clears the timestamp so stale values don't stick around.
    if (payload.status !== undefined && payload.completedAt === undefined) {
      row['completed_at'] =
        payload.status === 'completed' ? new Date().toISOString() : null;
    }

    const { data, error } = await this.supabase.client
      .from('inspections')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async deleteInspection(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    const { error } = await this.supabase.client
      .from('inspections')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throw error;
  }

  private requireTenantId(): string {
    const id = this.auth.tenantId();
    if (!id) throw new Error('Not authenticated or missing tenant context.');
    return id;
  }
}

function mapRow(row: Record<string, unknown>): Inspection {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    siteId: (row['site_id'] as string | null) ?? null,
    title: row['title'] as string,
    description: (row['description'] as string) ?? '',
    inspectionType: row['inspection_type'] as Inspection['inspectionType'],
    status: row['status'] as Inspection['status'],
    priority: row['priority'] as Inspection['priority'],
    assignedTo: (row['assigned_to'] as string | null) ?? null,
    dueDate: (row['due_date'] as string | null) ?? null,
    completedAt: (row['completed_at'] as string | null) ?? null,
    createdBy: row['created_by'] as string,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
