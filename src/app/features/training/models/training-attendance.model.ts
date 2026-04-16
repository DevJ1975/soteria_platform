/**
 * Soteria training attendance — domain model.
 *
 * One row per attendee-per-session. Shaped to accommodate both members
 * of the tenant (`attendeeId` populated via user-lookup on add) and
 * external attendees (visitors, new hires not yet in the system —
 * `attendeeId` null, `attendeeName` carries the record).
 *
 * `signed` + `signedAt` are set today by the supervisor recording the
 * attendance. The shape is intentionally compatible with a future QR
 * sign-in flow where the attendee self-stamps.
 */

export interface TrainingAttendance {
  id: string;
  tenantId: string;
  sessionId: string;
  attendeeName: string;
  attendeeId: string | null;
  signed: boolean;
  signedAt: string | null;    // ISO timestamp, stamped when signed = true
  notes: string | null;
  createdAt: string;
}

/** Fields the client may send on create. `tenant_id` is filled by the service. */
export interface CreateTrainingAttendancePayload {
  sessionId: string;
  attendeeName: string;
  attendeeId?: string | null;
  signed?: boolean;
  notes?: string | null;
}

export interface UpdateTrainingAttendancePayload {
  signed?: boolean;
  signedAt?: string | null;
  notes?: string | null;
  attendeeName?: string;
  attendeeId?: string | null;
}
