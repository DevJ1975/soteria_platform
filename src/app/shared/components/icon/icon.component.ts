import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Tiny inline-SVG icon set. Using our own SVGs keeps the bundle small and
 * avoids a font/CDN dependency. New icons can be added to the `@switch`
 * below; keep the artwork on a 24×24 grid with stroke-based paths so they
 * inherit `currentColor` and match the existing set visually.
 */
export type IconName =
  | 'grid'
  | 'clipboard-check'
  | 'wrench'
  | 'check-circle'
  | 'alert-triangle'
  | 'message-square'
  | 'thermometer'
  | 'lock'
  | 'log-out'
  | 'chevron-down'
  | 'credit-card';

@Component({
  selector: 'sot-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('grid') {
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        }
        @case ('clipboard-check') {
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
          <path d="m9 13 2 2 4-4" />
        }
        @case ('wrench') {
          <path
            d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.1 2.1 0 0 1-3-3l8.4-8.4-2-2Z"
          />
          <path d="m14.7 6.3 2-2-1.4-1.4a4 4 0 0 0-5 5l1.4 1.4 2-2Z" />
        }
        @case ('check-circle') {
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        }
        @case ('alert-triangle') {
          <path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        }
        @case ('message-square') {
          <path d="M21 12a7 7 0 0 1-7 7H8l-5 3v-5.5A7 7 0 0 1 10 5h4a7 7 0 0 1 7 7Z" />
        }
        @case ('thermometer') {
          <path d="M14 15V5a2 2 0 0 0-4 0v10a4 4 0 1 0 4 0Z" />
        }
        @case ('lock') {
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        }
        @case ('log-out') {
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('credit-card') {
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h4" />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: currentColor;
      }
    `,
  ],
})
export class IconComponent {
  /**
   * Accepts `string` rather than `IconName` so callers aren't forced into
   * tight type coupling. Unknown names render an empty <svg> — caller bears
   * the responsibility of matching `IconName` in practice.
   */
  readonly name = input.required<string>();
  readonly size = input<number>(18);
}
