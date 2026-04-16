import { ModuleKey } from './module.model';

/**
 * Join between Tenant and Module. A row with `isEnabled = true` means the
 * tenant has the module turned on. The optional `config` blob is reserved
 * for per-tenant module customization (default templates, thresholds,
 * required fields). Its shape is module-specific and validated per-module
 * at the service layer.
 */
export interface TenantModule {
  id: string;
  tenantId: string;
  moduleKey: ModuleKey;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
