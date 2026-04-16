import {
  ChangeDetectionStrategy,
  Component,
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

import { TrainingAttendancePanelComponent } from '../../components/training-attendance-panel/training-attendance-panel.component';
import { TrainingSession } from '../../models/training-session.model';
import { TrainingSessionsService } from '../../services/training-sessions.service';

/**
 * Training session detail page. Summary card up top (title · topic ·
 * date · conductor · location), attendance panel below. This is the
 * primary screen a supervisor uses during a toolbox talk.
 */
@Component({
  selector: 'sot-training-session-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    TrainingAttendancePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="session()?.title ?? 'Training session'"
      [subtitle]="session()?.topic ?? ''"
    >
      @if (session(); as s) {
        <a class="sot-btn sot-btn--ghost" [routerLink]="[s.id, 'edit']">Edit</a>
      }
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading session…</div>
    } @else if (!session()) {
      <div class="sot-state">Session not found.</div>
    } @else {
      @let s = session()!;

      <section class="meta sot-card">
        <dl class="meta__grid">
          <div>
            <dt>Session date</dt>
            <dd>{{ formatDate(s.sessionDate) }}</dd>
          </div>
          <div>
            <dt>Conducted by</dt>
            <dd>{{ lookup.formatName(s.conductedBy, '—') }}</dd>
          </div>
          @if (s.locationText) {
            <div>
              <dt>Location</dt>
              <dd>{{ s.locationText }}</dd>
            </div>
          }
        </dl>

        @if (s.description) {
          <div class="meta__description">
            <h3 class="meta__description-title">Notes</h3>
            <p class="meta__description-body">{{ s.description }}</p>
          </div>
        }
      </section>

      <sot-training-attendance-panel [sessionId]="s.id" />
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

      .meta__description {
        padding-top: var(--space-4);
        border-top: 1px solid var(--color-border);
      }

      .meta__description-title {
        font-size: var(--font-size-md);
        font-weight: 600;
        margin-bottom: var(--space-2);
      }

      .meta__description-body {
        color: var(--color-text);
        line-height: 1.6;
        white-space: pre-wrap;
      }
    `,
  ],
})
export class TrainingSessionDetailComponent implements OnInit {
  private readonly service = inject(TrainingSessionsService);
  protected readonly lookup = inject(TenantMemberLookupService);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly session = signal<TrainingSession | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly formatDate = formatDateTime;

  async ngOnInit(): Promise<void> {
    void this.lookup.ensureLoaded();
    this.loading.set(true);
    try {
      this.session.set(await this.service.getTrainingSessionById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load session.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
