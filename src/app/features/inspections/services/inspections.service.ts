import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';

import {
  CreateInspectionPayload,
  Inspection,
  InspectionFilters,
  UpdateInspectionPayload,
} from '../models/inspection.model';

/**
 * Data access for `public.inspections`.
 *
 * Everything here goes through RLS, so:
 *  - selects are automatically tenant-scoped (no need to add .eq on tenant_id)
 *  - inserts must include tenant_id + created_by — we fill those in from the
 *    current AuthService state rather than trusting the caller to pass them
 *  - updates/deletes that touch other tenants simply return 0 rows
 *
 * The service never throws null/undefined errors on auth — if `tenantId` is
 * missing we surface a clear error so the UI can redirect to sign-in.
 */
@Injectable({ providedIn: 'root' })
export class InspectionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** List inspections for the current tenant, optionally filtered. */
  async getInspections(filters: InspectionFilters = {}): Promise<Inspection[]> {
    let query = this.supabase.client
      .from('inspections')
      .select('*')
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
    if (filters.searchText) {
      // Supabase ilike wants %-wrapped. Simple title search is enough for now;
      // a full-text index can replace this when the dataset grows.
      query = query.ilike('title', `%${filters.searchText}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getInspectionById(id: string): Promise<Inspection | null> {
    const { data, error } = await this.supabase.client
      .from('inspections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async createInspection(payload: CreateInspectionPayload): Promise<Inspection> {
    const tenantId = this.auth.tenantId();
    const userId = this.auth.session()?.user.id;
    if (!tenantId || !userId) {
      throw new Error('Not authenticated or missing tenant context.');
    }

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
    // Build a sparse row so we only send the fields the caller actually set.
    // Using `undefined` as the "don't touch" sentinel keeps PATCH semantics.
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

    const { data, error } = await this.supabase.client
      .from('inspections')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async deleteInspection(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('inspections')
      .delete()
      .eq('id', id);
    if (error) throw error;
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
