import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';
import { escapeIlikePattern } from '@shared/utils/errors.util';

import {
  CorrectiveAction,
  CorrectiveActionFilters,
  CorrectiveActionStatus,
  CreateCorrectiveActionPayload,
  OPEN_CORRECTIVE_ACTION_STATUSES,
  UpdateCorrectiveActionPayload,
} from '../models/corrective-action.model';

/**
 * Data access for `public.corrective_actions`.
 *
 * Tenant isolation follows the same two-layer pattern as InspectionsService:
 *  1. RLS policies are the authoritative enforcement layer.
 *  2. Every query ALSO carries an explicit `.eq('tenant_id', …)` — defense
 *     in depth plus self-documenting intent at the call site.
 *
 * Joins: the list and panel queries embed the linked inspection's `id`
 * and `title` in a single round-trip via PostgREST's `select=… , join(…)`
 * syntax. The mapper lifts the embedded row into `linkedInspection`.
 */
@Injectable({ providedIn: 'root' })
export class CorrectiveActionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** Columns we always select, including the embedded inspection join. */
  private readonly SELECT_WITH_INSPECTION =
    '*, linked_inspection:inspections!corrective_actions_inspection_id_fkey(id, title)';

  async getCorrectiveActions(
    filters: CorrectiveActionFilters = {},
  ): Promise<CorrectiveAction[]> {
    const tenantId = this.requireTenantId();

    let query = this.supabase.client
      .from('corrective_actions')
      .select(this.SELECT_WITH_INSPECTION)
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
    if (filters.inspectionId !== undefined) {
      query =
        filters.inspectionId === null
          ? query.is('inspection_id', null)
          : query.eq('inspection_id', filters.inspectionId);
    }
    if (filters.searchText?.trim()) {
      const pattern = escapeIlikePattern(filters.searchText.trim());
      query = query.ilike('title', `%${pattern}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getCorrectiveActionById(id: string): Promise<CorrectiveAction | null> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('corrective_actions')
      .select(this.SELECT_WITH_INSPECTION)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  /** Returns all actions linked to one inspection, newest first. */
  async getCorrectiveActionsByInspection(
    inspectionId: string,
  ): Promise<CorrectiveAction[]> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('corrective_actions')
      .select(this.SELECT_WITH_INSPECTION)
      .eq('tenant_id', tenantId)
      .eq('inspection_id', inspectionId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  /**
   * Counts open actions linked to one inspection. Shaped for the future
   * "X open actions" badge on the inspections list; cheap because of the
   * partial index on `inspection_id`.
   */
  async getOpenCountByInspection(inspectionId: string): Promise<number> {
    const tenantId = this.requireTenantId();
    const { count, error } = await this.supabase.client
      .from('corrective_actions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('inspection_id', inspectionId)
      .in('status', [...OPEN_CORRECTIVE_ACTION_STATUSES]);
    if (error) throw error;
    return count ?? 0;
  }

  async createCorrectiveAction(
    payload: CreateCorrectiveActionPayload,
  ): Promise<CorrectiveAction> {
    const tenantId = this.requireTenantId();
    const userId = this.auth.session()?.user.id;
    if (!userId) throw new Error('Not authenticated.');

    // If the caller creates an action already in a terminal state, stamp
    // completed_at so the audit trail is right. `verified` gets a stamp
    // too — at creation time there's no prior "completed" timestamp to
    // preserve, so "now" is the best we have.
    const autoCompletedAt = isTerminal(payload.status)
      ? new Date().toISOString()
      : null;

    const row = {
      tenant_id: tenantId,
      created_by: userId,
      inspection_id: payload.inspectionId ?? null,
      title: payload.title,
      description: payload.description ?? '',
      status: payload.status ?? 'open',
      priority: payload.priority,
      assigned_to: payload.assignedTo ?? null,
      due_date: payload.dueDate ?? null,
      completed_at: autoCompletedAt,
    };

    const { data, error } = await this.supabase.client
      .from('corrective_actions')
      .insert(row)
      .select(this.SELECT_WITH_INSPECTION)
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async updateCorrectiveAction(
    id: string,
    payload: UpdateCorrectiveActionPayload,
  ): Promise<CorrectiveAction> {
    const tenantId = this.requireTenantId();

    const row: Record<string, unknown> = {};
    if (payload.title !== undefined) row['title'] = payload.title;
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.status !== undefined) row['status'] = payload.status;
    if (payload.priority !== undefined) row['priority'] = payload.priority;
    if (payload.inspectionId !== undefined) row['inspection_id'] = payload.inspectionId;
    if (payload.assignedTo !== undefined) row['assigned_to'] = payload.assignedTo;
    if (payload.dueDate !== undefined) row['due_date'] = payload.dueDate;
    if (payload.completedAt !== undefined) row['completed_at'] = payload.completedAt;

    // Derive completed_at from status transitions unless the caller set
    // it explicitly. Rules:
    //   - TO 'completed'  → stamp now()
    //   - TO 'verified'   → leave existing completed_at untouched, so
    //                       completed→verified preserves the original
    //                       completion time instead of overwriting it
    //                       with the (later) verification time.
    //   - ANY other state → clear the stamp (no longer "done")
    // Doing this at the service means we don't need an extra fetch to
    // see prior state; the trade-off is that a direct in_progress→verified
    // jump leaves completed_at null. A future `verified_at` column plus
    // a DB trigger would let us track both moments independently.
    if (payload.status !== undefined && payload.completedAt === undefined) {
      const derived = deriveCompletedAt(payload.status);
      // undefined means "don't touch". JSON would coerce it to null and
      // clear the column, so we omit the key entirely.
      if (derived !== undefined) {
        row['completed_at'] = derived;
      }
    }

    const { data, error } = await this.supabase.client
      .from('corrective_actions')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select(this.SELECT_WITH_INSPECTION)
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async deleteCorrectiveAction(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    const { error } = await this.supabase.client
      .from('corrective_actions')
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

/** Terminal = "work is done", for the auto-stamp rule on completed_at. */
function isTerminal(status: CorrectiveAction['status'] | undefined): boolean {
  return status === 'completed' || status === 'verified';
}

/**
 * completed_at rule for UPDATEs. Returns `undefined` to mean "don't touch
 * this column" — the caller only spreads defined values into the row, so
 * omitting preserves whatever is already in the DB.
 */
function deriveCompletedAt(
  status: CorrectiveActionStatus,
): string | null | undefined {
  if (status === 'completed') return new Date().toISOString();
  if (status === 'verified') return undefined; // preserve existing
  return null; // any other state → clear
}

function mapRow(row: Record<string, unknown>): CorrectiveAction {
  const embedded = row['linked_inspection'] as
    | { id: string; title: string }
    | null
    | undefined;
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    inspectionId: (row['inspection_id'] as string | null) ?? null,
    title: row['title'] as string,
    description: (row['description'] as string) ?? '',
    status: row['status'] as CorrectiveAction['status'],
    priority: row['priority'] as CorrectiveAction['priority'],
    assignedTo: (row['assigned_to'] as string | null) ?? null,
    dueDate: (row['due_date'] as string | null) ?? null,
    completedAt: (row['completed_at'] as string | null) ?? null,
    createdBy: row['created_by'] as string,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
    linkedInspection: embedded ?? null,
  };
}
