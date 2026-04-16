import { ModuleKey, TenantStatus } from '@core/models';

/**
 * Soteria platform-admin — payload shapes.
 *
 * The tenant-facing app already has the core entity models (`Tenant`,
 * `SubscriptionPlan`, `PlatformModule` via `ModuleKey`, etc.). This
 * file adds the payloads the admin area uses for writes, plus a few
 * lightweight summary shapes for cross-tenant views.
 */

// -- Tenants -----------------------------------------------------------------

export interface CreateTenantPayload {
  name: string;
  slug: string;
  /**
   * Initial plan for the auto-provisioned trial subscription. Stored
   * on the tenant row just long enough for the
   * `tenants_create_subscription` trigger to pick it up; afterwards
   * `subscriptions.plan_id` is the source of truth.
   */
  planId?: string | null;
  status?: TenantStatus;
}

/**
 * Note: `planId` is intentionally absent. Plan changes after tenant
 * creation flow through `PlatformAdminSubscriptionsService.changePlan`
 * so that the subscription record (source of truth) and the billing
 * event log stay in sync.
 */
export interface UpdateTenantPayload {
  name?: string;
  slug?: string;
  status?: TenantStatus;
}

/**
 * Tenants list row — full `Tenant` plus the plan name resolved via a
 * PostgREST embedded select. Avoids an N+1 per-row plan lookup on the
 * list page.
 */
export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  planId: string | null;
  planName: string | null;
  createdAt: string;
  updatedAt: string;
}


// -- Subscription plans ------------------------------------------------------

export interface CreateSubscriptionPlanPayload {
  key: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  /** Optional Stripe Price id mapping. Usually set via update later. */
  stripePriceId?: string | null;
}

export interface UpdateSubscriptionPlanPayload {
  name?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  /**
   * Stripe Price id (price_XXX) or null/empty to clear. Required
   * before the plan can be offered via Stripe Checkout.
   */
  stripePriceId?: string | null;
}


// -- Platform modules --------------------------------------------------------

/**
 * Full module catalogue entry — the DB row shape with camelCase fields.
 * Distinct from `ModuleDefinition` in ModuleRegistryService, which adds
 * frontend-only metadata (icon, route).
 */
export interface PlatformModule {
  key: ModuleKey;
  name: string;
  description: string;
  sortOrder: number;
  isCore: boolean;
  isAvailable: boolean;
  createdAt: string;
}

export interface UpdatePlatformModulePayload {
  name?: string;
  description?: string;
  sortOrder?: number;
  isCore?: boolean;
  isAvailable?: boolean;
}
