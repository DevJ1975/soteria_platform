import { inject, Injectable } from '@angular/core';

import { ModuleKey } from '@core/models';
import { SupabaseService } from '@core/services/supabase.service';

import {
  PlatformModule,
  UpdatePlatformModulePayload,
} from '../models/platform-admin.model';

/**
 * Platform module catalogue CRUD.
 *
 * Reads are always available via RLS; writes are gated on
 * `platform_admin` by `modules_write_by_platform_admin` (migration
 * 120014). Creating a new module from the UI is intentionally not
 * exposed in this phase — a new module needs frontend code (route,
 * feature folder, catalogue entry) to do anything useful, so the
 * create flow lives in engineering land, not the admin panel.
 * `toggleAvailability` is the common admin operation.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAdminModulesService {
  private readonly supabase = inject(SupabaseService);

  async getModules(): Promise<PlatformModule[]> {
    const { data, error } = await this.supabase.client
      .from('modules')
      .select('key, name, description, sort_order, is_core, is_available, created_at')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      key: r['key'] as ModuleKey,
      name: r['name'] as string,
      description: (r['description'] as string) ?? '',
      sortOrder: (r['sort_order'] as number) ?? 0,
      isCore: (r['is_core'] as boolean) ?? false,
      isAvailable: (r['is_available'] as boolean) ?? false,
      createdAt: r['created_at'] as string,
    }));
  }

  async updateModule(
    key: ModuleKey,
    payload: UpdatePlatformModulePayload,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (payload.name !== undefined) row['name'] = payload.name;
    if (payload.description !== undefined) row['description'] = payload.description;
    if (payload.sortOrder !== undefined) row['sort_order'] = payload.sortOrder;
    if (payload.isCore !== undefined) row['is_core'] = payload.isCore;
    if (payload.isAvailable !== undefined) row['is_available'] = payload.isAvailable;

    const { error } = await this.supabase.client
      .from('modules')
      .update(row)
      .eq('key', key);
    if (error) throw error;
  }

  /** Shorthand for the common case: flip platform-level availability. */
  async toggleAvailability(key: ModuleKey, isAvailable: boolean): Promise<void> {
    await this.updateModule(key, { isAvailable });
  }

  async getCount(): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('modules')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }
}
