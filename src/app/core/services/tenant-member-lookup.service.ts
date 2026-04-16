import { computed, inject, Injectable, signal } from '@angular/core';

import { TenantMember, TenantService } from './tenant.service';

/**
 * Cached directory of the current tenant's members, with name formatting.
 *
 * Why this exists
 * ---------------
 * Five features (two list pages + two form dropdowns + the equipment
 * checks panel) were each loading the roster separately via
 * `TenantService.getTenantMembers()` and each carried its own
 * "id → name" formatter. That's five network calls for one dataset and
 * five places where the fallback text could drift.
 *
 * Usage
 * -----
 * In a component:
 *
 *   private readonly lookup = inject(TenantMemberLookupService);
 *
 *   constructor() {
 *     void this.lookup.ensureLoaded();    // fire-and-forget
 *   }
 *
 *   // In templates:
 *   @for (m of lookup.members(); track m.id) { … }   // dropdowns
 *   {{ lookup.formatName(row.assignedTo) }}          // display
 *
 * `formatName` is safe to call before `ensureLoaded()` resolves — it
 * returns `'Unassigned'` / `'Unknown'` until the data arrives, then the
 * signal re-emits and views update reactively.
 */
@Injectable({ providedIn: 'root' })
export class TenantMemberLookupService {
  private readonly tenants = inject(TenantService);

  private readonly _byId = signal<ReadonlyMap<string, TenantMember>>(new Map());
  private loadPromise: Promise<void> | null = null;

  /** Reactive member list for dropdowns. Sorted by first name. */
  readonly members = computed<readonly TenantMember[]>(() =>
    Array.from(this._byId().values()).sort((a, b) =>
      a.firstName.localeCompare(b.firstName),
    ),
  );

  /** Single-flight loader. Subsequent calls return the same promise. */
  ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.tenants.getTenantMembers().then((rows) => {
        this._byId.set(new Map(rows.map((r) => [r.id, r])));
      });
    }
    return this.loadPromise;
  }

  /**
   * Format a user id for display.
   * - Returns `unassignedText` when id is null (default "Unassigned").
   * - Returns `'Unknown'` when the roster hasn't loaded yet or the id is
   *   a user outside the tenant (shouldn't happen under RLS, but we
   *   fail gracefully rather than blank).
   */
  formatName(id: string | null, unassignedText = 'Unassigned'): string {
    if (!id) return unassignedText;
    const m = this._byId().get(id);
    if (!m) return 'Unknown';
    return `${m.firstName} ${m.lastName}`.trim() || m.email;
  }

  /**
   * Invalidate the cache. Future calls to `ensureLoaded()` refetch.
   * Intended for: tenant switch (when that ships), or a manual refresh
   * after inviting new users.
   */
  reset(): void {
    this.loadPromise = null;
    this._byId.set(new Map());
  }
}
