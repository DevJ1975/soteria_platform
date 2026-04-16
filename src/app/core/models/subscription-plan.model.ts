import { ModuleKey } from './module.model';

/**
 * Soteria subscription plans + module-access resolution.
 *
 * Access model
 * ------------
 * A tenant's effective access to a module is resolved in three layers:
 *
 *   1. `modules.is_core = true`         → always enabled
 *   2. `tenant_modules` override exists → use the override's `is_enabled`
 *   3. module is in the tenant's plan   → enabled
 *   4. otherwise                        → disabled
 *
 * This is implemented in ModuleRegistryService.resolveAccess().
 */

/** Platform catalog of subscription plans (seeded via migration). */
export interface SubscriptionPlan {
  id: string;
  key: SubscriptionPlanKey;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  /**
   * Stripe Price id (price_XXX) mapping this plan to a Stripe Product.
   * Null until an operator populates it via the platform-admin plan
   * editor. The checkout-session edge function refuses to run against
   * an unmapped plan.
   */
  stripePriceId: string | null;
  createdAt: string;
}

export type SubscriptionPlanKey = 'starter' | 'growth' | 'pro';

/** Join-row: "plan X includes module Y." */
export interface SubscriptionPlanModule {
  id: string;
  planId: string;
  moduleKey: ModuleKey;
  createdAt: string;
}

/**
 * A tenant's explicit override of a module's default access. Absence of
 * an override means plan default applies; presence means override wins.
 * Physically stored in `tenant_modules` — the name sticks for backward
 * compat; the semantic role is "override layer."
 */
export interface TenantModuleOverride {
  id: string;
  tenantId: string;
  moduleKey: ModuleKey;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Computed access record for one module for one tenant. Used by the
 * settings page to render a row showing: the plan default, whether an
 * override is in effect, and the final effective state.
 */
export interface TenantModuleAccess {
  moduleKey: ModuleKey;
  isCore: boolean;
  planDefault: boolean;                    // is the module in the tenant's plan
  override: { isEnabled: boolean } | null; // explicit override, if any
  effective: boolean;                      // the final truth — what the app uses
}

