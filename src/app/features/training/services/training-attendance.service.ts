import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';

import {
  CreateTrainingAttendancePayload,
  TrainingAttendance,
  UpdateTrainingAttendancePayload,
} from '../models/training-attendance.model';

/**
 * Data access for `public.training_attendance`.
 *
 * No cross-feature "list all attendance" method — attendance is always
 * viewed in the context of a specific session. The DB cross-tenant
 * alignment trigger rejects any row whose `tenant_id` doesn't match the
 * parent session's tenant, so we can't accidentally thread attendance
 * across tenants even if RLS is misconfigured.
 *
 * signed_at rule
 * --------------
 * When `signed` is set to true and the caller doesn't explicitly provide
 * `signed_at`, we stamp now(). When `signed` is flipped to false, we
 * clear `signed_at` (unless the caller explicitly preserved it). This
 * mirrors the closed_at / completed_at patterns in other modules.
 */
@Injectable({ providedIn: 'root' })
export class TrainingAttendanceService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async getAttendanceBySession(sessionId: string): Promise<TrainingAttendance[]> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('training_attendance')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async addAttendance(
    payload: CreateTrainingAttendancePayload,
  ): Promise<TrainingAttendance> {
    const tenantId = this.requireTenantId();

    const signed = payload.signed ?? false;
    const row = {
      tenant_id: tenantId,
      session_id: payload.sessionId,
      attendee_name: payload.attendeeName,
      attendee_id: payload.attendeeId ?? null,
      signed,
      signed_at: signed ? new Date().toISOString() : null,
      notes: payload.notes ?? null,
    };

    const { data, error } = await this.supabase.client
      .from('training_attendance')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async updateAttendance(
    id: string,
    payload: UpdateTrainingAttendancePayload,
  ): Promise<TrainingAttendance> {
    const tenantId = this.requireTenantId();

    const row: Record<string, unknown> = {};
    if (payload.attendeeName !== undefined) row['attendee_name'] = payload.attendeeName;
    if (payload.attendeeId !== undefined) row['attendee_id'] = payload.attendeeId;
    if (payload.notes !== undefined) row['notes'] = payload.notes;
    if (payload.signed !== undefined) row['signed'] = payload.signed;
    if (payload.signedAt !== undefined) row['signed_at'] = payload.signedAt;

    // Auto-stamp signed_at from signed transitions unless the caller set
    // it explicitly. Flipping to true stamps now; flipping to false clears.
    if (payload.signed !== undefined && payload.signedAt === undefined) {
      row['signed_at'] = payload.signed ? new Date().toISOString() : null;
    }

    const { data, error } = await this.supabase.client
      .from('training_attendance')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async removeAttendance(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    const { error } = await this.supabase.client
      .from('training_attendance')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Count attendees for one session. Shaped for the future dashboard
   * metric "training sessions held this month, X attendees total";
   * symmetric with the count helpers on other modules.
   */
  async getCountBySession(sessionId: string): Promise<number> {
    const tenantId = this.requireTenantId();
    const { count, error } = await this.supabase.client
      .from('training_attendance')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId);
    if (error) throw error;
    return count ?? 0;
  }

  private requireTenantId(): string {
    const id = this.auth.tenantId();
    if (!id) throw new Error('Not authenticated or missing tenant context.');
    return id;
  }
}

function mapRow(row: Record<string, unknown>): TrainingAttendance {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    sessionId: row['session_id'] as string,
    attendeeName: row['attendee_name'] as string,
    attendeeId: (row['attendee_id'] as string | null) ?? null,
    signed: row['signed'] as boolean,
    signedAt: (row['signed_at'] as string | null) ?? null,
    notes: (row['notes'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
  };
}
