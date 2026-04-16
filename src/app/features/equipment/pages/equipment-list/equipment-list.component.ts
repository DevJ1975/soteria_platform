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

import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import {
  createDebouncer,
  createGenerationGuard,
} from '@shared/utils/async-guards.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { EquipmentStatusChipComponent } from '../../components/equipment-status-chip/equipment-status-chip.component';
import {
  EQUIPMENT_STATUS_LABEL,
  EQUIPMENT_TYPE_LABEL,
  Equipment,
  EquipmentFilters,
  EquipmentStatus,
  EquipmentType,
} from '../../models/equipment.model';
import { EquipmentService } from '../../services/equipment.service';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Equipment list page. Same patterns as inspections and corrective-actions:
 *   - generation counter for stale-response guarding
 *   - debounced search
 *   - separate empty-vs-no-matches states
 *   - clear-filters button
 *
 * Clicking a row's title goes to the detail page (read-mostly view with
 * check history); Edit and Delete are explicit row actions. The detail
 * link is the primary action because most operators spend more time
 * reading check history than editing the equipment record itself.
 */
@Component({
  selector: 'sot-equipment-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    IconComponent,
    EquipmentStatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Equipment"
      subtitle="Registered assets and their check history."
    >
      <a class="sot-btn sot-btn--primary" routerLink="new">
        <sot-icon name="wrench" [size]="16" />
        <span>New equipment</span>
      </a>
    </sot-page-header>

    <section class="filters sot-card">
      <div class="filters__field">
        <label class="sot-label" for="search">Search</label>
        <input
          id="search"
          type="text"
          class="sot-input"
          placeholder="Name or asset tag…"
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
        <label class="sot-label" for="filter-type">Type</label>
        <select
          id="filter-type"
          class="sot-input"
          [ngModel]="filters().equipmentType ?? 'all'"
          (ngModelChange)="onFilterChange('equipmentType', $event)"
        >
          <option value="all">All types</option>
          @for (opt of typeOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
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
        {{ equipment().length }}
        {{ equipment().length === 1 ? 'item' : 'items' }}
      </span>
      @if (loading()) {
        <span class="list-meta__loading">Refreshing…</span>
      }
    </div>

    @if (loading() && equipment().length === 0) {
      <div class="sot-state">Loading equipment…</div>
    } @else if (equipment().length === 0 && !hasActiveFilters()) {
      <sot-empty-state
        title="No equipment yet"
        body="Register your first piece of equipment to start tracking pre-use checks."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New equipment</a>
      </sot-empty-state>
    } @else if (equipment().length === 0) {
      <sot-empty-state
        title="No matches"
        body="No equipment matches the current filters. Try clearing them or broadening your search."
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
              <th scope="col">Asset tag</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col" class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (item of equipment(); track item.id) {
              <tr>
                <td>
                  <a class="table__title-link" [routerLink]="[item.id]">
                    {{ item.name }}
                  </a>
                  @if (item.manufacturer || item.model) {
                    <p class="table__sub">
                      {{ item.manufacturer }}{{ item.manufacturer && item.model ? ' · ' : '' }}{{ item.model }}
                    </p>
                  }
                </td>
                <td class="table__mono">{{ item.assetTag }}</td>
                <td>{{ typeLabel(item) }}</td>
                <td><sot-equipment-status-chip [status]="item.status" /></td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[item.id]"
                    aria-label="View equipment"
                  >View</a>
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[item.id, 'edit']"
                    aria-label="Edit equipment"
                  >Edit</a>
                  <button
                    type="button"
                    class="sot-btn sot-btn--ghost table__btn table__btn--danger"
                    (click)="confirmDelete(item)"
                    aria-label="Delete equipment"
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

      .table__sub {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin-top: 2px;
      }

      .table__mono {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: var(--font-size-sm);
      }

      .table__actions-col { width: 1%; white-space: nowrap; text-align: right; }
      .table__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

      .table__btn { height: 32px; padding: 0 10px; font-size: var(--font-size-sm); }
      .table__btn--danger { color: var(--color-danger); border-color: #fecaca; }
      .table__btn--danger:hover:not(:disabled) { background: #fef2f2; }
    `,
  ],
})
export class EquipmentListComponent implements OnInit {
  private readonly service = inject(EquipmentService);
  private readonly guard = createGenerationGuard();
  private readonly debounceSearch = createDebouncer(SEARCH_DEBOUNCE_MS);

  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly filters = signal<EquipmentFilters>({});

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filters();
    return !!(
      (f.status && f.status !== 'all') ||
      (f.equipmentType && f.equipmentType !== 'all') ||
      f.searchText?.trim()
    );
  });

  protected readonly statusOptions = (
    Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[]
  ).map((value) => ({ value, label: EQUIPMENT_STATUS_LABEL[value] }));

  protected readonly typeOptions = (
    Object.keys(EQUIPMENT_TYPE_LABEL) as EquipmentType[]
  ).map((value) => ({ value, label: EQUIPMENT_TYPE_LABEL[value] }));

  protected readonly typeLabel = (item: Equipment): string =>
    EQUIPMENT_TYPE_LABEL[item.equipmentType] ?? item.equipmentType;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  protected onFilterChange<K extends keyof EquipmentFilters>(
    key: K,
    value: EquipmentFilters[K],
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

  protected async confirmDelete(item: Equipment): Promise<void> {
    const ok = window.confirm(`Delete "${item.name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await this.service.deleteEquipment(item.id);
      this.equipment.update((list) => list.filter((r) => r.id !== item.id));
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    }
  }

  private async refresh(): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getEquipment(this.filters());
      if (!this.guard.isCurrent(gen)) return;
      this.equipment.set(rows);
    } catch (err) {
      if (!this.guard.isCurrent(gen)) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (this.guard.isCurrent(gen)) this.loading.set(false);
    }
  }
}
