import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Small warning-colored chip that renders nothing when `count` is 0 and
 * a compact "N label" indicator when > 0. Used by list pages to surface
 * "X open actions" / "X actionable checks" inline next to the row title.
 *
 * The renders-nothing-on-zero behavior is intentional: a sea of "0 open"
 * chips would be noise. Only draw attention where attention is needed.
 */
@Component({
  selector: 'sot-count-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0) {
      <span class="badge" [attr.title]="tooltip()">
        <span class="badge__dot" aria-hidden="true"></span>
        <span class="badge__count">{{ count() }}</span>
        @if (label()) {
          <span class="badge__label">{{ label() }}</span>
        }
      </span>
    }
  `,
  styles: [
    `
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.4;
        background: #fff7ed;
        color: #c2410c;
        border: 1px solid #fed7aa;
        white-space: nowrap;
        vertical-align: middle;
      }

      .badge__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      .badge__count { font-variant-numeric: tabular-nums; }

      .badge__label {
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
    `,
  ],
})
export class CountBadgeComponent {
  readonly count = input.required<number>();
  /** Short label after the number — e.g. "open", "actionable". */
  readonly label = input<string>('');
  /** Accessible tooltip when count > 0. Defaults to "N <label>". */
  readonly tooltip = input<string>('');
}
