/**
 * A Module represents a product capability that tenants can enable
 * (inspections, equipment checks, incidents, training, etc.). Modules are a
 * platform-wide concept — there's one row per module in the catalogue,
 * independent of any tenant.
 *
 * Enabling a module for a specific tenant is represented by the
 * `TenantModule` join (see tenant-module.model.ts).
 */
export interface Module {
  id: string;
  /** Stable, machine-readable key used in code and routes. */
  key: ModuleKey;
  name: string;
  description: string;
  /** Lucide-style icon name the sidebar can render. */
  icon: string;
  /** Marketing/ordering hint for the module picker. */
  sortOrder: number;
  /** If false, the module is hidden from all tenants (e.g. pre-release). */
  isAvailable: boolean;
}

/**
 * Canonical set of module keys for Soteria. Add new modules here as they
 * come online so the rest of the codebase stays type-safe.
 */
export type ModuleKey =
  | 'inspections'
  | 'equipment_checks'
  | 'corrective_actions'
  | 'incidents'
  | 'toolbox_talks'
  | 'heat_compliance'
  | 'loto';
