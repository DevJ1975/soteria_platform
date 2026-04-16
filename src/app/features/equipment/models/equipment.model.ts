/**
 * Soteria equipment — domain models.
 *
 * An equipment row represents a physical asset (forklift, lift, truck,
 * etc.) that gets checked periodically. Every asset is tenant-scoped;
 * RLS enforces isolation at the DB layer.
 */

export type EquipmentStatus = 'active' | 'maintenance' | 'out_of_service' | 'retired';

/**
 * Common equipment types. Stored as plain text in the DB so tenants can
 * add their own later; the frontend pins this union for type-safe forms
 * and filters. The string values double as DB values — lowercase,
 * underscore-separated.
 */
export type EquipmentType =
  | 'forklift'
  | 'scissor_lift'
  | 'boom_lift'
  | 'pallet_jack'
  | 'truck'
  | 'trailer'
  | 'other';

export interface Equipment {
  id: string;
  tenantId: string;
  siteId: string | null;
  name: string;
  assetTag: string;
  equipmentType: EquipmentType;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  status: EquipmentStatus;
  createdAt: string;
  updatedAt: string;
}

/** Fields the client may send on create. `tenant_id` is filled by service. */
export interface CreateEquipmentPayload {
  name: string;
  assetTag: string;
  equipmentType: EquipmentType;
  status?: EquipmentStatus;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  siteId?: string | null;
}

export interface UpdateEquipmentPayload {
  name?: string;
  assetTag?: string;
  equipmentType?: EquipmentType;
  status?: EquipmentStatus;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  siteId?: string | null;
}

/** List-page filter shape. */
export interface EquipmentFilters {
  status?: EquipmentStatus | 'all';
  equipmentType?: EquipmentType | 'all';
  searchText?: string;
}

/** Display labels — single source of truth shared by chips, forms, filters. */
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  active: 'Active',
  maintenance: 'In maintenance',
  out_of_service: 'Out of service',
  retired: 'Retired',
};

export const EQUIPMENT_TYPE_LABEL: Record<EquipmentType, string> = {
  forklift: 'Forklift',
  scissor_lift: 'Scissor lift',
  boom_lift: 'Boom lift',
  pallet_jack: 'Pallet jack',
  truck: 'Truck',
  trailer: 'Trailer',
  other: 'Other',
};
