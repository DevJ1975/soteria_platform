import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TenantMemberLookupService } from '@core/services/tenant-member-lookup.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { formatDateTime } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { IncidentReportSeverityChipComponent } from '../../components/incident-report-severity-chip/incident-report-severity-chip.component';
import { IncidentReportStatusChipComponent } from '../../components/incident-report-status-chip/incident-report-status-chip.component';
import {
  INCIDENT_REPORT_TYPE_LABEL,
  IncidentReport,
} from '../../models/incident-report.model';
import { IncidentReportsService } from '../../services/incident-reports.service';

/**
 * Read-mostly incident report page. Renders the report in a document-like
 * layout — meta strip at the top, then one card per narrative section.
 *
 * A future `CorrectiveActionsPanelComponent`-style embed for linked
 * actions will live below the narrative cards. The data model (CA with
 * optional `incident_report_id` FK) hasn't been added yet; the visual
 * slot is deliberately left empty so the page can grow into it.
 */
@Component({
  selector: 'sot-incident-report-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    IncidentReportSeverityChipComponent,
    IncidentReportStatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="report()?.title ?? 'Report'"
      [subtitle]="report() ? typeLabel() : ''"
    >
      @if (report(); as r) {
        <a class="sot-btn sot-btn--ghost" [routerLink]="[r.id, 'edit']">Edit</a>
      }
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading report…</div>
    } @else if (!report()) {
      <div class="sot-state">Report not found.</div>
    } @else if (report(); as r) {
      <section class="meta sot-card">
        <div class="meta__chips">
          <sot-incident-report-severity-chip [severity]="r.severity" />
          <sot-incident-report-status-chip [status]="r.status" />
        </div>
        <dl class="meta__grid">
          <div>
            <dt>Event occurred</dt>
            <dd>{{ formatDate(r.eventOccurredAt) }}</dd>
          </div>
          <div>
            <dt>Reported by</dt>
            <dd>{{ lookup.formatName(r.reportedBy, 'Unknown') }}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{{ r.locationText ?? '—' }}</dd>
          </div>
          @if (r.closedAt) {
            <div>
              <dt>Closed</dt>
              <dd>{{ formatDate(r.closedAt) }}</dd>
            </div>
          }
        </dl>
      </section>

      <article class="narrative">
        @if (r.description) {
          <section class="narrative__card sot-card">
            <h3 class="narrative__title">Description</h3>
            <p class="narrative__body">{{ r.description }}</p>
          </section>
        }

        @if (r.involvedPeopleNotes) {
          <section class="narrative__card sot-card">
            <h3 class="narrative__title">People involved</h3>
            <p class="narrative__body">{{ r.involvedPeopleNotes }}</p>
          </section>
        }

        @if (r.immediateActionsTaken) {
          <section class="narrative__card sot-card">
            <h3 class="narrative__title">Immediate actions taken</h3>
            <p class="narrative__body">{{ r.immediateActionsTaken }}</p>
          </section>
        }

        @if (r.followUpNotes) {
          <section class="narrative__card sot-card">
            <h3 class="narrative__title">Follow-up notes</h3>
            <p class="narrative__body">{{ r.followUpNotes }}</p>
          </section>
        }

        @if (!hasNarrative()) {
          <section class="narrative__card narrative__card--empty sot-card">
            No narrative recorded.
            <a [routerLink]="[r.id, 'edit']">Add details</a>.
          </section>
        }
      </article>
    }
  `,
  styles: [
    `
      .meta {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        margin-bottom: var(--space-5);
      }

      .meta__chips {
        display: flex;
        gap: var(--space-2);
      }

      .meta__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-3) var(--space-5);
        margin: 0;
      }

      .meta__grid div { min-width: 0; }

      .meta__grid dt {
        font-size: 11px;
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      .meta__grid dd {
        margin: 2px 0 0;
        color: var(--color-text);
      }

      .narrative {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .narrative__card--empty {
        text-align: center;
        color: var(--color-text-subtle);
      }

      .narrative__title {
        font-size: var(--font-size-md);
        font-weight: 600;
        margin-bottom: var(--space-2);
      }

      .narrative__body {
        color: var(--color-text);
        line-height: 1.6;
        white-space: pre-wrap; /* preserve paragraph breaks from the textarea */
      }
    `,
  ],
})
export class IncidentReportDetailComponent implements OnInit {
  private readonly service = inject(IncidentReportsService);
  protected readonly lookup = inject(TenantMemberLookupService);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly report = signal<IncidentReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly typeLabel = computed(() => {
    const r = this.report();
    return r ? INCIDENT_REPORT_TYPE_LABEL[r.reportType] ?? r.reportType : '';
  });

  protected readonly hasNarrative = computed(() => {
    const r = this.report();
    return !!(
      r &&
      (r.description ||
        r.involvedPeopleNotes ||
        r.immediateActionsTaken ||
        r.followUpNotes)
    );
  });

  protected readonly formatDate = formatDateTime;

  async ngOnInit(): Promise<void> {
    void this.lookup.ensureLoaded();
    this.loading.set(true);
    try {
      this.report.set(await this.service.getIncidentReportById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load report.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
