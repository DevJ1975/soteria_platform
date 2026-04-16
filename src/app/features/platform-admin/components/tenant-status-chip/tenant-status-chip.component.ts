import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TenantStatus } from '@core/models';

/**
 * A small labeled pill for a `TenantStatus`. Extracted from the tenants
 * list so status colors stay consistent as the platform-admin area
 * grows additional tenant views (detail page, filtered dashboards,
 * audit log entries).
 *
 * Color semantics:
 *   trial     → blue  (neutral-positive, onboarding)
 *   active    → green (healthy)
 *   suspended → red   (attention)
 *   cancelled → gray  (terminal, low-priority)
 */
@Component({
  selector: 'sot-tenant-status-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [attr.data-status]="status()">{{ status() }}</span>
  `,
  styles: [
    `
      .chip {
        display: inline-flex;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
        border: 1px solid transparent;
        line-height: 1.5;
      }
      .chip[data-status='active']    { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .chip[data-status='trial']     { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
      .chip[data-status='suspended'] { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
      .chip[data-status='cancelled'] { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
    `,
  ],
})
export class TenantStatusChipComponent {
  readonly status = input.required<TenantStatus>();
}
