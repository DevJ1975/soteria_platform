/**
 * Soteria users are authenticated by Supabase Auth but their application
 * profile (tenant membership, role, display name) lives in the
 * `user_profiles` table we manage ourselves.
 *
 * `user_profiles.id` is the same UUID as `auth.users.id`, so RLS policies
 * can key off `auth.uid()` directly without a join.
 */
export interface UserProfile {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/**
 * Role hierarchy (broad → narrow):
 *  - platform_admin: Soteria staff. Cross-tenant access.
 *  - admin:         Tenant owner. Can manage users and modules.
 *  - supervisor:    Team lead. Can review submissions and assign actions.
 *  - worker:        Field user. Can submit inspections, report incidents.
 */
export type UserRole = 'platform_admin' | 'admin' | 'supervisor' | 'worker';

/** Convenience helper — the DB stores first/last; the UI usually wants both. */
export function fullNameOf(profile: Pick<UserProfile, 'firstName' | 'lastName'>): string {
  return `${profile.firstName} ${profile.lastName}`.trim();
}
