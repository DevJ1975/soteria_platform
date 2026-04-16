import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '@core/services/supabase.service';

import {
  ProvisionTenantPayload,
  ProvisionTenantResult,
} from '../models/platform-admin.model';

/**
 * Orchestrated tenant provisioning via the `provision-tenant` Edge
 * Function.
 *
 * Why a separate service from `PlatformAdminTenantsService`
 * --------------------------------------------------------
 * The tenants service is scoped to direct CRUD against the `tenants`
 * table. Provisioning involves an RPC, the Supabase Auth Admin API,
 * and partial-success semantics (the invite may fail while the tenant
 * is already committed). Keeping that in its own service prevents the
 * CRUD surface from growing tangled.
 *
 * Used by `/platform-admin/tenants/new`. Pattern mirrors
 * `BillingActionsService` — thin wrapper around
 * `supabase.functions.invoke(...)`.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAdminProvisioningService {
  private readonly supabase = inject(SupabaseService);

  async provisionTenant(
    payload: ProvisionTenantPayload,
  ): Promise<ProvisionTenantResult> {
    const { data, error } =
      await this.supabase.client.functions.invoke<ProvisionTenantResult>(
        'provision-tenant',
        { body: payload },
      );
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Provisioning returned no response.');
    return data;
  }
}
