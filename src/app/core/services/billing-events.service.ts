import { inject, Injectable } from '@angular/core';

import { BillingEvent, BillingEventType } from '../models/subscription.model';
import { SupabaseService } from './supabase.service';

interface LogEventPayload {
  tenantId: string;
  subscriptionId?: string | null;
  eventType: BillingEventType;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only billing event log.
 *
 * Most events are authored by DB triggers (`subscription_created`,
 * `trial_started`) or by `PlatformAdminSubscriptionsService` after a
 * successful write — this service is the single client surface for
 * reading them and for explicitly logging ad-hoc events from operator
 * tools.
 *
 * Tenant users can read their own tenant's events via RLS; writes are
 * platform-admin only (enforced at the DB level too). Tenant-side UI
 * can therefore safely render an "audit trail" without worrying about
 * accidental cross-tenant leakage.
 */
@Injectable({ providedIn: 'root' })
export class BillingEventsService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Writes a single billing event. Fails on RLS for non-platform-admin
   * callers — intentional: tenant-side code shouldn't synthesize
   * billing events.
   */
  async logEvent(payload: LogEventPayload): Promise<BillingEvent> {
    const { data, error } = await this.supabase.client
      .from('billing_events')
      .insert({
        tenant_id: payload.tenantId,
        subscription_id: payload.subscriptionId ?? null,
        event_type: payload.eventType,
        metadata: payload.metadata ?? {},
      })
      .select(BILLING_EVENT_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  /**
   * Newest-first event stream for a given tenant. Bounded by `limit`
   * because the table is append-only and grows unboundedly over the
   * tenant's lifetime.
   */
  async getTenantEvents(
    tenantId: string,
    limit = 50,
  ): Promise<BillingEvent[]> {
    const { data, error } = await this.supabase.client
      .from('billing_events')
      .select(BILLING_EVENT_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }
}

const BILLING_EVENT_COLUMNS =
  'id, tenant_id, subscription_id, event_type, metadata, created_at';

function mapRow(row: unknown): BillingEvent {
  const r = row as Record<string, unknown>;
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    subscriptionId: (r['subscription_id'] as string | null) ?? null,
    eventType: r['event_type'] as BillingEvent['eventType'],
    metadata: (r['metadata'] as Record<string, unknown>) ?? {},
    createdAt: r['created_at'] as string,
  };
}
