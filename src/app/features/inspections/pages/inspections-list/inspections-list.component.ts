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

import { TenantMemberLookupService } from '@core/services/tenant-member-lookup.service';
import { CorrectiveActionsService } from '@features/corrective-actions/services/corrective-actions.service';
import { CountBadgeComponent } from '@shared/components/count-badge/count-badge.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import {
  createDebouncer,
  createGenerationGuard,
} from '@shared/utils/async-guards.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { InspectionPriorityChipComponent } from '../../components/inspection-priority-chip/inspection-priority-chip.component';
import { InspectionStatusChipComponent } from '../../components/inspection-status-chip/inspection-status-chip.component';
import {
  INSPECTION_PRIORITY_LABEL,
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPE_LABEL,
  Inspection,
  InspectionFilters,
  InspectionPriority,
  InspectionStatus,
} from '../../models/inspection.model';
import { InspectionsService } from '../../services/inspections.service';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Inspections list page.
 *
 * Notes on a few non-obvious choices
 * ----------------------------------
 * * The list and the filter are independent signals. Filter writes kick a
 *   debounced refresh. Non-search filters refresh immediately.
 * * `refreshGeneration` is a monotonic counter used to ignore stale server
 *   responses — if a user changes filters faster than the network, the
 *   older request's result gets dropped instead of overwriting newer data.
 * * Assignee names are resolved via an in-memory map built from the tenant
 *   roster. This avoids a join on every query and keeps the service
 *   endpoint shape minimal. When the roster grows large we'll paginate it,
 *   but that's a separate problem from this page.
 */
