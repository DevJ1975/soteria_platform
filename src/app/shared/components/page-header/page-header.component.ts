import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Consistent page title block used at the top of every module screen.
 * Projecting content into the default slot renders it on the right side
 * (primary action buttons, filters, etc.).
 */
@Component({
  selector: 'sot-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div class="page-header__text">
        <h1 class="page-header__title">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="page-header__subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="page-header__actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: [
    `
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-4);
        margin-bottom: var(--space-5);
      }

      .page-header__title {
        font-size: var(--font-size-2xl);
        font-weight: 600;
        margin-bottom: var(--space-1);
      }

      .page-header__subtitle {
        color: var(--color-text-muted);
        font-size: var(--font-size-md);
      }

      .page-header__actions {
        display: flex;
        gap: var(--space-2);
        flex-shrink: 0;
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
