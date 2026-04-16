import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TenantStatus } from '@core/models';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { formatActivityDate } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { TenantStatusChipComponent } from '../../components/tenant-status-chip/tenant-status-chip.component';
import { TenantSummary } from '../../models/platform-admin.model';
import { PlatformAdminTenantsService } from '../../services/platform-admin-tenants.service';

type StatusFilter = TenantStatus | 'all';

/**
 * Cross-tenant list page.
 *
 * Filters
 * -------
 * - Status dropdown: one of the four `TenantStatus` values plus "all".
 * - Free-text search: matches name, slug, or plan name (case-insensitive
 *   substring). Doing the match client-side is fine at expected scale
 *   (~tens to low hundreds of tenants); when the list grows past a few
 *   hundred we should push search down to PostgREST via `.or(ilike,…)`.
 *
 * Empty states
 * ------------
 * Distinguish "no tenants at all" (prompts the operator to create one)
 * from "no results for this filter" (hints at adjusting the filter).
 * Collapsing these to one message was tempting but hides the actual
 * state and confuses first-time users.
 */
@Component({
  selector: 'sot-platform-admin-tenants-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    TenantStatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Tenants"
      subtitle="Every customer organization on Soteria."
    >
      <a class="sot-btn sot-btn--primary" routerLink="new">New tenant</a>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <section class="toolbar sot-card">
      <div class="toolbar__field">
        <label class="sot-label" for="tenant-search">Search</label>
        <input
          id="tenant-search"
          type="search"
          class="sot-input"
          placeholder="Name, slug, or plan"
          [ngModel]="searchText()"
          (ngModelChange)="searchText.set($event)"
        />
      </div>

      <div class="toolbar__field">
        <label class="sot-label" for="tenant-status">Status</label>
        <select
          id="tenant-status"
          class="sot-input"
          [ngModel]="statusFilter()"
          (ngModelChange)="statusFilter.set($event)"
        >
          <option value="all">All statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <p class="toolbar__summary">
        {{ filteredTenants().length }} of {{ tenants().length }}
      </p>
    </section>

    @if (loading() && tenants().length === 0) {
      <div class="sot-state">Loading tenants…</div>
    } @else if (tenants().length === 0) {
      <sot-empty-state
        title="No tenants yet"
        body="Tenants are created via sign-up. Use the button above to add one manually."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New tenant</a>
      </sot-empty-state>
    } @else if (filteredTenants().length === 0) {
      <sot-empty-state
        title="No tenants match your filters"
        body="Try a different status or clear the search box."
      >
        <button type="button" class="sot-btn sot-btn--ghost" (click)="clearFilters()">
          Clear filters
        </button>
      </sot-empty-state>
    } @else {
      <div class="sot-card table-card">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Slug</th>
              <th scope="col">Plan</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col" class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (t of filteredTenants(); track t.id) {
              <tr>
                <td>
                  <a class="table__title-link" [routerLink]="[t.id, 'edit']">{{ t.name }}</a>
                </td>
                <td class="table__mono">{{ t.slug }}</td>
                <td>
                  @if (t.planName) {
                    <span class="plan-chip">{{ t.planName }}</span>
                  } @else {
                    <span class="table__muted">—</span>
                  }
                </td>
                <td><sot-tenant-status-chip [status]="t.status" /></td>
                <td>{{ formatDate(t.createdAt) }}</td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[t.id, 'edit']"
                  >Edit</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .toolbar {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
        gap: var(--space-4);
        align-items: end;
        padding: var(--space-4) var(--space-5);
        margin-bottom: var(--space-4);
      }
      .toolbar__field { display: flex; flex-direction: column; }
      .toolbar__summary {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin: 0;
        padding-bottom: 10px;
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 640px) {
        .toolbar {
          grid-template-columns: 1fr;
        }
        .toolbar__summary { padding-bottom: 0; }
      }

      .table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--font-size-base);
      }

      .table thead th {
        text-align: left;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-muted);
        color: var(--color-text-muted);
        font-weight: 600;
        font-size: var(--font-size-xs);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--color-border);
      }

      .table tbody td {
        padding: var(--space-3) var(--space-4);
        border-bottom: 1px solid var(--color-border);
        vertical-align: middle;
      }
      .table tbody tr:last-child td { border-bottom: none; }
      .table tbody tr:hover { background: var(--color-surface-muted); }

      .table__title-link { font-weight: 600; color: var(--color-text); }
      .table__title-link:hover { color: var(--color-primary); text-decoration: underline; }

      .table__mono {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: var(--font-size-sm);
      }

      .table__muted { color: var(--color-text-subtle); }

      .table__actions-col { width: 1%; white-space: nowrap; text-align: right; }
      .table__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
      .table__btn { height: 32px; padding: 0 10px; font-size: var(--font-size-sm); }

      .plan-chip {
        display: inline-flex;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        border: 1px solid #bfdbfe;
      }
    `,
  ],
})
export class PlatformAdminTenantsListComponent implements OnInit {
  private readonly service = inject(PlatformAdminTenantsService);

  protected readonly tenants = signal<TenantSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly searchText = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly formatDate = formatActivityDate;

  /**
   * Client-side filter over the loaded tenant list. Re-runs whenever
   * any of its signal inputs change; cheap at expected scale.
   */
  protected readonly filteredTenants = computed(() => {
    const status = this.statusFilter();
    const needle = this.searchText().trim().toLowerCase();
    return this.tenants().filter((t) => {
      if (status !== 'all' && t.status !== status) return false;
      if (needle) {
        const haystack =
          `${t.name} ${t.slug} ${t.planName ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.tenants.set(await this.service.getTenants());
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load tenants.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.statusFilter.set('all');
  }
}
