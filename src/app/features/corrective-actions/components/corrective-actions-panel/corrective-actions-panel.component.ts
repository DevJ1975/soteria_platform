import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { createGenerationGuard } from '@shared/utils/async-guards.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { CorrectiveActionStatusChipComponent } from '../corrective-action-status-chip/corrective-action-status-chip.component';
import { CorrectiveAction } from '../../models/corrective-action.model';
import { CorrectiveActionsService } from '../../services/corrective-actions.service';

type PanelScope =
  | { type: 'inspection'; id: string }
  | { type: 'incident_report'; id: string }
  | { type: 'equipment_check'; id: string };

/**
 * Reusable corrective-actions panel. Drops into any context that can
 * produce findings — today:
 *   - inspection edit page (via `[inspectionId]`)
 *   - incident report detail page (via `[incidentReportId]`)
 *   - equipment check context (via `[equipmentCheckId]`)
 *
 * Set exactly one of the three inputs. The panel figures out which
 * service method to call for loading actions and which query param to
 * deep-link the "Add corrective action" button to — so the new-action
 * form lands pre-linked to the right source.
 */
@Component({
  selector: 'sot-corrective-actions-panel',
  standalone: true,
  imports: [RouterLink, CorrectiveActionStatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel sot-card">
      <header class="panel__header">
        <div>
          <h2 class="panel__title">Corrective actions</h2>
          <p class="panel__subtitle">{{ subtitle() }}</p>
        </div>
        @if (scope(); as s) {
          <a
            class="sot-btn sot-btn--primary"
            [routerLink]="['/app/corrective-actions/new']"
            [queryParams]="addActionQueryParams()"
          >
            Add corrective action
          </a>
        }
      </header>

      @if (errorMessage()) {
        <div class="sot-alert sot-alert--error" role="alert">
          {{ errorMessage() }}
        </div>
      }

      @if (loading()) {
        <div class="sot-state">Loading corrective actions…</div>
      } @else if (actions().length === 0) {
        <div class="panel__empty">{{ emptyMessage() }}</div>
      } @else {
        <ul class="panel__list">
          @for (a of actions(); track a.id) {
            <li class="row">
              <a class="row__title" [routerLink]="['/app/corrective-actions', a.id, 'edit']">
                {{ a.title }}
              </a>
              <div class="row__meta">
                <sot-corrective-action-status-chip [status]="a.status" />
                @if (a.dueDate) {
                  <span class="row__due">Due {{ a.dueDate }}</span>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .panel { margin-top: var(--space-5); }

      .panel__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }

      .panel__title {
        font-size: var(--font-size-lg);
        font-weight: 600;
        margin-bottom: 2px;
      }

      .panel__subtitle {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .panel__empty {
        padding: var(--space-5);
        text-align: center;
        color: var(--color-text-subtle);
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
      }

      .panel__list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        transition: border-color 120ms ease, background-color 120ms ease;
      }
      .row:hover { border-color: var(--color-border-strong); background: var(--color-surface-muted); }

      .row__title {
        font-weight: 600;
        color: var(--color-text);
      }
      .row__title:hover {
        color: var(--color-primary);
        text-decoration: underline;
      }

      .row__meta {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-shrink: 0;
      }

      .row__due {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class CorrectiveActionsPanelComponent {
  private readonly service = inject(CorrectiveActionsService);
  private readonly guard = createGenerationGuard();

  // Exactly one should be set. Callers pass the id that matches their
  // context; the panel picks up the rest.
  readonly inspectionId = input<string | null>(null);
  readonly incidentReportId = input<string | null>(null);
  readonly equipmentCheckId = input<string | null>(null);

  protected readonly actions = signal<CorrectiveAction[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly scope = computed<PanelScope | null>(() => {
    const i = this.inspectionId();
    if (i) return { type: 'inspection', id: i };
    const r = this.incidentReportId();
    if (r) return { type: 'incident_report', id: r };
    const c = this.equipmentCheckId();
    if (c) return { type: 'equipment_check', id: c };
    return null;
  });

  protected readonly subtitle = computed(() => {
    const s = this.scope();
    if (s?.type === 'inspection')
      return 'Findings from this inspection, tracked to resolution.';
    if (s?.type === 'incident_report')
      return 'Follow-up actions from this report.';
    if (s?.type === 'equipment_check')
      return 'Remediation for this check.';
    return 'Related corrective actions.';
  });

  protected readonly emptyMessage = computed(() => {
    const s = this.scope();
    if (s?.type === 'inspection')
      return 'No corrective actions yet for this inspection.';
    if (s?.type === 'incident_report')
      return 'No corrective actions yet for this report.';
    if (s?.type === 'equipment_check')
      return 'No corrective actions yet for this check.';
    return 'No corrective actions yet.';
  });

  /** Maps the scope to the right query-param the CA form recognizes. */
  protected readonly addActionQueryParams = computed(() => {
    const s = this.scope();
    if (!s) return {};
    if (s.type === 'inspection') return { inspectionId: s.id };
    if (s.type === 'incident_report') return { incidentReportId: s.id };
    return { equipmentCheckId: s.id };
  });

  constructor() {
    effect(() => {
      const s = this.scope();
      if (!s) return;
      void this.refresh(s);
    });
  }

  private async refresh(scope: PanelScope): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows =
        scope.type === 'inspection'
          ? await this.service.getCorrectiveActionsByInspection(scope.id)
          : scope.type === 'incident_report'
          ? await this.service.getCorrectiveActionsByIncidentReport(scope.id)
          : await this.service.getCorrectiveActionsByEquipmentCheck(scope.id);
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
