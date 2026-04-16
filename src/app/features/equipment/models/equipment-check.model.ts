/**
 * Soteria equipment checks — domain models.
 *
 * A check represents one inspection/test performed on one piece of
 * equipment at a point in time. The table is append-mostly — each check
 * is an audit record of a moment, not mutable state.
 */

export type EquipmentCheckStatus = 'pass' | 'fail' | 'needs_attention';

/**
 * Common check types. Plain text in the DB so tenants can extend later;
 * the frontend pins this union for the form dropdown.
 */
export type EquipmentCheckType =
  | 'pre_use'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'walkaround'
  | 'condition'
  | 'other';

export interface EquipmentCheck {
  id: string;
  tenantId: string;
  equipmentId: string;
  checkType: EquipmentCheckType;
  status: EquipmentCheckStatus;
  notes: string | null;
  performedBy: string;
  performedAt: string;  // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

/** Fields the client may send on create. tenant_id + performed_by are
 *  filled in by the service. */
export interface CreateEquipmentCheckPayload {
  equipmentId: string;
  checkType: EquipmentCheckType;
  status: EquipmentCheckStatus;
  notes?: string | null;
  performedAt?: string | null; // defaults to now() if omitted
}

export interface UpdateEquipmentCheckPayload {
  checkType?: EquipmentCheckType;
  status?: EquipmentCheckStatus;
  notes?: string | null;
  performedAt?: string | null;
}

/** List-page filter shape. */
export interface EquipmentCheckFilters {
  equipmentId?: string;
  status?: EquipmentCheckStatus | 'all';
  searchText?: string;
}

export const EQUIPMENT_CHECK_STATUS_LABEL: Record<EquipmentCheckStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  needs_attention: 'Needs attention',
};

export const EQUIPMENT_CHECK_TYPE_LABEL: Record<EquipmentCheckType, string> = {
  pre_use: 'Pre-use',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  walkaround: 'Walkaround',
  condition: 'Condition',
  other: 'Other',
};

/**
 * Statuses that represent a "finding" — useful for the future
 * corrective-action integration. A failed or needs-attention check is
 * the trigger for creating a CA.
 */
export const ACTIONABLE_EQUIPMENT_CHECK_STATUSES: readonly EquipmentCheckStatus[] = [
  'fail',
  'needs_attention',
];
