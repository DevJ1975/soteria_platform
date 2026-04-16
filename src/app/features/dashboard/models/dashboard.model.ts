import { CorrectiveActionStatus } from '@features/corrective-actions/models/corrective-action.model';
import { EquipmentCheckStatus } from '@features/equipment/models/equipment-check.model';
import { IncidentSeverity, IncidentStatus } from '@features/incident-reports/models/incident-report.model';
import { InspectionStatus } from '@features/inspections/models/inspection.model';

/**
 * Soteria dashboard — domain models.
 *
 * Two shapes here:
 *   - `DashboardStats` — the KPI row. Sourced from the five DB views.
 *   - `Recent*` — slim shapes for the "recent activity" lists. Pulled
 *     directly from each module's table with a small `.order().limit()`
 *     and mapped to just the fields the dashboard card shows. Using
 *     a narrow projection keeps the payload small and the dashboard
 *     insulated from module-model drift.
 */

export interface CorrectiveActionStats {
  open: number;
  overdue: number;
  completed: number;
}

export interface InspectionStats {
  total: number;
  completedRecent: number;
  open: number;
}

export interface IncidentStats {
  open: number;
  closed: number;
  highSeverityOpen: number;
}

export interface EquipmentCheckStats {
  failed: number;
  passedRecent: number;
}

export interface TrainingStats {
  recentSessions: number;
  totalAttendance: number;
}

export interface DashboardStats {
  correctiveActions: CorrectiveActionStats;
  inspections: InspectionStats;
  incidents: IncidentStats;
  equipmentChecks: EquipmentCheckStats;
  training: TrainingStats;
}

/** Returned by the dashboard service as a single bundle so the page can
 *  render every KPI from one await. */
export interface DashboardSummaryResponse {
  stats: DashboardStats;
}

/** Zero-value stats, used as the initial signal value and when the
 *  tenant has no data in a module yet (view returns zero rows). */
export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  correctiveActions: { open: 0, overdue: 0, completed: 0 },
  inspections: { total: 0, completedRecent: 0, open: 0 },
  incidents: { open: 0, closed: 0, highSeverityOpen: 0 },
  equipmentChecks: { failed: 0, passedRecent: 0 },
  training: { recentSessions: 0, totalAttendance: 0 },
};


// -- Recent activity shapes --------------------------------------------------

export interface RecentIncident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  eventOccurredAt: string;
}

export interface RecentCorrectiveAction {
  id: string;
  title: string;
  status: CorrectiveActionStatus;
  dueDate: string | null;
  createdAt: string;
}

export interface RecentInspection {
  id: string;
  title: string;
  status: InspectionStatus;
  updatedAt: string;
}

export interface RecentTrainingSession {
  id: string;
  title: string;
  topic: string;
  sessionDate: string;
}

export interface RecentEquipmentCheck {
  id: string;
  equipmentId: string;
  equipmentName: string | null;   // joined in
  checkType: string;
  status: EquipmentCheckStatus;
  performedAt: string;
}
