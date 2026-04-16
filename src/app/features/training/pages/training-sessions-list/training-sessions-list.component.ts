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
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import {
  createDebouncer,
  createGenerationGuard,
} from '@shared/utils/async-guards.util';
import { formatDateTime } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import {
  TrainingSession,
  TrainingSessionFilters,
} from '../../models/training-session.model';
import { TrainingSessionsService } from '../../services/training-sessions.service';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Training sessions list page. Same patterns as other modules
 * (generation counter, debounced search, two empty states, clear
 * filters, row count) plus a date-range filter that makes sense for
 * training compliance — "show me last month's talks".
 */
@Component({
  selector: 'sot-training-sessions-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Toolbox Talks"
      subtitle="Training sessions, safety briefings, and attendance records."
    >
      <a class="sot-btn sot-btn--primary" routerLink="new">
        <sot-icon name="message-square" [size]="16" />
        <span>New session</span>
      </a>
    </sot-page-header>

    <section class="filters sot-card">
      <div class="filters__field">
        <label class="sot-label" for="search">Search title or topic</label>
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
        <label class="sot-label" for="filter-conductor">Conducted by</label>
        <select
          id="filter-conductor"
          class="sot-input"
          [ngModel]="filters().conductedBy ?? 'all'"
          (ngModelChange)="onFilterChange('conductedBy', $event)"
        >
          <option value="all">Everyone</option>
          <option value="me">Me</option>
          @for (m of lookup.members(); track m.id) {
            <option [value]="m.id">{{ m.firstName }} {{ m.lastName }}</option>
          }
        </select>
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-from">From</label>
        <input
          id="filter-from"
          type="date"
          class="sot-input"
          [ngModel]="filters().from ?? ''"
          (ngModelChange)="onFilterChange('from', $event || undefined)"
        />
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-to">To</label>
        <input
          id="filter-to"
          type="date"
          class="sot-input"
          [ngModel]="filters().to ?? ''"
          (ngModelChange)="onFilterChange('to', $event || undefined)"
        />
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
        {{ sessions().length }}
        {{ sessions().length === 1 ? 'session' : 'sessions' }}
      </span>
      @if (loading()) {
        <span class="list-meta__loading">Refreshing…</span>
      }
    </div>

    @if (loading() && sessions().length === 0) {
      <div class="sot-state">Loading sessions…</div>
    } @else if (sessions().length === 0 && !hasActiveFilters()) {
      <sot-empty-state
        title="No training sessions yet"
        body="Record your first toolbox talk to start building a compliance trail."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New session</a>
      </sot-empty-state>
    } @else if (sessions().length === 0) {
      <sot-empty-state
        title="No matches"
        body="No sessions match the current filters. Try clearing them or broadening your search."
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
              <th scope="col">Topic</th>
              <th scope="col">Session date</th>
              <th scope="col">Conducted by</th>
              <th scope="col" class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (s of sessions(); track s.id) {
              <tr>
                <td>
                  <a class="table__title-link" [routerLink]="[s.id]">{{ s.title }}</a>
                  @if (s.locationText) {
                    <p class="table__sub">{{ s.locationText }}</p>
                  }
                </td>
                <td>{{ s.topic }}</td>
                <td>{{ formatDate(s.sessionDate) }}</td>
                <td>{{ lookup.formatName(s.conductedBy, '—') }}</td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[s.id]"
                    aria-label="View attendance"
                  >View</a>
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[s.id, 'edit']"
                    aria-label="Edit session"
                  >Edit</a>
                  <button
                    type="button"
                    class="sot-btn sot-btn--ghost table__btn table__btn--danger"
                    (click)="confirmDelete(s)"
                    aria-label="Delete session"
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
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
        max-width: 36ch;
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
export class TrainingSessionsListComponent implements OnInit {
  private readonly service = inject(TrainingSessionsService);
  protected readonly lookup = inject(TenantMemberLookupService);
  private readonly guard = createGenerationGuard();
  private readonly debounceSearch = createDebouncer(SEARCH_DEBOUNCE_MS);

  protected readonly sessions = signal<TrainingSession[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly filters = signal<TrainingSessionFilters>({});

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filters();
    return !!(
      (f.conductedBy && f.conductedBy !== 'all') ||
      f.from ||
      f.to ||
      f.searchText?.trim()
    );
  });

  protected readonly formatDate = formatDateTime;

  async ngOnInit(): Promise<void> {
    void this.lookup.ensureLoaded();
    await this.refresh();
  }

  protected onFilterChange<K extends keyof TrainingSessionFilters>(
    key: K,
    value: TrainingSessionFilters[K] | undefined,
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

  protected async confirmDelete(s: TrainingSession): Promise<void> {
    const ok = window.confirm(
      `Delete "${s.title}"? All attendance records for this session will also be deleted. This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await this.service.deleteTrainingSession(s.id);
      this.sessions.update((list) => list.filter((r) => r.id !== s.id));
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    }
  }

  private async refresh(): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getTrainingSessions(this.filters());
      if (!this.guard.isCurrent(gen)) return;
      this.sessions.set(rows);
    } catch (err) {
      if (!this.guard.isCurrent(gen)) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (this.guard.isCurrent(gen)) this.loading.set(false);
    }
  }
}
