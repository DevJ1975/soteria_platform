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
import { formatDateTime } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { IncidentReportSeverityChipComponent } from '../../components/incident-report-severity-chip/incident-report-severity-chip.component';
import { IncidentReportStatusChipComponent } from '../../components/incident-report-status-chip/incident-report-status-chip.component';
import {
  INCIDENT_REPORT_TYPE_LABEL,
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  IncidentReport,
  IncidentReportFilters,
  IncidentReportType,
  IncidentSeverity,
  IncidentStatus,
} from '../../models/incident-report.model';
import { IncidentReportsService } from '../../services/incident-reports.service';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Incident reports list page. Same patterns as other modules
 * (generation-counter refresh, debounced search, two empty states,
 * clear-filters) plus one incident-specific convenience: a "status=open"
 * filter value that maps to any non-closed status.
 */
@Component({
  selector: 'sot-incident-reports-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    CountBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    IncidentReportSeverityChipComponent,
    IncidentReportStatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Incident reports"
      subtitle="Incidents, near misses, injuries, unsafe conditions, and safety observations."
    >
      <a class="sot-btn sot-btn--primary" routerLink="new">
        <sot-icon name="alert-triangle" [size]="16" />
        <span>New report</span>
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
          <option value="open">Open (any non-closed)</option>
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
          [ngModel]="filters().reportType ?? 'all'"
          (ngModelChange)="onFilterChange('reportType', $event)"
        >
          <option value="all">All types</option>
          @for (opt of typeOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-severity">Severity</label>
        <select
          id="filter-severity"
          class="sot-input"
          [ngModel]="filters().severity ?? 'all'"
          (ngModelChange)="onFilterChange('severity', $event)"
        >
          <option value="all">All severities</option>
          @for (opt of severityOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
      </div>

      <div class="filters__field">
        <label class="sot-label" for="filter-reporter">Reported by</label>
        <select
          id="filter-reporter"
          class="sot-input"
          [ngModel]="filters().reportedBy ?? 'all'"
          (ngModelChange)="onFilterChange('reportedBy', $event)"
        >
          <option value="all">Everyone</option>
          <option value="me">Me</option>
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
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <div class="list-meta">
      <span class="list-meta__count">
        {{ reports().length }}
        {{ reports().length === 1 ? 'report' : 'reports' }}
      </span>
      @if (loading()) {
        <span class="list-meta__loading">Refreshing…</span>
      }
    </div>

    @if (loading() && reports().length === 0) {
      <div class="sot-state">Loading reports…</div>
    } @else if (reports().length === 0 && !hasActiveFilters()) {
      <sot-empty-state
        title="No reports yet"
        body="File your first incident or safety observation to start building an event history."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New report</a>
      </sot-empty-state>
    } @else if (reports().length === 0) {
      <sot-empty-state
        title="No matches"
        body="No reports match the current filters. Try clearing them or broadening your search."
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
              <th scope="col">Severity</th>
              <th scope="col">Status</th>
              <th scope="col">Event date</th>
              <th scope="col">Location</th>
              <th scope="col" class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (report of reports(); track report.id) {
              <tr>
                <td>
                  <div class="table__title-row">
                    <a class="table__title-link" [routerLink]="[report.id]">
                      {{ report.title }}
                    </a>
                    <sot-count-badge
                      [count]="openActionCounts().get(report.id) ?? 0"
                      label="open"
                      tooltip="Open corrective actions"
                    />
                  </div>
                  <p class="table__sub">
                    Reported by {{ lookup.formatName(report.reportedBy) }}
                  </p>
                </td>
                <td>{{ typeLabel(report) }}</td>
                <td><sot-incident-report-severity-chip [severity]="report.severity" /></td>
                <td><sot-incident-report-status-chip [status]="report.status" /></td>
                <td>{{ formatDate(report.eventOccurredAt) }}</td>
                <td>{{ report.locationText ?? '—' }}</td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[report.id, 'edit']"
                    aria-label="Edit report"
                  >Edit</a>
                  <button
                    type="button"
                    class="sot-btn sot-btn--ghost table__btn table__btn--danger"
                    (click)="confirmDelete(report)"
                    aria-label="Delete report"
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
export class IncidentReportsListComponent implements OnInit {
  private readonly service = inject(IncidentReportsService);
  private readonly caService = inject(CorrectiveActionsService);
  protected readonly lookup = inject(TenantMemberLookupService);
  private readonly guard = createGenerationGuard();
  private readonly debounceSearch = createDebouncer(SEARCH_DEBOUNCE_MS);

  protected readonly reports = signal<IncidentReport[]>([]);
  protected readonly openActionCounts = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly filters = signal<IncidentReportFilters>({});

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filters();
    return !!(
      (f.status && f.status !== 'all') ||
      (f.reportType && f.reportType !== 'all') ||
      (f.severity && f.severity !== 'all') ||
      (f.reportedBy && f.reportedBy !== 'all') ||
      f.searchText?.trim()
    );
  });

  protected readonly statusOptions = (
    Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]
  ).map((value) => ({ value, label: INCIDENT_STATUS_LABEL[value] }));

  protected readonly typeOptions = (
    Object.keys(INCIDENT_REPORT_TYPE_LABEL) as IncidentReportType[]
  ).map((value) => ({ value, label: INCIDENT_REPORT_TYPE_LABEL[value] }));

  protected readonly severityOptions = (
    Object.keys(INCIDENT_SEVERITY_LABEL) as IncidentSeverity[]
  ).map((value) => ({ value, label: INCIDENT_SEVERITY_LABEL[value] }));

  protected readonly typeLabel = (r: IncidentReport): string =>
    INCIDENT_REPORT_TYPE_LABEL[r.reportType] ?? r.reportType;

  protected readonly formatDate = formatDateTime;

  async ngOnInit(): Promise<void> {
    void this.lookup.ensureLoaded();
    void this.caService
      .getOpenCountsByIncidentReport()
      .then((m) => this.openActionCounts.set(m))
      .catch(() => void 0); // counts are nice-to-have; don't fail the page
    await this.refresh();
  }

  protected onFilterChange<K extends keyof IncidentReportFilters>(
    key: K,
    value: IncidentReportFilters[K],
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

  protected async confirmDelete(report: IncidentReport): Promise<void> {
    const ok = window.confirm(
      `Delete "${report.title}"? This cannot be undone and will remove the report from the audit trail.`,
    );
    if (!ok) return;
    try {
      await this.service.deleteIncidentReport(report.id);
      this.reports.update((list) => list.filter((r) => r.id !== report.id));
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    }
  }

  private async refresh(): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getIncidentReports(this.filters());
      if (!this.guard.isCurrent(gen)) return;
      this.reports.set(rows);
    } catch (err) {
      if (!this.guard.isCurrent(gen)) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (this.guard.isCurrent(gen)) this.loading.set(false);
    }
  }
}
