/**
 * A tenant's physical or logical workspace. Every tenant has exactly
 * one `isDefault = true` site — the mobile app uses it as the landing
 * context when the user hasn't picked a site explicitly.
 */
export interface Site {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  siteType: string | null;
  status: string;
  timezone: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Many-to-many between `user_profiles` and `sites`. Exactly one row
 * per user has `isPrimary = true`. `roleAtSite` is null to mean
 * "inherit from `user_profiles.role`"; populated when a future
 * per-site override lands.
 */
export interface UserSiteMembership {
  id: string;
  userProfileId: string;
  siteId: string;
  isPrimary: boolean;
  roleAtSite: string | null;
  createdAt: string;
}
