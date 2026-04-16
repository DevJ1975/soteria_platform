/**
 * Soteria corrective actions — domain models.
 *
 * Corrective actions are tenant-scoped; RLS enforces isolation at the DB.
 * Actions may be linked to an inspection via `inspectionId`, or stand
 * alone (ad-hoc hazards, audit gaps, compliance issues).
 */

export type CorrectiveActionStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'verified'
  | 'cancelled';

export type CorrectiveActionPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Statuses that represent active work — useful for the "open count" badge
 * we'll surface on inspections in a later pass. Exported so consumers
 * don't hand-roll the list.
 */
export const OPEN_CORRECTIVE_ACTION_STATUSES: readonly CorrectiveActionStatus[] = [
  'open',
  'in_progress',
  'blocked',
];

export interface CorrectiveAction {
  id: string;
  tenantId: string;
  inspectionId: string | null;
  title: string;
  description: string;
  status: CorrectiveActionStatus;
  priority: CorrectiveActionPriority;
  assignedTo: string | null;
  dueDate: string | null;      // ISO yyyy-mm-dd
  completedAt: string | null;  // ISO timestamp
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  /**
   * Populated only by queries that join the inspections table (list page,
   * panel). `undefined` means the field wasn't requested; `null` means it
   * was requested but the action isn't linked to an inspection.
   */
  linkedInspection?: { id: string; title: string } | null;
}

/** Fields the client may send on create. */
export interface CreateCorrectiveActionPayload {
  title: string;
  description?: string;
  priority: CorrectiveActionPriority;
  status?: CorrectiveActionStatus;
  inspectionId?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
}

/** All fields on an action that a user with sufficient role may change. */
export interface UpdateCorrectiveActionPayload {
  title?: string;
  description?: string;
  status?: CorrectiveActionStatus;
  priority?: CorrectiveActionPriority;
  inspectionId?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
}

/** List-page filter shape. */
export interface CorrectiveActionFilters {
  status?: CorrectiveActionStatus | 'all';
  priority?: CorrectiveActionPriority | 'all';
  assignedTo?: string | 'me' | 'all';
  inspectionId?: string | null;
  searchText?: string;
}

/** Display labels — single source of truth shared by chips, filters, form. */
export const CORRECTIVE_ACTION_STATUS_LABEL: Record<CorrectiveActionStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  verified: 'Verified',
  cancelled: 'Cancelled',
};

export const CORRECTIVE_ACTION_PRIORITY_LABEL: Record<CorrectiveActionPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};
