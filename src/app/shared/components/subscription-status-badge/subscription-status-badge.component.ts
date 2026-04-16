import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { SubscriptionStatus } from '@core/models';

/**
 * Labeled pill for a `SubscriptionStatus`. Shared between the tenant
 * billing page and the platform-admin tenant edit screen so color
 * semantics stay consistent.
 *
 * Color semantics
 * ---------------
 *   trialing   → blue   (neutral-positive, active-but-not-yet-paid)
 *   active     → green  (healthy)
 *   past_due   → amber  (attention, grace period)
 *   canceled   → gray   (winding down, may still have access)
 *   inactive   → red    (no access)
 */
@Component({
  selector: 'sot-subscription-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [attr.data-status]="status()">{{ label() }}</span>
  `,
  styles: [
    `
      .badge {
        display: inline-flex;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
        border: 1px solid transparent;
        line-height: 1.5;
        letter-spacing: 0.02em;
      }
      .badge[data-status='trialing'] { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
      .badge[data-status='active']   { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .badge[data-status='past_due'] { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
      .badge[data-status='canceled'] { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
      .badge[data-status='inactive'] { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    `,
  ],
})
export class SubscriptionStatusBadgeComponent {
  readonly status = input.required<SubscriptionStatus>();

  /** Replaces the DB enum's underscores with spaces for display. */
  protected readonly label = computed(() => this.status().replace('_', ' '));
}
