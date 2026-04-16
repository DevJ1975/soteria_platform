import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { CorrectiveActionStatusChipComponent } from '@features/corrective-actions/components/corrective-action-status-chip/corrective-action-status-chip.component';
import { IncidentReportSeverityChipComponent } from '@features/incident-reports/components/incident-report-severity-chip/incident-report-severity-chip.component';
import { InspectionStatusChipComponent } from '@features/inspections/components/inspection-status-chip/inspection-status-chip.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { StatTileComponent } from '@shared/components/stat-tile/stat-tile.component';
import { formatActivityDate } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { RecentActivityCardComponent } from './components/recent-activity-card/recent-activity-card.component';
import {
  DashboardStats,
  EMPTY_DASHBOARD_STATS,
  RecentCorrectiveAction,
  RecentIncident,
  RecentInspection,
  RecentTrainingSession,
} from './models/dashboard.model';
import { DashboardService } from './services/dashboard.service';

/**
 * Operational dashboard — the default landing page after sign-in.
 *
 * Layout
 * ------
 *   1. KPI row — six click-through tiles, ordered urgency-first:
 *      needs-attention metrics at the start (overdue, high-severity,
 *      failed), general-activity metrics at the end.
 *   2. Recent-activity grid — four cards (incidents / CAs / inspections
 *      / training), each showing the latest five items with relative
 *      timestamps ("2h ago") for scannability.
 *
 * Every query runs in parallel in `ngOnInit` so perceived load time is
 * the longest single query, not the sum. Individual-list failures
 * silently fall back to empty; the stats failure surfaces as a visible
 * alert since the KPI row is the primary content.
 */
