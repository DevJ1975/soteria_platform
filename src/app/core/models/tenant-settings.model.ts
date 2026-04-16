/**
 * Per-tenant configuration. Three JSONB buckets keep the columns
 * self-documenting about intent; consumers narrow the `Record` to the
 * specific shape they care about.
 *
 *   branding          → logos, colors, display-name overrides
 *   mobileSettings    → mobile-app behavior flags (landing module,
 *                       camera, QR, offline drafts, …)
 *   featureSettings   → miscellaneous feature toggles. Not per-module;
 *                       module access is still governed by
 *                       tenant_modules.
 */
export interface TenantSettings {
  tenantId: string;
  branding: Record<string, unknown>;
  mobileSettings: Record<string, unknown>;
  featureSettings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Typed view of the mobile settings we know about today. The JSONB
 * column will carry additional keys as the mobile app evolves —
 * narrow to this subset where the TS helps and cast where it doesn't.
 */
export interface MobileSettings {
  default_landing_module?: string;
  enable_camera_uploads?: boolean;
  enable_qr_scanning?: boolean;
  offline_drafts_enabled?: boolean;
}
