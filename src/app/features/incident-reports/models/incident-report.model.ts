/**
 * Soteria incident reports — domain models.
 *
 * Structured records of safety events and observations. Tenant-scoped;
 * RLS enforces isolation at the DB layer.
 */

export type IncidentReportType =
  | 'incident'
  | 'near_miss'
  | 'injury'
  | 'property_damage'
  | 'unsafe_condition'
  | 'observation';

export type IncidentSeverity =
  | 'informational'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type IncidentStatus = 'draft' | 'submitted' | 'investigating' | 'closed';

export interface IncidentReport {
  id: string;
  tenantId: string;
  siteId: string | null;
  reportType: IncidentReportType;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  eventOccurredAt: string;              // ISO timestamp
  locationText: string | null;
  involvedPeopleNotes: string | null;
  immediateActionsTaken: string | null;
  followUpNotes: string | null;
  reportedBy: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the client may send on create. `tenant_id` and `reported_by`
 *  are filled by the service, not the form. */
export interface CreateIncidentReportPayload {
  reportType: IncidentReportType;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  status?: IncidentStatus;
  eventOccurredAt: string;
  locationText?: string | null;
  involvedPeopleNotes?: string | null;
  immediateActionsTaken?: string | null;
  followUpNotes?: string | null;
  siteId?: string | null;
}

export interface UpdateIncidentReportPayload {
  reportType?: IncidentReportType;
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  eventOccurredAt?: string;
  locationText?: string | null;
  involvedPeopleNotes?: string | null;
  immediateActionsTaken?: string | null;
  followUpNotes?: string | null;
  closedAt?: string | null;
  siteId?: string | null;
}

/**
 * List-page filter shape. `status: 'open'` is a convenience that resolves
 * to "anything except closed" — useful for "things I still owe work on"
 * without teaching consumers the status enum.
 */
export interface IncidentReportFilters {
  status?: IncidentStatus | 'open' | 'all';
  reportType?: IncidentReportType | 'all';
  severity?: IncidentSeverity | 'all';
  reportedBy?: string | 'me' | 'all';
  searchText?: string;
}

/** Statuses that count as "open" (still needing work). */
export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'draft',
  'submitted',
  'investigating',
];

/** Display labels — single source of truth shared by chips, filters, form. */
export const INCIDENT_REPORT_TYPE_LABEL: Record<IncidentReportType, string> = {
  incident: 'Incident',
  near_miss: 'Near miss',
  injury: 'Injury',
  property_damage: 'Property damage',
  unsafe_condition: 'Unsafe condition',
  observation: 'Observation',
};

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  informational: 'Informational',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  investigating: 'Investigating',
  closed: 'Closed',
};
