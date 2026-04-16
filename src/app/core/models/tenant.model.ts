/**
 * A Tenant is a customer organization. All domain data (inspections,
 * equipment, incidents, etc.) is scoped to a tenant via `tenant_id` and
 * enforced in Supabase with row-level security.
 */
export interface Tenant {
  id: string;
  name: string;
  /** URL-safe identifier, unique across the platform. */
  slug: string;
  status: TenantStatus;
  /** FK to `subscription_plans`. Nullable to support tenants between
   *  plans; see `SubscriptionPlan` + `TenantPlanService` for resolution. */
  planId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
