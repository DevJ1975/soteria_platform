import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { Tenant } from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/**
 * Exposes the "current tenant" — the organization the signed-in user
 * belongs to — as a signal. Automatically refreshes whenever the auth
 * profile changes, so components don't need to subscribe.
 *
 * When Soteria eventually supports users in multiple tenants (contractors
 * working for several clients), this service is where a "switch tenant"
 * action will live.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly _tenant = signal<Tenant | null>(null);
  private readonly _loading = signal(false);

  readonly tenant = this._tenant.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly tenantName = computed(() => this._tenant()?.name ?? '');

  constructor() {
    effect(() => {
      const tenantId = this.auth.tenantId();
      if (!tenantId) {
        this._tenant.set(null);
        return;
      }
      void this.loadTenant(tenantId);
    });
  }

  private async loadTenant(tenantId: string): Promise<void> {
    this._loading.set(true);
    const { data, error } = await this.supabase.client
      .from('tenants')
      .select('id, name, slug, status, created_at, updated_at')
      .eq('id', tenantId)
      .maybeSingle();
    this._loading.set(false);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[Soteria] Failed to load tenant', error);
      return;
    }

    this._tenant.set(data ? mapTenantRow(data) : null);
  }
}

function mapTenantRow(row: Record<string, unknown>): Tenant {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    slug: row['slug'] as string,
    status: (row['status'] as Tenant['status']) ?? 'active',
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