@Component({
  selector: 'sot-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    StatTileComponent,
    RecentActivityCardComponent,
    CorrectiveActionStatusChipComponent,
    IncidentReportSeverityChipComponent,
    InspectionStatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="greeting()"
      subtitle="Operational snapshot across every module enabled for your organization."
    />

    <!--
      KPI row — urgency-first. Needs-attention metrics (overdue,
      high-severity, failed) come before general-activity counts
      (completed inspections, training). StatTile's trend indicator
      colors the helper text red for "down" when a count is > 0.
    -->
    <section class="kpis" aria-label="Key metrics">
      <a class="kpi-link" [routerLink]="['/app/corrective-actions']">
        <sot-stat-tile
          label="Overdue actions"
          [value]="stats().correctiveActions.overdue"
          helper="Past due date, still open"
          [trend]="stats().correctiveActions.overdue > 0 ? 'down' : 'neutral'"
        />
      </a>
      <a class="kpi-link" [routerLink]="['/app/incident-reports']">
        <sot-stat-tile
          label="Open incidents"
          [value]="stats().incidents.open"
          [helper]="incidentHelper()"
          [trend]="stats().incidents.highSeverityOpen > 0 ? 'down' : 'neutral'"
        />
      </a>
      <a class="kpi-link" [routerLink]="['/app/equipment']">
        <sot-stat-tile
          label="Failed equipment checks"
          [value]="stats().equipmentChecks.failed"
          helper="Fail or needs-attention outcomes"
          [trend]="stats().equipmentChecks.failed > 0 ? 'down' : 'neutral'"
        />
      </a>
      <a class="kpi-link" [routerLink]="['/app/corrective-actions']">
        <sot-stat-tile
          label="Open corrective actions"
          [value]="stats().correctiveActions.open"
          [helper]="caOpenHelper()"
          trend="neutral"
        />
      </a>
      <a class="kpi-link" [routerLink]="['/app/inspections']">
        <sot-stat-tile
          label="Recent inspections"
          [value]="stats().inspections.completedRecent"
          helper="Completed in the last 30 days"
          trend="up"
        />
      </a>
      <a class="kpi-link" [routerLink]="['/app/training']">
        <sot-stat-tile
          label="Training sessions"
          [value]="stats().training.recentSessions"
          [helper]="trainingHelper()"
          trend="up"
        />
      </a>
    </section>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <section class="activity" aria-label="Recent activity">
      <sot-recent-activity-card
        title="Recent incidents"
        [viewAllLink]="['/app/incident-reports']"
        [count]="recentIncidents().length"
        [loading]="incidents.loading()"
        [errorLabel]="incidents.error()"
        emptyLabel="No recent incident reports."
      >
        <ul class="rows">
          @for (r of recentIncidents(); track r.id) {
            <li class="row">
              <a class="row__title" [routerLink]="['/app/incident-reports', r.id]">
                {{ r.title }}
              </a>
              <div class="row__meta">
                <sot-incident-report-severity-chip [severity]="r.severity" />
                <span class="row__date">{{ formatDate(r.eventOccurredAt) }}</span>
              </div>
            </li>
          }
        </ul>
      </sot-recent-activity-card>

      <sot-recent-activity-card
        title="Recent corrective actions"
        [viewAllLink]="['/app/corrective-actions']"
        [count]="recentActions().length"
        [loading]="actions.loading()"
        [errorLabel]="actions.error()"
        emptyLabel="No recent corrective actions."
      >
        <ul class="rows">
          @for (a of recentActions(); track a.id) {
            <li class="row">
              <a class="row__title" [routerLink]="['/app/corrective-actions', a.id, 'edit']">
                {{ a.title }}
              </a>
              <div class="row__meta">
                <sot-corrective-action-status-chip [status]="a.status" />
                @if (a.dueDate) {
                  <span class="row__date">Due {{ a.dueDate }}</span>
                } @else {
                  <span class="row__date">{{ formatDate(a.createdAt) }}</span>
                }
              </div>
            </li>
          }
        </ul>
      </sot-recent-activity-card>

      <sot-recent-activity-card
        title="Recent inspections"
        [viewAllLink]="['/app/inspections']"
        [count]="recentInspections().length"
        [loading]="inspections.loading()"
        [errorLabel]="inspections.error()"
        emptyLabel="No recent inspections."
      >
        <ul class="rows">
          @for (i of recentInspections(); track i.id) {
            <li class="row">
              <a class="row__title" [routerLink]="['/app/inspections', i.id, 'edit']">
                {{ i.title }}
              </a>
              <div class="row__meta">
                <sot-inspection-status-chip [status]="i.status" />
                <span class="row__date">{{ formatDate(i.updatedAt) }}</span>
              </div>
            </li>
          }
        </ul>
      </sot-recent-activity-card>

      <sot-recent-activity-card
        title="Recent training sessions"
        [viewAllLink]="['/app/training']"
        [count]="recentTraining().length"
        [loading]="training.loading()"
        [errorLabel]="training.error()"
        emptyLabel="No recent training sessions."
      >
        <ul class="rows">
          @for (t of recentTraining(); track t.id) {
            <li class="row">
              <a class="row__title" [routerLink]="['/app/training', t.id]">
                {{ t.title }}
              </a>
              <div class="row__meta">
                <span class="row__topic">{{ t.topic }}</span>
                <span class="row__date">{{ formatDate(t.sessionDate) }}</span>
              </div>
            </li>
          }
        </ul>
      </sot-recent-activity-card>
    </section>
  `,
  styles: [
    `
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-6);
      }

      .kpi-link {
        display: block;
        text-decoration: none;
        color: inherit;
        border-radius: var(--radius-lg);
        transition: transform 120ms var(--ease-out);
      }
      .kpi-link:hover { transform: translateY(-1px); }
      .kpi-link:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      .activity {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: var(--space-4);
      }

      .rows {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        transition: border-color 120ms ease, background-color 120ms ease;
      }
      .row:hover {
        border-color: var(--color-border-strong);
        background: var(--color-surface-muted);
      }

      .row__title {
        font-weight: 600;
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row__title:hover {
        color: var(--color-primary);
        text-decoration: underline;
      }

      .row__meta {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      .row__topic {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .row__date {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin-left: auto;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);

  protected readonly stats = signal<DashboardStats>(EMPTY_DASHBOARD_STATS);
  protected readonly recentIncidents = signal<RecentIncident[]>([]);
  protected readonly recentActions = signal<RecentCorrectiveAction[]>([]);
  protected readonly recentInspections = signal<RecentInspection[]>([]);
  protected readonly recentTraining = signal<RecentTrainingSession[]>([]);
  protected readonly errorMessage = signal<string | null>(null);

  /**
   * Per-card loading + error state. Grouped into small objects so each
   * card can read them with one property access (`incidents.loading()`)
   * instead of four scattered signals. `loading` starts true so the
   * card shows "Loading…" on initial paint rather than flashing the
   * empty state before data arrives.
   */
  protected readonly incidents = createSectionState();
  protected readonly actions = createSectionState();
  protected readonly inspections = createSectionState();
  protected readonly training = createSectionState();

  protected readonly greeting = computed(() => {
    const first = this.auth.profile()?.firstName?.trim();
    return first ? `Welcome back, ${first}` : 'Welcome back';
  });

  protected readonly caOpenHelper = computed(() => {
    const overdue = this.stats().correctiveActions.overdue;
    return overdue > 0 ? `${overdue} overdue` : 'Nothing overdue';
  });

  protected readonly incidentHelper = computed(() => {
    const hi = this.stats().incidents.highSeverityOpen;
    return hi > 0 ? `${hi} high-severity` : 'No high-severity open';
  });

  protected readonly trainingHelper = computed(() => {
    const att = this.stats().training.totalAttendance;
    return `${att} attendance records · last 30 days`;
  });

  /**
   * Hybrid relative/absolute date. Recent activity is easier to scan
   * as "2h ago" / "3d ago" while <7 days old, and reverts to a compact
   * absolute ("Apr 16") for anything older.
   */
  protected readonly formatDate = formatActivityDate;

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadStats(),
      this.loadRecentIncidents(),
      this.loadRecentActions(),
      this.loadRecentInspections(),
      this.loadRecentTraining(),
    ]);
  }

  private async loadStats(): Promise<void> {
    try {
      const res = await this.dashboard.getStats();
      this.stats.set(res.stats);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load dashboard stats.'));
    }
  }

  private async loadRecentIncidents(): Promise<void> {
    await this.loadSection(this.incidents, this.recentIncidents, () =>
      this.dashboard.getRecentIncidents(),
    );
  }

  private async loadRecentActions(): Promise<void> {
    await this.loadSection(this.actions, this.recentActions, () =>
      this.dashboard.getRecentCorrectiveActions(),
    );
  }

  private async loadRecentInspections(): Promise<void> {
    await this.loadSection(this.inspections, this.recentInspections, () =>
      this.dashboard.getRecentInspections(),
    );
  }

  private async loadRecentTraining(): Promise<void> {
    await this.loadSection(this.training, this.recentTraining, () =>
      this.dashboard.getRecentTrainingSessions(),
    );
  }

  /**
   * Shared loader for each recent-activity section. Flips `loading`
   * on during the fetch, clears any prior error, and on failure sets
   * a subtle per-card error label instead of throwing — a failed
   * individual list shouldn't black out the rest of the dashboard
   * (but also shouldn't silently masquerade as an empty state).
   */
  private async loadSection<T>(
    state: SectionState,
    data: WritableSignal<T[]>,
    fetch: () => Promise<T[]>,
  ): Promise<void> {
    state.loading.set(true);
    state.error.set(null);
    try {
      data.set(await fetch());
    } catch {
      state.error.set('Could not load. Refresh to try again.');
    } finally {
      state.loading.set(false);
    }
  }
}

/**
 * Groups a section's loading + error signals. Starts in "loading"
 * so the card shows "Loading…" during the initial paint rather than
 * briefly flashing its empty state before data arrives.
 */
interface SectionState {
  loading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
}

function createSectionState(): SectionState {
  return {
    loading: signal(true),
    error: signal<string | null>(null),
  };
}
