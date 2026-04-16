/**
 * Soteria training sessions — domain model.
 *
 * A training session is one toolbox talk, safety meeting, or briefing.
 * Tenant-scoped; RLS enforces isolation. Attendance is a separate
 * table (see training-attendance.model.ts) joined by session_id.
 *
 * Design notes
 * ------------
 * * `conductedBy` is nullable because a supervisor who runs a session
 *   might later leave the tenant — in which case the FK is set to null
 *   (instead of cascading) to preserve the historical record.
 * * No status column. "Scheduled" vs "completed" is derivable from
 *   `sessionDate < now()`; storing it would invite drift.
 */

export interface TrainingSession {
  id: string;
  tenantId: string;
  siteId: string | null;
  title: string;
  description: string;
  topic: string;
  conductedBy: string | null;
  sessionDate: string;         // ISO timestamp
  locationText: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the client may send on create. `tenant_id` is filled by the service. */
export interface CreateTrainingSessionPayload {
  title: string;
  topic: string;
  sessionDate: string;
  description?: string;
  conductedBy?: string | null;
  locationText?: string | null;
  siteId?: string | null;
}

export interface UpdateTrainingSessionPayload {
  title?: string;
  topic?: string;
  sessionDate?: string;
  description?: string;
  conductedBy?: string | null;
  locationText?: string | null;
  siteId?: string | null;
}

/** List-page filter shape. */
export interface TrainingSessionFilters {
  searchText?: string;
  conductedBy?: string | 'me' | 'all';
  /** ISO date strings. */
  from?: string;
  to?: string;
}
