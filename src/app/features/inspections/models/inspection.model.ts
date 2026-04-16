/**
 * Soteria inspections — domain models.
 *
 * All inspections are tenant-scoped; RLS enforces isolation at the DB layer.
 * The frontend never needs to add `tenant_id` filters defensively — the
 * service writes `tenant_id` on insert and the policies take care of the
 * rest.
 */

export type InspectionStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'cancelled';

export type InspectionPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * The inspection_type column is a plain `text` in the DB so tenants can add
 * their own types later without a migration. The frontend pins a canonical
 * set via this union so forms and filters stay type-safe.
 */
export type InspectionType =
  | 'general'
  | 'safety_walk'
  | 'equipment'
  | 'site'
  | 'pre_task';

export interface Inspection {
  id: string;
  tenantId: string;
  siteId: string | null;
  title: string;
  description: string;
  inspectionType: InspectionType;
  status: InspectionStatus;
  priority: InspectionPriority;
  assignedTo: string | null;
  dueDate: string | null;      // ISO yyyy-mm-dd
  completedAt: string | null;  // ISO timestamp
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields the client may send on create. `tenant_id` and `created_by`
 *  are filled in by the service, not the form. */
export interface CreateInspectionPayload {
  title: string;
  description?: string;
  inspectionType: InspectionType;
  priority: InspectionPriority;
  status?: InspectionStatus;
  assignedTo?: string | null;
  dueDate?: string | null;
  siteId?: string | null;
}

/** All fields on an inspection that a user with sufficient role may change. */
export interface UpdateInspectionPayload {
  title?: string;
  description?: string;
  inspectionType?: InspectionType;
  status?: InspectionStatus;
  priority?: InspectionPriority;
  assignedTo?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  siteId?: string | null;
}

/** Query-shape for the list page filter bar. */
export interface InspectionFilters {
  status?: InspectionStatus | 'all';
  priority?: InspectionPriority | 'all';
  /** `'me'` resolves to the signed-in user at query time. */
  assignedTo?: string | 'me' | 'all';
  searchText?: string;
}

/** Labels for display — kept alongside the union so there's one source. */
export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export const INSPECTION_PRIORITY_LABEL: Record<InspectionPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  general: 'General',
  safety_walk: 'Safety walk',
  equipment: 'Equipment',
  site: 'Site',
  pre_task: 'Pre-task',
};
