import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { environment } from '@env/environment';
import { ModuleKey } from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/**
 * Frontend-only metadata for each module. The DB `modules` table is the
 * canonical list of modules that *exist*; this catalogue adds the things
 * a database row can't: the route path and the icon name. Keeping icon
 * + route here (not in the DB) means the platform can ship new frontend
 * chrome without a DB migration for every module.
 */
export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  icon: string;
  /** Route path this module mounts at, without a leading slash. */
  route: string;
  sortOrder: number;
  /** Mirror of `modules.is_available`; populated after DB load. */
  isAvailable: boolean;
}

/**
 * Static frontend metadata for every module Soteria will ever ship. A
 * module appears in the sidebar only if it is:
 *   (a) available on the platform (this list AND `modules.is_available`)
 *   (b) enabled for the current tenant (a row in `tenant_modules`)
 *
 * When adding a new module: add a row here, insert a row into
 * `public.modules`, and register a lazy route in `app.routes.ts`.
 */
export const MODULE_CATALOGUE: Readonly<Record<ModuleKey, Omit<ModuleDefinition, 'key'>>> = {
  inspections: {
    name: 'Inspections',
    description: 'Schedule and complete safety inspections.',
    icon: 'clipboard-check',
    route: 'inspections',
    sortOrder: 10,
    isAvailable: true,
  },
  equipment_checks: {
    name: 'Equipment',
    description: 'Asset register and pre-use check history.',
    icon: 'wrench',
    route: 'equipment',
    sortOrder: 20,
    isAvailable: true,
  },
  corrective_actions: {
    name: 'Corrective Actions',
    description: 'Track findings through to resolution.',
    icon: 'check-circle',
    route: 'corrective-actions',
    sortOrder: 30,
    isAvailable: true,
  },
  incidents: {
    name: 'Incidents & Near Misses',
    description: 'Report and investigate safety events.',
    icon: 'alert-triangle',
    route: 'incidents',
    sortOrder: 40,
    isAvailable: false,
  },
  toolbox_talks: {
    name: 'Toolbox Talks',
    description: 'Deliver and acknowledge safety briefings.',
    icon: 'message-square',
    route: 'toolbox-talks',
    sortOrder: 50,
    isAvailable: false,
  },
  heat_compliance: {
    name: 'Heat Compliance',
    description: 'Monitor heat exposure and enforce policy.',
    icon: 'thermometer',
    route: 'heat-compliance',
    sortOrder: 60,
    isAvailable: false,
  },
  loto: {
    name: 'LOTO',
    description: 'Lockout/tagout procedures and sign-offs.',
    icon: 'lock',
    route: 'loto',
    sortOrder: 70,
    isAvailable: false,
  },
};

/**
 * Runtime feature-flag service for modules.
 *
 * Responsibilities:
 *   - query `tenant_modules` for the current tenant's enabled modules
 *   - merge the result with the static `MODULE_CATALOGUE` to produce the
 *     list the sidebar renders
 *   - provide fast `isEnabled(key)` lookups for route guards
 *
 * Dev flag: when `environment.enableAllModulesForLocalDev` is true, we
 * skip the DB query and light up every available module so the UI is
 * fully explorable without any seed data.
 */
@Injectable({ providedIn: 'root' })
export class ModuleRegistryService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _enabledKeys = signal<ReadonlySet<ModuleKey>>(new Set());
  private readonly _loading = signal(false);

  readonly enabledKeys = this._enabledKeys.asReadonly();
  readonly loading = this._loading.asReadonly();

  /**
   * The module list the sidebar binds to — available modules the current
   * tenant has enabled, already sorted for display.
   */
  readonly modules = computed<readonly ModuleDefinition[]>(() => {
    const enabled = this._enabledKeys();
    return (Object.keys(MODULE_CATALOGUE) as ModuleKey[])
      .filter((key) => MODULE_CATALOGUE[key].isAvailable && enabled.has(key))
      .map((key) => ({ key, ...MODULE_CATALOGUE[key] }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });

  constructor() {
    effect(() => {
      const tenantId = this.auth.tenantId();
      if (!tenantId) {
        this._enabledKeys.set(new Set());
        return;
      }
      void this.loadEnabledModules(tenantId);
    });
  }

  isEnabled(key: ModuleKey): boolean {
    return this._enabledKeys().has(key);
  }

  /** Loads `tenant_modules` rows where `is_enabled = true` for the tenant. */
  private async loadEnabledModules(tenantId: string): Promise<void> {
    if (environment.enableAllModulesForLocalDev) {
      this._enabledKeys.set(
        new Set(
          (Object.keys(MODULE_CATALOGUE) as ModuleKey[]).filter(
            (key) => MODULE_CATALOGUE[key].isAvailable,
          ),
        ),
      );
      return;
    }

    this._loading.set(true);
    const { data, error } = await this.supabase.client
      .from('tenant_modules')
      .select('module_key')
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true);
    this._loading.set(false);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[Soteria] Failed to load tenant modules', error);
      this._enabledKeys.set(new Set());
      return;
    }

    const keys = (data ?? []).map((row) => row.module_key as ModuleKey);
    this._enabledKeys.set(new Set(keys));
  }
}
