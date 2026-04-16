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
 *     in depth plus self-documenting intent at every call site.
 *
 * Joins: the list and panel queries embed all three possible linked
 * records (inspection · incident report · equipment check) in a single
 * round-trip via PostgREST's embedded-select syntax. The DB trigger
 * guarantees at most one is populated in practice, but the type shape
 * accommodates any.
 */
@Injectable({ providedIn: 'root' })
export class CorrectiveActionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** Columns + all three embedded links in a single select string. */
  private readonly SELECT_WITH_LINKS = [
    '*',
    'linked_inspection:inspections!corrective_actions_inspection_id_fkey(id, title)',
    'linked_incident_report:incident_reports!corrective_actions_incident_report_id_fkey(id, title)',
    'linked_equipment_check:equipment_checks!corrective_actions_equipment_check_id_fkey(id, equipment_id, check_type, performed_at)',
  ].join(', ');

  async getCorrectiveActions(
    filters: CorrectiveActionFilters = {},
  ): Promise<CorrectiveAction[]> {
    const tenantId = this.requireTenantId();

    let query = this.supabase.client
      .from('corrective_actions')
      .select(this.SELECT_WITH_LINKS)
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
      .select(this.SELECT_WITH_LINKS)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  /** All actions linked to one inspection, newest first. */
  async getCorrectiveActionsByInspection(
    inspectionId: string,
  ): Promise<CorrectiveAction[]> {
    return this.findByLink('inspection_id', inspectionId);
  }

  /** All actions linked to one incident report, newest first. */
  async getCorrectiveActionsByIncidentReport(
    incidentReportId: string,
  ): Promise<CorrectiveAction[]> {
    return this.findByLink('incident_report_id', incidentReportId);
  }

  /** All actions linked to one equipment check, newest first. */
  async getCorrectiveActionsByEquipmentCheck(
    equipmentCheckId: string,
  ): Promise<CorrectiveAction[]> {
    return this.findByLink('equipment_check_id', equipmentCheckId);
  }

  /** Open-action count for the inspection list / future badges. */
  async getOpenCountByInspection(inspectionId: string): Promise<number> {
    return this.openCountByLink('inspection_id', inspectionId);
  }

  /** Open-action count for the incident-report list / detail page. */
  async getOpenCountByIncidentReport(incidentReportId: string): Promise<number> {
    return this.openCountByLink('incident_report_id', incidentReportId);
  }

  /** Open-action count for the equipment-check panel row. */
  async getOpenCountByEquipmentCheck(equipmentCheckId: string): Promise<number> {
    return this.openCountByLink('equipment_check_id', equipmentCheckId);
  }

  async createCorrectiveAction(
    payload: CreateCorrectiveActionPayload,
  ): Promise<CorrectiveAction> {
    const tenantId = this.requireTenantId();
    const userId = this.auth.session()?.user.id;
    if (!userId) throw new Error('Not authenticated.');

    const autoCompletedAt = isTerminal(payload.status)
      ? new Date().toISOString()
      : null;

    const row = {
      tenant_id: tenantId,
      created_by: userId,
      inspection_id: payload.inspectionId ?? null,
      incident_report_id: payload.incidentReportId ?? null,
      equipment_check_id: payload.equipmentCheckId ?? null,
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
      .select(this.SELECT_WITH_LINKS)
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
    if (payload.incidentReportId !== undefined) row['incident_report_id'] = payload.incidentReportId;
    if (payload.equipmentCheckId !== undefined) row['equipment_check_id'] = payload.equipmentCheckId;
    if (payload.assignedTo !== undefined) row['assigned_to'] = payload.assignedTo;
    if (payload.dueDate !== undefined) row['due_date'] = payload.dueDate;
    if (payload.completedAt !== undefined) row['completed_at'] = payload.completedAt;

    // completed_at rule (see previous review pass for rationale):
    //   TO 'completed'  → stamp now
    //   TO 'verified'   → preserve existing (return undefined, key omitted)
    //   else            → clear
    if (payload.status !== undefined && payload.completedAt === undefined) {
      const derived = deriveCompletedAt(payload.status);
      if (derived !== undefined) row['completed_at'] = derived;
    }

    const { data, error } = await this.supabase.client
      .from('corrective_actions')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select(this.SELECT_WITH_LINKS)
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

  private async findByLink(
    column: 'inspection_id' | 'incident_report_id' | 'equipment_check_id',
    id: string,
  ): Promise<CorrectiveAction[]> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('corrective_actions')
      .select(this.SELECT_WITH_LINKS)
      .eq('tenant_id', tenantId)
      .eq(column, id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  private async openCountByLink(
    column: 'inspection_id' | 'incident_report_id' | 'equipment_check_id',
    id: string,
  ): Promise<number> {
    const tenantId = this.requireTenantId();
    const { count, error } = await this.supabase.client
      .from('corrective_actions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq(column, id)
      .in('status', [...OPEN_CORRECTIVE_ACTION_STATUSES]);
    if (error) throw error;
    return count ?? 0;
  }

  private requireTenantId(): string {
    const id = this.auth.tenantId();
    if (!id) throw new Error('Not authenticated or missing tenant context.');
    return id;
  }
}

function isTerminal(status: CorrectiveAction['status'] | undefined): boolean {
  return status === 'completed' || status === 'verified';
}

function deriveCompletedAt(
  status: CorrectiveActionStatus,
): string | null | undefined {
  if (status === 'completed') return new Date().toISOString();
  if (status === 'verified') return undefined;
  return null;
}

function mapRow(row: Record<string, unknown>): CorrectiveAction {
  const insp = row['linked_inspection'] as
    | { id: string; title: string }
    | null
    | undefined;
  const incident = row['linked_incident_report'] as
    | { id: string; title: string }
    | null
    | undefined;
  const check = row['linked_equipment_check'] as
    | { id: string; equipment_id: string; check_type: string; performed_at: string }
    | null
    | undefined;

  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    inspectionId: (row['inspection_id'] as string | null) ?? null,
    incidentReportId: (row['incident_report_id'] as string | null) ?? null,
    equipmentCheckId: (row['equipment_check_id'] as string | null) ?? null,
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
    linkedInspection: insp ?? null,
    linkedIncidentReport: incident ?? null,
    linkedEquipmentCheck: check
      ? {
          id: check.id,
          equipmentId: check.equipment_id,
          checkType: check.check_type,
          performedAt: check.performed_at,
        }
      : null,
  };
}
