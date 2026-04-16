import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';
import { escapeIlikePattern } from '@shared/utils/errors.util';

import {
  CreateIncidentReportPayload,
  IncidentReport,
  IncidentReportFilters,
  IncidentReportType,
  IncidentStatus,
  OPEN_INCIDENT_STATUSES,
  UpdateIncidentReportPayload,
} from '../models/incident-report.model';

/**
 * Data access for `public.incident_reports`.
 *
 * Every query carries an explicit `.eq('tenant_id', …)` in addition to
 * RLS. Defense-in-depth; see InspectionsService for the full rationale.
 *
 * closed_at rule
 * --------------
 * The service maintains `closed_at` via status transitions:
 *   - TO `closed`  → stamp now()
 *   - FROM `closed` (to anything else) → clear the stamp
 *   - All other transitions → leave it alone
 * Callers can still set `closedAt` explicitly in the payload to override.
 */
@Injectable({ providedIn: 'root' })
export class IncidentReportsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async getIncidentReports(
    filters: IncidentReportFilters = {},
  ): Promise<IncidentReport[]> {
    const tenantId = this.requireTenantId();

    let query = this.supabase.client
      .from('incident_reports')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('event_occurred_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'open') {
        query = query.in('status', [...OPEN_INCIDENT_STATUSES]);
      } else {
        query = query.eq('status', filters.status);
      }
    }
    if (filters.reportType && filters.reportType !== 'all') {
      query = query.eq('report_type', filters.reportType);
    }
    if (filters.severity && filters.severity !== 'all') {
      query = query.eq('severity', filters.severity);
    }
    if (filters.reportedBy === 'me') {
      const userId = this.auth.session()?.user.id;
      if (userId) query = query.eq('reported_by', userId);
    } else if (filters.reportedBy && filters.reportedBy !== 'all') {
      query = query.eq('reported_by', filters.reportedBy);
    }
    if (filters.searchText?.trim()) {
      const pattern = escapeIlikePattern(filters.searchText.trim());
      query = query.ilike('title', `%${pattern}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getIncidentReportById(id: string): Promise<IncidentReport | null> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('incident_reports')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  /** Convenience: anything not yet `closed`. */
  async getOpenIncidentReports(): Promise<IncidentReport[]> {
    return this.getIncidentReports({ status: 'open' });
  }

  /** Convenience: filter by a specific report type. */
  async getReportsByType(type: IncidentReportType): Promise<IncidentReport[]> {
    return this.getIncidentReports({ reportType: type });
  }

  async createIncidentReport(
    payload: CreateIncidentReportPayload,
  ): Promise<IncidentReport> {
    const tenantId = this.requireTenantId();
    const userId = this.auth.session()?.user.id;
    if (!userId) throw new Error('Not authenticated.');

    const autoClosedAt =
      payload.status === 'closed' ? new Date().toISOString() : null;

    const row = {
      tenant_id: tenantId,
      reported_by: userId,
      report_type: payload.reportType,
      title: payload.title,
      description: payload.description ?? '',
      severity: payload.severity,
      status: payload.status ?? 'draft',
      event_occurred_at: payload.eventOccurredAt,
      location_text: payload.locationText ?? null,
      involved_people_notes: payload.involvedPeopleNotes ?? null,
      immediate_actions_taken: payload.immediateActionsTaken ?? null,
      follow_up_notes: payload.followUpNotes ?? null,
      site_id: payload.siteId ?? null,
      closed_at: autoClosedAt,
    };

    const { data, error } = await this.supabase.client
      .from('incident_reports')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async updateIncidentReport(
    id: string,
    payload: UpdateIncidentReportPayload,
  ): Promise<IncidentReport> {
    const tenantId = this.requireTenantId();

    const row: Record<string, unknown> = {};
    if (payload.title !== undefined) row['title'] = payload.title;
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.reportType !== undefined) row['report_type'] = payload.reportType;
    if (payload.severity !== undefined) row['severity'] = payload.severity;
    if (payload.status !== undefined) row['status'] = payload.status;
    if (payload.eventOccurredAt !== undefined) row['event_occurred_at'] = payload.eventOccurredAt;
    if (payload.locationText !== undefined) row['location_text'] = payload.locationText;
    if (payload.involvedPeopleNotes !== undefined) row['involved_people_notes'] = payload.involvedPeopleNotes;
    if (payload.immediateActionsTaken !== undefined) row['immediate_actions_taken'] = payload.immediateActionsTaken;
    if (payload.followUpNotes !== undefined) row['follow_up_notes'] = payload.followUpNotes;
    if (payload.siteId !== undefined) row['site_id'] = payload.siteId;
    if (payload.closedAt !== undefined) row['closed_at'] = payload.closedAt;

    // Derive closed_at from status transitions unless the caller set it
    // explicitly. Simpler than the CA rule because incident reports have
    // only one terminal state.
    if (payload.status !== undefined && payload.closedAt === undefined) {
      row['closed_at'] = deriveClosedAt(payload.status);
    }

    const { data, error } = await this.supabase.client
      .from('incident_reports')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async deleteIncidentReport(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    const { error } = await this.supabase.client
      .from('incident_reports')
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

/**
 * closed_at derivation: TO closed stamps now; FROM closed clears.
 * Returns `undefined` for transitions we don't want to touch (none right
 * now — all 4 statuses lead to a definite closed_at value — but the
 * pattern matches the CA service shape for consistency).
 */
function deriveClosedAt(status: IncidentStatus): string | null {
  return status === 'closed' ? new Date().toISOString() : null;
}

function mapRow(row: Record<string, unknown>): IncidentReport {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    siteId: (row['site_id'] as string | null) ?? null,
    reportType: row['report_type'] as IncidentReport['reportType'],
    title: row['title'] as string,
    description: (row['description'] as string) ?? '',
    severity: row['severity'] as IncidentReport['severity'],
    status: row['status'] as IncidentReport['status'],
    eventOccurredAt: row['event_occurred_at'] as string,
    locationText: (row['location_text'] as string | null) ?? null,
    involvedPeopleNotes: (row['involved_people_notes'] as string | null) ?? null,
    immediateActionsTaken: (row['immediate_actions_taken'] as string | null) ?? null,
    followUpNotes: (row['follow_up_notes'] as string | null) ?? null,
    reportedBy: row['reported_by'] as string,
    closedAt: (row['closed_at'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
