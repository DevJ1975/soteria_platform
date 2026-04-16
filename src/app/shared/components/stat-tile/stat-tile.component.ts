import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Dashboard KPI tile. Intentionally dumb — just displays what's passed in.
 * Data fetching and formatting live in the host screen.
 */
@Component({
  selector: 'sot-stat-tile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="tile">
      <p class="tile__label">{{ label() }}</p>
      <p class="tile__value">{{ value() }}</p>
      @if (helper()) {
        <p class="tile__helper" [class.tile__helper--up]="trend() === 'up'"
           [class.tile__helper--down]="trend() === 'down'">
          {{ helper() }}
        </p>
      }
    </article>
  `,
  styles: [
    `
      .tile {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-5);
        box-shadow: var(--shadow-sm);
      }

      .tile__label {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        margin-bottom: var(--space-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 500;
      }

      .tile__value {
        font-size: var(--font-size-2xl);
        font-weight: 600;
        color: var(--color-text);
        margin-bottom: var(--space-2);
      }

      .tile__helper {
        font-size: var(--font-size-sm);
        color: var(--color-text-subtle);

        &--up { color: var(--color-success); }
        &--down { color: var(--color-danger); }
      }
    `,
  ],
})
export class StatTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly helper = input<string>('');
  readonly trend = input<'up' | 'down' | 'neutral'>('neutral');
}
