import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';
import { escapeIlikePattern, sanitizeOrFilterTerm } from '@shared/utils/errors.util';

import {
  CreateTrainingSessionPayload,
  TrainingSession,
  TrainingSessionFilters,
  UpdateTrainingSessionPayload,
} from '../models/training-session.model';

/**
 * Data access for `public.training_sessions`.
 *
 * Same two-layer tenant isolation as every other service:
 * RLS is authoritative; every query also carries an explicit
 * `.eq('tenant_id', …)` for defense-in-depth and intent visibility.
 *
 * Search matches on both `title` and `topic` because supervisors
 * remember training either way ("the fall-protection one" vs
 * "Thursday's talk").
 */
@Injectable({ providedIn: 'root' })
export class TrainingSessionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async getTrainingSessions(
    filters: TrainingSessionFilters = {},
  ): Promise<TrainingSession[]> {
    const tenantId = this.requireTenantId();

    let query = this.supabase.client
      .from('training_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('session_date', { ascending: false });

    if (filters.conductedBy === 'me') {
      const userId = this.auth.session()?.user.id;
      if (userId) query = query.eq('conducted_by', userId);
    } else if (filters.conductedBy && filters.conductedBy !== 'all') {
      query = query.eq('conducted_by', filters.conductedBy);
    }
    if (filters.from) {
      query = query.gte('session_date', filters.from);
    }
    if (filters.to) {
      query = query.lte('session_date', filters.to);
    }
    if (filters.searchText?.trim()) {
      const pattern = escapeIlikePattern(
        sanitizeOrFilterTerm(filters.searchText.trim()),
      );
      query = query.or(`title.ilike.%${pattern}%,topic.ilike.%${pattern}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getTrainingSessionById(id: string): Promise<TrainingSession | null> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('training_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async createTrainingSession(
    payload: CreateTrainingSessionPayload,
  ): Promise<TrainingSession> {
    const tenantId = this.requireTenantId();

    const row = {
      tenant_id: tenantId,
      title: payload.title,
      topic: payload.topic,
      description: payload.description ?? '',
      conducted_by: payload.conductedBy ?? null,
      session_date: payload.sessionDate,
      location_text: payload.locationText ?? null,
      site_id: payload.siteId ?? null,
    };

    const { data, error } = await this.supabase.client
      .from('training_sessions')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async updateTrainingSession(
    id: string,
    payload: UpdateTrainingSessionPayload,
  ): Promise<TrainingSession> {
    const tenantId = this.requireTenantId();

    const row: Record<string, unknown> = {};
    if (payload.title !== undefined) row['title'] = payload.title;
    if (payload.topic !== undefined) row['topic'] = payload.topic;
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.conductedBy !== undefined) row['conducted_by'] = payload.conductedBy;
    if (payload.sessionDate !== undefined) row['session_date'] = payload.sessionDate;
    if (payload.locationText !== undefined) row['location_text'] = payload.locationText;
    if (payload.siteId !== undefined) row['site_id'] = payload.siteId;

    const { data, error } = await this.supabase.client
      .from('training_sessions')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async deleteTrainingSession(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    const { error } = await this.supabase.client
      .from('training_sessions')
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

function mapRow(row: Record<string, unknown>): TrainingSession {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    siteId: (row['site_id'] as string | null) ?? null,
    title: row['title'] as string,
    description: (row['description'] as string) ?? '',
    topic: row['topic'] as string,
    conductedBy: (row['conducted_by'] as string | null) ?? null,
    sessionDate: row['session_date'] as string,
    locationText: (row['location_text'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
