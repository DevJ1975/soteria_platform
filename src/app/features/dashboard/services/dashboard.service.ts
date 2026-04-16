import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';

import {
  DashboardStats,
  DashboardSummaryResponse,
  EMPTY_DASHBOARD_STATS,
  RecentCorrectiveAction,
  RecentIncident,
  RecentInspection,
  RecentTrainingSession,
} from '../models/dashboard.model';

/**
 * Dashboard data access. Two kinds of queries live here:
 *
 *   1. `getStats()` — five parallel selects against the aggregate views
 *      created in migration 120012. Tenant scoping is enforced by the
 *      views' `security_invoker = on` setting; the underlying table RLS
 *      policies do the work.
 *
 *   2. `getRecent*()` — narrow projections of each module's "latest N"
 *      rows, ordered by whatever field is the most meaningful for
 *      "activity" in that module. Same defense-in-depth `.eq('tenant_id',
 *      …)` pattern the module services use.
 *
 * All methods fail soft on missing tenant context — returning zero/
 * empty rather than throwing — because the dashboard is the first page
 * most users see on login and must never hard-error during session init.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /**
   * Fetches every KPI in parallel. Each view returns 0 or 1 rows for
   * the caller's tenant; we coerce "no row" to zero values so the page
   * renders for brand-new tenants without special-casing.
   */
  async getStats(): Promise<DashboardSummaryResponse> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return { stats: EMPTY_DASHBOARD_STATS };

    const client = this.supabase.client;

    const [ca, insp, incident, eq, training] = await Promise.all([
      client
        .from('dashboard_corrective_action_summary')
        .select('open_count, overdue_count, completed_count')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      client
        .from('dashboard_inspection_summary')
        .select('total_count, completed_recent_count, open_count')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      client
        .from('dashboard_incident_summary')
        .select('open_count, closed_count, high_severity_open_count')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      client
        .from('dashboard_equipment_check_summary')
        .select('failed_count, passed_recent_count')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      client
        .from('dashboard_training_summary')
        .select('recent_sessions_count, total_attendance_count')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    // If any individual view query errored, log and fall through to
    // zero values for that module. A noisy network shouldn't black out
    // the whole dashboard.
    if (ca.error) console.error('[Soteria] CA summary failed', ca.error);
    if (insp.error) console.error('[Soteria] Inspection summary failed', insp.error);
    if (incident.error) console.error('[Soteria] Incident summary failed', incident.error);
    if (eq.error) console.error('[Soteria] Equipment summary failed', eq.error);
    if (training.error) console.error('[Soteria] Training summary failed', training.error);

    const stats: DashboardStats = {
      correctiveActions: {
        open: (ca.data?.['open_count'] as number | undefined) ?? 0,
        overdue: (ca.data?.['overdue_count'] as number | undefined) ?? 0,
        completed: (ca.data?.['completed_count'] as number | undefined) ?? 0,
      },
      inspections: {
        total: (insp.data?.['total_count'] as number | undefined) ?? 0,
        completedRecent: (insp.data?.['completed_recent_count'] as number | undefined) ?? 0,
        open: (insp.data?.['open_count'] as number | undefined) ?? 0,
      },
      incidents: {
        open: (incident.data?.['open_count'] as number | undefined) ?? 0,
        closed: (incident.data?.['closed_count'] as number | undefined) ?? 0,
        highSeverityOpen:
          (incident.data?.['high_severity_open_count'] as number | undefined) ?? 0,
      },
      equipmentChecks: {
        failed: (eq.data?.['failed_count'] as number | undefined) ?? 0,
        passedRecent: (eq.data?.['passed_recent_count'] as number | undefined) ?? 0,
      },
      training: {
        recentSessions: (training.data?.['recent_sessions_count'] as number | undefined) ?? 0,
        totalAttendance:
          (training.data?.['total_attendance_count'] as number | undefined) ?? 0,
      },
    };

    return { stats };
  }

  async getRecentIncidents(limit = 5): Promise<RecentIncident[]> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return [];

    const { data, error } = await this.supabase.client
      .from('incident_reports')
      .select('id, title, status, severity, event_occurred_at')
      .eq('tenant_id', tenantId)
      .order('event_occurred_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      status: r['status'] as RecentIncident['status'],
      severity: r['severity'] as RecentIncident['severity'],
      eventOccurredAt: r['event_occurred_at'] as string,
    }));
  }

  async getRecentCorrectiveActions(limit = 5): Promise<RecentCorrectiveAction[]> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return [];

    const { data, error } = await this.supabase.client
      .from('corrective_actions')
      .select('id, title, status, due_date, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      status: r['status'] as RecentCorrectiveAction['status'],
      dueDate: (r['due_date'] as string | null) ?? null,
      createdAt: r['created_at'] as string,
    }));
  }

  async getRecentInspections(limit = 5): Promise<RecentInspection[]> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return [];

    const { data, error } = await this.supabase.client
      .from('inspections')
      .select('id, title, status, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      status: r['status'] as RecentInspection['status'],
      updatedAt: r['updated_at'] as string,
    }));
  }

  async getRecentTrainingSessions(limit = 5): Promise<RecentTrainingSession[]> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return [];

    const { data, error } = await this.supabase.client
      .from('training_sessions')
      .select('id, title, topic, session_date')
      .eq('tenant_id', tenantId)
      .order('session_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      topic: r['topic'] as string,
      sessionDate: r['session_date'] as string,
    }));
  }
}
