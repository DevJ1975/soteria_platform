import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';
import { escapeIlikePattern } from '@shared/utils/errors.util';

import {
  ACTIONABLE_EQUIPMENT_CHECK_STATUSES,
  CreateEquipmentCheckPayload,
  EquipmentCheck,
  EquipmentCheckFilters,
  UpdateEquipmentCheckPayload,
} from '../models/equipment-check.model';

/**
 * Data access for `public.equipment_checks`.
 *
 * Writes automatically fill `tenant_id` and `performed_by` from
 * AuthService so the form can't forge either. The DB's cross-tenant
 * alignment trigger (migration 120006) rejects any check whose
 * `equipment_id` belongs to a different tenant.
 */
@Injectable({ providedIn: 'root' })
export class EquipmentChecksService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async getChecks(filters: EquipmentCheckFilters = {}): Promise<EquipmentCheck[]> {
    const tenantId = this.requireTenantId();

    let query = this.supabase.client
      .from('equipment_checks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('performed_at', { ascending: false });

    if (filters.equipmentId) {
      query = query.eq('equipment_id', filters.equipmentId);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.searchText?.trim()) {
      const pattern = escapeIlikePattern(filters.searchText.trim());
      query = query.ilike('notes', `%${pattern}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getChecksByEquipment(equipmentId: string): Promise<EquipmentCheck[]> {
    return this.getChecks({ equipmentId });
  }

  async getCheckById(id: string): Promise<EquipmentCheck | null> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('equipment_checks')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  /**
   * Counts actionable (fail + needs_attention) checks for an equipment
   * item. Shape for the future "X open issues" badge on the equipment
   * list. Cheap because of the `(equipment_id, performed_at desc)` index.
   */
  async getActionableCountByEquipment(equipmentId: string): Promise<number> {
    const tenantId = this.requireTenantId();
    const { count, error } = await this.supabase.client
      .from('equipment_checks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('equipment_id', equipmentId)
      .in('status', [...ACTIONABLE_EQUIPMENT_CHECK_STATUSES]);
    if (error) throw error;
    return count ?? 0;
  }

  async createCheck(payload: CreateEquipmentCheckPayload): Promise<EquipmentCheck> {
    const tenantId = this.requireTenantId();
    const userId = this.auth.session()?.user.id;
    if (!userId) throw new Error('Not authenticated.');

    const row = {
      tenant_id: tenantId,
      equipment_id: payload.equipmentId,
      check_type: payload.checkType,
      status: payload.status,
      notes: payload.notes ?? null,
      performed_by: userId,
      // performed_at falls back to the DB default (now()) when omitted.
      ...(payload.performedAt
        ? { performed_at: payload.performedAt }
        : {}),
    };

    const { data, error } = await this.supabase.client
      .from('equipment_checks')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async updateCheck(
    id: string,
    payload: UpdateEquipmentCheckPayload,
  ): Promise<EquipmentCheck> {
    const tenantId = this.requireTenantId();

    // performed_by is intentionally absent — callers shouldn't reattribute.
    const row: Record<string, unknown> = {};
    if (payload.checkType !== undefined) row['check_type'] = payload.checkType;
    if (payload.status !== undefined) row['status'] = payload.status;
    if (payload.notes !== undefined) row['notes'] = payload.notes;
    if (payload.performedAt !== undefined) row['performed_at'] = payload.performedAt;

    const { data, error } = await this.supabase.client
      .from('equipment_checks')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async deleteCheck(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    const { error } = await this.supabase.client
      .from('equipment_checks')
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

function mapRow(row: Record<string, unknown>): EquipmentCheck {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    equipmentId: row['equipment_id'] as string,
    checkType: row['check_type'] as EquipmentCheck['checkType'],
    status: row['status'] as EquipmentCheck['status'],
    notes: (row['notes'] as string | null) ?? null,
    performedBy: row['performed_by'] as string,
    performedAt: row['performed_at'] as string,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
