import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shown on placeholder module pages and any list screen that has no rows.
 * Keeps feature screens visually consistent before they're fully built.
 */
@Component({
  selector: 'sot-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <div class="empty__icon" aria-hidden="true">
        <!-- Minimal inline SVG avoids pulling in an icon lib for phase 1. -->
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none"
             stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
             stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h6" />
        </svg>
      </div>
      <h2 class="empty__title">{{ title() }}</h2>
      <p class="empty__body">{{ body() }}</p>
      <div class="empty__actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--space-8) var(--space-5);
        background: var(--color-surface);
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-lg);
        color: var(--color-text-muted);
      }

      .empty__icon {
        color: var(--color-text-subtle);
        margin-bottom: var(--space-4);
      }

      .empty__title {
        font-size: var(--font-size-lg);
        color: var(--color-text);
        margin-bottom: var(--space-2);
      }

      .empty__body {
        max-width: 420px;
        margin-bottom: var(--space-4);
      }
    `,
  ],
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly body = input<string>('');
}
