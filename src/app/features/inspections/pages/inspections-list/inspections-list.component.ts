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

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { IconComponent } from '@shared/components/icon/icon.component';

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

/**
 * Inspections list page. Owns its own filter state as a signal; the
 * service call re-runs whenever filters change. For page-size concerns
 * we'll add pagination in a later pass — for phase 3 a simple load-all
 * is fine while row counts are small.
 */
@Component({
  selector: 'sot-inspections-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
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
          (ngModelChange)="updateFilter('searchText', $event)"
        />
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-status">Status</label>
        <select
          id="filter-status"
          class="sot-input"
          [ngModel]="filters().status ?? 'all'"
          (ngModelChange)="updateFilter('status', $event)"
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
          (ngModelChange)="updateFilter('priority', $event)"
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
          (ngModelChange)="updateFilter('assignedTo', $event)"
        >
          <option value="all">Everyone</option>
          <option value="me">Assigned to me</option>
        </select>
      </div>
    </section>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">
        {{ errorMessage() }}
      </div>
    }

    @if (loading() && inspections().length === 0) {
      <div class="state">Loading inspections…</div>
    } @else if (inspections().length === 0) {
      <sot-empty-state
        title="No inspections yet"
        body="Create your first inspection to get started. You can edit and reassign it any time."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New inspection</a>
      </sot-empty-state>
    } @else {
      <div class="sot-card table-card">
        <table class="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Due date</th>
              <th class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (inspection of inspections(); track inspection.id) {
              <tr>
                <td>
                  <a
                    class="table__title-link"
                    [routerLink]="[inspection.id, 'edit']"
                  >
                    {{ inspection.title }}
                  </a>
                  @if (inspection.description) {
                    <p class="table__description">{{ inspection.description }}</p>
                  }
                </td>
                <td>{{ typeLabel(inspection) }}</td>
                <td>
                  <sot-inspection-status-chip [status]="inspection.status" />
                </td>
                <td>
                  <sot-inspection-priority-chip [priority]="inspection.priority" />
                </td>
                <td>
                  {{ inspection.dueDate ?? '—' }}
                </td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[inspection.id, 'edit']"
                    title="Edit"
                  >Edit</a>
                  <button
                    type="button"
                    class="sot-btn sot-btn--ghost table__btn table__btn--danger"
                    (click)="confirmDelete(inspection)"
                    title="Delete"
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
        margin-bottom: var(--space-5);
      }
      .filters__field { display: flex; flex-direction: column; }

      .state {
        padding: var(--space-6);
        text-align: center;
        color: var(--color-text-muted);
        background: var(--color-surface);
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-lg);
      }

      .table-card { padding: 0; overflow: hidden; }

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

      .table tbody tr:hover {
        background: var(--color-surface-muted);
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

  protected readonly inspections = signal<Inspection[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly filters = signal<InspectionFilters>({});

  protected readonly statusOptions = (Object.keys(INSPECTION_STATUS_LABEL) as InspectionStatus[])
    .map((value) => ({ value, label: INSPECTION_STATUS_LABEL[value] }));
  protected readonly priorityOptions = (Object.keys(INSPECTION_PRIORITY_LABEL) as InspectionPriority[])
    .map((value) => ({ value, label: INSPECTION_PRIORITY_LABEL[value] }));

  protected readonly typeLabel = (i: Inspection): string =>
    INSPECTION_TYPE_LABEL[i.inspectionType] ?? i.inspectionType;

  // Debounce the search query so we don't hammer Supabase on every keypress.
  private searchDebounce?: ReturnType<typeof setTimeout>;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  protected updateFilter<K extends keyof InspectionFilters>(
    key: K,
    value: InspectionFilters[K],
  ): void {
    this.filters.update((f) => ({ ...f, [key]: value }));

    if (key === 'searchText') {
      clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => void this.refresh(), 250);
    } else {
      void this.refresh();
    }
  }

  protected async confirmDelete(inspection: Inspection): Promise<void> {
    // Native confirm is fine for phase 3. A custom modal can replace it
    // later without changing the call site.
    const ok = window.confirm(
      `Delete "${inspection.title}"? This cannot be undone.`,
    );
    if (!ok) return;

    try {
      await this.service.deleteInspection(inspection.id);
      this.inspections.update((list) => list.filter((r) => r.id !== inspection.id));
    } catch (err) {
      this.errorMessage.set(extractMessage(err));
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getInspections(this.filters());
      this.inspections.set(rows);
    } catch (err) {
      this.errorMessage.set(extractMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
