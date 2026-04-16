import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Shell component for the four "recent activity" cards on the dashboard.
 *
 * Why it exists
 * -------------
 * Each recent-activity card has the same chrome — card background,
 * title, "View all →" link, and state messages (loading / error /
 * empty) — but a different row template per module. Factoring the
 * shell out via `<ng-content>` removes duplicated template from the
 * dashboard and gives us one place to style every activity card.
 *
 * State precedence
 * ----------------
 * The card picks one of four render modes, in order:
 *
 *   1. errorLabel set → error message (subtle, localized — not a
 *      page-level alert, because one failed list shouldn't black out
 *      the whole dashboard)
 *   2. loading        → "Loading…" placeholder
 *   3. count === 0    → empty state
 *   4. default        → projected `<ng-content>`
 *
 * The distinction between (2) and (3) matters. Without it, the page
 * renders "No recent X" during the initial paint before any fetch has
 * completed, giving users a false-negative first impression.
 *
 * Usage
 * -----
 *   <sot-recent-activity-card
 *     title="Recent incidents"
 *     [viewAllLink]="['/app/incident-reports']"
 *     [loading]="incidentsLoading()"
 *     [errorLabel]="incidentsError()"
 *     [count]="recentIncidents().length"
 *     emptyLabel="No recent incident reports."
 *   >
 *     <ul class="rows">…</ul>
 *   </sot-recent-activity-card>
 */
@Component({
  selector: 'sot-recent-activity-card',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card sot-card">
      <header class="card__header">
        <h2 class="card__title">{{ title() }}</h2>
        <a class="card__view-all" [routerLink]="viewAllLink()">View all →</a>
      </header>

      @if (errorLabel()) {
        <p class="card__error" role="alert">{{ errorLabel() }}</p>
      } @else if (loading()) {
        <p class="card__loading">Loading…</p>
      } @else if (count() === 0) {
        <p class="card__empty">{{ emptyLabel() }}</p>
      } @else {
        <ng-content />
      }
    </article>
  `,
  styles: [
    `
      .card__header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
      }

      .card__title {
        font-size: var(--font-size-md);
        font-weight: 600;
      }

      .card__view-all {
        font-size: var(--font-size-sm);
        color: var(--color-primary);
        font-weight: 500;
        white-space: nowrap;
      }

      /* Three state-message variants share padding + centering. Only
         color / background varies so the eye can distinguish at a
         glance which card is loading vs. empty vs. broken. */
      .card__empty,
      .card__loading,
      .card__error {
        font-size: var(--font-size-sm);
        padding: var(--space-4);
        text-align: center;
        border-radius: var(--radius-md);
      }

      .card__empty {
        color: var(--color-text-subtle);
        background: var(--color-surface-muted);
      }

      .card__loading {
        color: var(--color-text-muted);
        background: var(--color-surface-muted);
        font-style: italic;
      }

      .card__error {
        color: #991b1b;
        background: #fef2f2;
        border: 1px solid #fecaca;
      }
    `,
  ],
})
export class RecentActivityCardComponent {
  readonly title = input.required<string>();
  readonly viewAllLink = input.required<string | readonly string[]>();
  readonly count = input<number>(0);
  readonly emptyLabel = input<string>('No recent activity.');

  /** True while the fetch is in flight. Takes precedence over `count`. */
  readonly loading = input<boolean>(false);

  /**
   * When set, displays a subtle in-card error message in place of rows
   * or empty state. `null` / unset is treated as "no error".
   */
  readonly errorLabel = input<string | null>(null);
}
