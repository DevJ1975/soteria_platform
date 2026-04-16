import { inject, Injectable } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { SupabaseService } from '@core/services/supabase.service';
import { escapeIlikePattern } from '@shared/utils/errors.util';

import {
  CreateEquipmentPayload,
  Equipment,
  EquipmentFilters,
  UpdateEquipmentPayload,
} from '../models/equipment.model';

/**
 * Data access for `public.equipment`.
 *
 * Tenant isolation follows the same two-layer pattern used across
 * Soteria: RLS is authoritative, and every query carries an explicit
 * `.eq('tenant_id', …)` for defense-in-depth and self-documenting intent.
 */
@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async getEquipment(filters: EquipmentFilters = {}): Promise<Equipment[]> {
    const tenantId = this.requireTenantId();

    let query = this.supabase.client
      .from('equipment')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.equipmentType && filters.equipmentType !== 'all') {
      query = query.eq('equipment_type', filters.equipmentType);
    }
    if (filters.searchText?.trim()) {
      // Match on either name or asset_tag so a user can find an asset
      // by either identifier. PostgREST `or` filter with comma-joined
      // predicates handles this in one round-trip.
      const pattern = escapeIlikePattern(filters.searchText.trim());
      query = query.or(
        `name.ilike.%${pattern}%,asset_tag.ilike.%${pattern}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    const tenantId = this.requireTenantId();
    const { data, error } = await this.supabase.client
      .from('equipment')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async createEquipment(payload: CreateEquipmentPayload): Promise<Equipment> {
    const tenantId = this.requireTenantId();

    const row = {
      tenant_id: tenantId,
      name: payload.name,
      asset_tag: payload.assetTag,
      equipment_type: payload.equipmentType,
      status: payload.status ?? 'active',
      manufacturer: payload.manufacturer ?? null,
      model: payload.model ?? null,
      serial_number: payload.serialNumber ?? null,
      site_id: payload.siteId ?? null,
    };

    const { data, error } = await this.supabase.client
      .from('equipment')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async updateEquipment(
    id: string,
    payload: UpdateEquipmentPayload,
  ): Promise<Equipment> {
    const tenantId = this.requireTenantId();

    const row: Record<string, unknown> = {};
    if (payload.name !== undefined) row['name'] = payload.name;
    if (payload.assetTag !== undefined) row['asset_tag'] = payload.assetTag;
    if (payload.equipmentType !== undefined) row['equipment_type'] = payload.equipmentType;
    if (payload.status !== undefined) row['status'] = payload.status;
    if (payload.manufacturer !== undefined) row['manufacturer'] = payload.manufacturer;
    if (payload.model !== undefined) row['model'] = payload.model;
    if (payload.serialNumber !== undefined) row['serial_number'] = payload.serialNumber;
    if (payload.siteId !== undefined) row['site_id'] = payload.siteId;

    const { data, error } = await this.supabase.client
      .from('equipment')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async deleteEquipment(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    const { error } = await this.supabase.client
      .from('equipment')
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

function mapRow(row: Record<string, unknown>): Equipment {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    siteId: (row['site_id'] as string | null) ?? null,
    name: row['name'] as string,
    assetTag: row['asset_tag'] as string,
    equipmentType: row['equipment_type'] as Equipment['equipmentType'],
    manufacturer: (row['manufacturer'] as string | null) ?? null,
    model: (row['model'] as string | null) ?? null,
    serialNumber: (row['serial_number'] as string | null) ?? null,
    status: row['status'] as Equipment['status'],
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