@Component({
  selector: 'sot-inspections-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    CountBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    InspectionStatusChipComponent,
    InspectionPriorityChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Inspections"
      subtitle="Plan, assign, and track safety inspections across your sites."
    >
      <a class="sot-btn sot-btn--primary" routerLink="new">
        <sot-icon name="clipboard-check" [size]="16" />
        <span>New inspection</span>
      </a>
    </sot-page-header>

    <section class="filters sot-card">
      <div class="filters__field">
        <label class="sot-label" for="search">Search title</label>
        <input
          id="search"
          type="text"
          class="sot-input"
          placeholder="Type to search…"
          [ngModel]="filters().searchText ?? ''"
          (ngModelChange)="onSearchChange($event)"
        />
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-status">Status</label>
        <select
          id="filter-status"
          class="sot-input"
          [ngModel]="filters().status ?? 'all'"
          (ngModelChange)="onFilterChange('status', $event)"
        >
          <option value="all">All statuses</option>
          @for (opt of statusOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-priority">Priority</label>
        <select
          id="filter-priority"
          class="sot-input"
          [ngModel]="filters().priority ?? 'all'"
          (ngModelChange)="onFilterChange('priority', $event)"
        >
          <option value="all">All priorities</option>
          @for (opt of priorityOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-assigned">Assigned to</label>
        <select
          id="filter-assigned"
          class="sot-input"
          [ngModel]="filters().assignedTo ?? 'all'"
          (ngModelChange)="onFilterChange('assignedTo', $event)"
        >
          <option value="all">Everyone</option>
          <option value="me">Assigned to me</option>
          @for (m of lookup.members(); track m.id) {
            <option [value]="m.id">{{ m.firstName }} {{ m.lastName }}</option>
          }
        </select>
      </div>

      @if (hasActiveFilters()) {
        <div class="filters__clear">
          <button type="button" class="sot-btn sot-btn--ghost" (click)="clearFilters()">
            Clear filters
          </button>
        </div>
      }
    </section>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">
        {{ errorMessage() }}
      </div>
    }

    <div class="list-meta">
      <span class="list-meta__count">
        {{ inspections().length }}
        {{ inspections().length === 1 ? 'inspection' : 'inspections' }}
      </span>
      @if (loading()) {
        <span class="list-meta__loading">Refreshing…</span>
      }
    </div>

    @if (loading() && inspections().length === 0) {
      <div class="sot-state">Loading inspections…</div>
    } @else if (inspections().length === 0 && !hasActiveFilters()) {
      <sot-empty-state
        title="No inspections yet"
        body="Create your first inspection to get started. You can edit and reassign it any time."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New inspection</a>
      </sot-empty-state>
    } @else if (inspections().length === 0) {
      <sot-empty-state
        title="No matches"
        body="No inspections match the current filters. Try clearing them or broadening your search."
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
              <th scope="col">Title</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Priority</th>
              <th scope="col">Assignee</th>
              <th scope="col">Due date</th>
              <th scope="col" class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (inspection of inspections(); track inspection.id) {
              <tr>
                <td>
                  <div class="table__title-row">
                    <a class="table__title-link" [routerLink]="[inspection.id, 'edit']">
                      {{ inspection.title }}
                    </a>
                    <sot-count-badge
                      [count]="openActionCounts().get(inspection.id) ?? 0"
                      label="open"
                      tooltip="Open corrective actions"
                    />
                  </div>
                  @if (inspection.description) {
                    <p class="table__description">{{ inspection.description }}</p>
                  }
                </td>
                <td>{{ typeLabel(inspection) }}</td>
                <td><sot-inspection-status-chip [status]="inspection.status" /></td>
                <td><sot-inspection-priority-chip [priority]="inspection.priority" /></td>
                <td>{{ lookup.formatName(inspection.assignedTo) }}</td>
                <td>{{ inspection.dueDate ?? '—' }}</td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[inspection.id, 'edit']"
                    aria-label="Edit inspection"
                  >Edit</a>
                  <button
                    type="button"
                    class="sot-btn sot-btn--ghost table__btn table__btn--danger"
                    (click)="confirmDelete(inspection)"
                    aria-label="Delete inspection"
                  >Delete</button>
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
      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      .filters__field { display: flex; flex-direction: column; }
      .filters__clear {
        display: flex;
        align-items: flex-end;
      }

      .list-meta {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
      }
      .list-meta__count { font-weight: 500; color: var(--color-text); }
      .list-meta__loading { color: var(--color-text-subtle); font-style: italic; }

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

      .table__title-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .table__title-link {
        font-weight: 600;
        color: var(--color-text);
      }
      .table__title-link:hover {
        color: var(--color-primary);
        text-decoration: underline;
      }

      .table__description {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin-top: 2px;
        max-width: 48ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .table__actions-col { width: 1%; white-space: nowrap; text-align: right; }
      .table__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

      .table__btn { height: 32px; padding: 0 10px; font-size: var(--font-size-sm); }
      .table__btn--danger { color: var(--color-danger); border-color: #fecaca; }
      .table__btn--danger:hover:not(:disabled) { background: #fef2f2; }
    `,
  ],
})
export class InspectionsListComponent implements OnInit {
  private readonly service = inject(InspectionsService);
  private readonly caService = inject(CorrectiveActionsService);
  protected readonly lookup = inject(TenantMemberLookupService);
  private readonly guard = createGenerationGuard();
  private readonly debounceSearch = createDebouncer(SEARCH_DEBOUNCE_MS);

  protected readonly inspections = signal<Inspection[]>([]);
  protected readonly openActionCounts = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly filters = signal<InspectionFilters>({});

  /** True if any filter is active; powers the "Clear filters" affordance. */
  protected readonly hasActiveFilters = computed(() => {
    const f = this.filters();
    return !!(
      (f.status && f.status !== 'all') ||
      (f.priority && f.priority !== 'all') ||
      (f.assignedTo && f.assignedTo !== 'all') ||
      f.searchText?.trim()
    );
  });

  protected readonly statusOptions = (
    Object.keys(INSPECTION_STATUS_LABEL) as InspectionStatus[]
  ).map((value) => ({ value, label: INSPECTION_STATUS_LABEL[value] }));

  protected readonly priorityOptions = (
    Object.keys(INSPECTION_PRIORITY_LABEL) as InspectionPriority[]
  ).map((value) => ({ value, label: INSPECTION_PRIORITY_LABEL[value] }));

  protected readonly typeLabel = (i: Inspection): string =>
    INSPECTION_TYPE_LABEL[i.inspectionType] ?? i.inspectionType;

  async ngOnInit(): Promise<void> {
    // Fire the roster load in parallel — the lookup is a cached singleton
    // so multiple list pages share one fetch per session.
    void this.lookup.ensureLoaded();
    // Load the open-action counts in parallel with the main refresh.
    // Counts aren't reactive to CA changes made elsewhere — they
    // refresh on ngOnInit, which covers the "user added an action then
    // navigated back" case via Angular's default route re-init.
    void this.caService
      .getOpenCountsByInspection()
      .then((m) => this.openActionCounts.set(m))
      .catch(() => void 0); // counts are a nice-to-have; don't fail the page on error
    await this.refresh();
  }

  protected onFilterChange<K extends keyof InspectionFilters>(
    key: K,
    value: InspectionFilters[K],
  ): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    void this.refresh();
  }

  protected onSearchChange(value: string): void {
    this.filters.update((f) => ({ ...f, searchText: value }));
    this.debounceSearch(() => void this.refresh());
  }

  protected clearFilters(): void {
    this.filters.set({});
    void this.refresh();
  }

  protected async confirmDelete(inspection: Inspection): Promise<void> {
    const ok = window.confirm(
      `Delete "${inspection.title}"? This cannot be undone.`,
    );
    if (!ok) return;

    try {
      await this.service.deleteInspection(inspection.id);
      this.inspections.update((list) => list.filter((r) => r.id !== inspection.id));
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    }
  }

  private async refresh(): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getInspections(this.filters());
      if (!this.guard.isCurrent(gen)) return; // stale response; ignore
      this.inspections.set(rows);
    } catch (err) {
      if (!this.guard.isCurrent(gen)) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (this.guard.isCurrent(gen)) this.loading.set(false);
    }
  }
}
