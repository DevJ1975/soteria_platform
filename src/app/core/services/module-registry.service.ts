import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { environment } from '@env/environment';
import { ModuleKey, TenantModuleAccess } from '../models';
import { AuthService } from './auth.service';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SupabaseService } from './supabase.service';
import { TenantPlanService } from './tenant-plan.service';

/**
 * Frontend-only metadata for each module.
 *
 * The DB `modules` table is the canonical list of modules that *exist*;
 * this catalogue adds icon + route (frontend-only concerns) and mirrors
 * `sort_order` / `is_available` for convenience. When a new module
 * ships: add a row here, insert a row into `public.modules`, include it
 * in the relevant plans via `subscription_plan_modules`, and register
 * its lazy route in `app.routes.ts`.
 */
export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  icon: string;
  route: string;
  sortOrder: number;
  isAvailable: boolean;
}

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
    route: 'incident-reports',
    sortOrder: 40,
    isAvailable: true,
  },
  toolbox_talks: {
    name: 'Toolbox Talks',
    description: 'Training sessions, safety briefings, and attendance.',
    icon: 'message-square',
    route: 'training',
    sortOrder: 50,
    isAvailable: true,
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
 * Access resolution (one truth table, computed from three inputs):
 *
 *   effective(module) =
 *     if module.isCore              → true
 *     if override(module) exists    → override.isEnabled
 *     if module in tenant's plan    → true
 *     else                           → false
 *
 * The service holds the resolved set as a signal, re-computed on every
 * tenant change and whenever the settings page calls `refresh()` after
 * mutating a plan or override.
 *
 * Dev flag: when `environment.enableAllModulesForLocalDev` is true, we
 * skip the DB queries entirely and light up every *available* module so
 * the UI is fully explorable without any seed data.
 */
@Injectable({ providedIn: 'root' })
export class ModuleRegistryService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly plans = inject(SubscriptionPlansService);
  private readonly tenantPlan = inject(TenantPlanService);

  private readonly _enabledKeys = signal<ReadonlySet<ModuleKey>>(new Set());
  private readonly _access = signal<ReadonlyMap<ModuleKey, TenantModuleAccess>>(new Map());
  private readonly _loading = signal(false);

  /**
   * Monotonic counter guarding against out-of-order responses from
   * concurrent `resolveAccess` calls. The effect fires on tenant
   * change; `refresh()` fires from the settings page after each
   * mutation. If an admin flips several overrides quickly, later
   * response can arrive before an earlier one — the guard discards
   * any result whose generation isn't current.
   */
  private resolveGeneration = 0;

  readonly enabledKeys = this._enabledKeys.asReadonly();
  readonly access = this._access.asReadonly();
  readonly loading = this._loading.asReadonly();

  /**
   * The sidebar-facing list: available + effective-enabled modules,
   * sorted for display.
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
        this._access.set(new Map());
        return;
      }
      void this.resolveAccess(tenantId);
    });
  }

  isEnabled(key: ModuleKey): boolean {
    return this._enabledKeys().has(key);
  }

  /**
   * Re-resolve access from the current tenant's plan + overrides.
   * Call this from the settings page after toggling an override or
   * changing the plan so the sidebar and guards pick up the change
   * without requiring a full page reload.
   */
  async refresh(): Promise<void> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return;
    await this.resolveAccess(tenantId);
  }

  private async resolveAccess(tenantId: string): Promise<void> {
    if (environment.enableAllModulesForLocalDev) {
      const all = (Object.keys(MODULE_CATALOGUE) as ModuleKey[]).filter(
        (key) => MODULE_CATALOGUE[key].isAvailable,
      );
      this._enabledKeys.set(new Set(all));
      this._access.set(buildDevAccessMap(all));
      return;
    }

    const gen = ++this.resolveGeneration;
    this._loading.set(true);

    try {
      // Pull everything we need in parallel. Three round-trips, all tiny.
      const [allModulesResult, planId, overrides] = await Promise.all([
        this.supabase.client.from('modules').select('key, is_core, is_available'),
        this.tenantPlan.getTenantPlanId(tenantId),
        this.tenantPlan.getTenantModuleOverrides(tenantId),
      ]);

      // Stale-response guard. If another resolveAccess call has
      // started, its result will win — we drop ours silently.
      if (gen !== this.resolveGeneration) return;

      if (allModulesResult.error) throw allModulesResult.error;

      const allModules = (allModulesResult.data ?? []) as Array<{
        key: ModuleKey;
        is_core: boolean;
        is_available: boolean;
      }>;

      const planModuleKeys = planId
        ? new Set(await this.plans.getPlanModuleKeys(planId))
        : new Set<ModuleKey>();

      if (gen !== this.resolveGeneration) return;

      const overrideMap = new Map<ModuleKey, boolean>();
      for (const o of overrides) {
        overrideMap.set(o.moduleKey, o.isEnabled);
      }

      const access = new Map<ModuleKey, TenantModuleAccess>();
      const enabledSet = new Set<ModuleKey>();

      for (const m of allModules) {
        if (!m.is_available) continue;

        const planDefault = planModuleKeys.has(m.key);
        const override = overrideMap.has(m.key)
          ? { isEnabled: overrideMap.get(m.key)! }
          : null;
        const effective = m.is_core
          ? true
          : override
          ? override.isEnabled
          : planDefault;

        access.set(m.key, {
          moduleKey: m.key,
          isCore: m.is_core,
          planDefault,
          override,
          effective,
        });

        if (effective) enabledSet.add(m.key);
      }

      this._access.set(access);
      this._enabledKeys.set(enabledSet);
    } catch (err) {
      // Swallow after logging so the effect callback doesn't drop an
      // unhandled rejection. `refresh()` callers get a resolved
      // promise — they can check `loading` or `access` for state.
      // eslint-disable-next-line no-console
      console.error('[Soteria] Failed to resolve module access', err);
    } finally {
      if (gen === this.resolveGeneration) this._loading.set(false);
    }
  }
}

/** Dev-mode access map: every available module forced on, no overrides. */
function buildDevAccessMap(
  keys: readonly ModuleKey[],
): ReadonlyMap<ModuleKey, TenantModuleAccess> {
  const map = new Map<ModuleKey, TenantModuleAccess>();
  for (const key of keys) {
    map.set(key, {
      moduleKey: key,
      isCore: false,
      planDefault: true,
      override: null,
      effective: true,
    });
  }
  return map;
}
