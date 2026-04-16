import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { extractErrorMessage } from '@shared/utils/errors.util';

import { CorrectiveActionStatusChipComponent } from '../corrective-action-status-chip/corrective-action-status-chip.component';
import { CorrectiveAction } from '../../models/corrective-action.model';
import { CorrectiveActionsService } from '../../services/corrective-actions.service';

/**
 * Reusable "Corrective actions for this inspection" panel.
 *
 * Designed to be dropped into any context where we have an `inspectionId`
 * (inspection edit page today; detail view later). The panel loads its own
 * data, owns its own UI state, and navigates via RouterLink — the host
 * just provides the inspection id.
 *
 * The panel refetches when `inspectionId` changes (e.g. user navigates
 * between inspections without leaving the shell), via an `effect()`.
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
          <p class="panel__subtitle">
            Issues tracked to resolution for this inspection.
          </p>
        </div>
        <a
          class="sot-btn sot-btn--primary"
          [routerLink]="['/app/corrective-actions/new']"
          [queryParams]="{ inspectionId: inspectionId() }"
        >
          Add corrective action
        </a>
      </header>

      @if (errorMessage()) {
        <div class="sot-alert sot-alert--error" role="alert">
          {{ errorMessage() }}
        </div>
      }

      @if (loading()) {
        <div class="sot-state">Loading corrective actions…</div>
      } @else if (actions().length === 0) {
        <div class="panel__empty">
          No corrective actions yet for this inspection.
        </div>
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
  private readonly destroyRef = inject(DestroyRef);

  readonly inspectionId = input.required<string>();

  protected readonly actions = signal<CorrectiveAction[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /**
   * Generation counter so that a rapid inspection swap doesn't leave a
   * stale response on screen.
   */
  private generation = 0;

  constructor() {
    effect(() => {
      const id = this.inspectionId();
      if (!id) return;
      void this.refresh(id);
    });

    this.destroyRef.onDestroy(() => {
      this.generation = -1; // force any in-flight response to be ignored
    });
  }

  private async refresh(inspectionId: string): Promise<void> {
    const gen = ++this.generation;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getCorrectiveActionsByInspection(inspectionId);
      if (gen !== this.generation) return;
      this.actions.set(rows);
    } catch (err) {
      if (gen !== this.generation) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (gen === this.generation) this.loading.set(false);
    }
  }
}
