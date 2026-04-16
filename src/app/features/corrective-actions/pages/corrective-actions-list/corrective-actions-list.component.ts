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

import { TenantMember, TenantService } from '@core/services/tenant.service';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import {
  createDebouncer,
  createGenerationGuard,
} from '@shared/utils/async-guards.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { CorrectiveActionPriorityChipComponent } from '../../components/corrective-action-priority-chip/corrective-action-priority-chip.component';
import { CorrectiveActionStatusChipComponent } from '../../components/corrective-action-status-chip/corrective-action-status-chip.component';
import {
  CORRECTIVE_ACTION_PRIORITY_LABEL,
  CORRECTIVE_ACTION_STATUS_LABEL,
  CorrectiveAction,
  CorrectiveActionFilters,
  CorrectiveActionPriority,
  CorrectiveActionStatus,
} from '../../models/corrective-action.model';
import { CorrectiveActionsService } from '../../services/corrective-actions.service';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Corrective actions list page — parallel to inspections list with one
 * extra column (Linked inspection). Shares the same patterns:
 *   - generation counter guards against stale filter responses
 *   - assignee names resolved via tenant roster lookup
 *   - distinct empty states for "none yet" vs "no matches"
 *   - clear-filters button when any filter is active
 */
@Component({
  selector: 'sot-corrective-actions-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    IconComponent,
    CorrectiveActionStatusChipComponent,
    CorrectiveActionPriorityChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Corrective actions"
      subtitle="Track findings, hazards, and compliance items through to resolution."
    >
      <a class="sot-btn sot-btn--primary" routerLink="new">
        <sot-icon name="check-circle" [size]="16" />
        <span>New action</span>
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
          @for (m of members(); track m.id) {
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
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <div class="list-meta">
      <span class="list-meta__count">
        {{ actions().length }}
        {{ actions().length === 1 ? 'action' : 'actions' }}
      </span>
      @if (loading()) {
        <span class="list-meta__loading">Refreshing…</span>
      }
    </div>

    @if (loading() && actions().length === 0) {
      <div class="sot-state">Loading corrective actions…</div>
    } @else if (actions().length === 0 && !hasActiveFilters()) {
      <sot-empty-state
        title="No corrective actions yet"
        body="Create your first action to start tracking findings and hazards through to resolution."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New action</a>
      </sot-empty-state>
    } @else if (actions().length === 0) {
      <sot-empty-state
        title="No matches"
        body="No actions match the current filters. Try clearing them or broadening your search."
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
              <th scope="col">Linked inspection</th>
              <th scope="col">Status</th>
              <th scope="col">Priority</th>
              <th scope="col">Assignee</th>
              <th scope="col">Due date</th>
              <th scope="col" class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (action of actions(); track action.id) {
              <tr>
                <td>
                  <a class="table__title-link" [routerLink]="[action.id, 'edit']">
                    {{ action.title }}
                  </a>
                  @if (action.description) {
                    <p class="table__description">{{ action.description }}</p>
                  }
                </td>
                <td>
                  @if (action.linkedInspection) {
                    <a
                      class="table__link"
                      [routerLink]="['/app/inspections', action.linkedInspection.id, 'edit']"
                    >
                      {{ action.linkedInspection.title }}
                    </a>
                  } @else {
                    <span class="table__muted">—</span>
                  }
                </td>
                <td><sot-corrective-action-status-chip [status]="action.status" /></td>
                <td><sot-corrective-action-priority-chip [priority]="action.priority" /></td>
                <td>{{ assigneeName(action.assignedTo) }}</td>
                <td>{{ action.dueDate ?? '—' }}</td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[action.id, 'edit']"
                    aria-label="Edit corrective action"
                  >Edit</a>
                  <button
                    type="button"
                    class="sot-btn sot-btn--ghost table__btn table__btn--danger"
                    (click)="confirmDelete(action)"
                    aria-label="Delete corrective action"
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
      .filters__clear { display: flex; align-items: flex-end; }

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

      .table__link { color: var(--color-primary); }
      .table__muted { color: var(--color-text-subtle); }

      .table__actions-col { width: 1%; white-space: nowrap; text-align: right; }
      .table__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

      .table__btn { height: 32px; padding: 0 10px; font-size: var(--font-size-sm); }
      .table__btn--danger { color: var(--color-danger); border-color: #fecaca; }
      .table__btn--danger:hover:not(:disabled) { background: #fef2f2; }
    `,
  ],
})
export class CorrectiveActionsListComponent implements OnInit {
  private readonly service = inject(CorrectiveActionsService);
  private readonly tenants = inject(TenantService);
  private readonly guard = createGenerationGuard();
  private readonly debounceSearch = createDebouncer(SEARCH_DEBOUNCE_MS);

  protected readonly actions = signal<CorrectiveAction[]>([]);
  protected readonly members = signal<TenantMember[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly filters = signal<CorrectiveActionFilters>({});

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filters();
    return !!(
      (f.status && f.status !== 'all') ||
      (f.priority && f.priority !== 'all') ||
      (f.assignedTo && f.assignedTo !== 'all') ||
      f.searchText?.trim()
    );
  });

  private readonly memberLookup = computed(() => {
    const map = new Map<string, string>();
    for (const m of this.members()) {
      map.set(m.id, `${m.firstName} ${m.lastName}`.trim() || m.email);
    }
    return map;
  });

  protected readonly statusOptions = (
    Object.keys(CORRECTIVE_ACTION_STATUS_LABEL) as CorrectiveActionStatus[]
  ).map((value) => ({ value, label: CORRECTIVE_ACTION_STATUS_LABEL[value] }));

  protected readonly priorityOptions = (
    Object.keys(CORRECTIVE_ACTION_PRIORITY_LABEL) as CorrectiveActionPriority[]
  ).map((value) => ({ value, label: CORRECTIVE_ACTION_PRIORITY_LABEL[value] }));

  protected readonly assigneeName = (id: string | null): string =>
    id ? this.memberLookup().get(id) ?? 'Unknown' : 'Unassigned';

  async ngOnInit(): Promise<void> {
    void this.tenants.getTenantMembers().then((rows) => this.members.set(rows));
    await this.refresh();
  }

  protected onFilterChange<K extends keyof CorrectiveActionFilters>(
    key: K,
    value: CorrectiveActionFilters[K],
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

  protected async confirmDelete(action: CorrectiveAction): Promise<void> {
    const ok = window.confirm(`Delete "${action.title}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await this.service.deleteCorrectiveAction(action.id);
      this.actions.update((list) => list.filter((r) => r.id !== action.id));
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    }
  }

  private async refresh(): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getCorrectiveActions(this.filters());
      if (!this.guard.isCurrent(gen)) return;
      this.actions.set(rows);
    } catch (err) {
      if (!this.guard.isCurrent(gen)) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (this.guard.isCurrent(gen)) this.loading.set(false);
    }
  }
}
