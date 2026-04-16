import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  CORRECTIVE_ACTION_STATUS_LABEL,
  CorrectiveActionStatus,
} from '../../models/corrective-action.model';

/** Colored pill communicating a corrective action's current status. */
@Component({
  selector: 'sot-corrective-action-status-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [attr.data-status]="status()">
      <span class="chip__dot" aria-hidden="true"></span>
      {{ label() }}
    </span>
  `,
  styles: [
    `
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        border: 1px solid transparent;
        line-height: 1.4;
        white-space: nowrap;
      }
      .chip__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      .chip[data-status='open']         { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
      .chip[data-status='in_progress']  { background: #ecfeff; color: #0e7490; border-color: #a5f3fc; }
      .chip[data-status='blocked']      { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
      .chip[data-status='completed']    { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .chip[data-status='verified']     { background: #f0fdf4; color: #166534; border-color: #86efac; }
      .chip[data-status='cancelled']    { background: #f8fafc; color: #64748b; border-color: #e2e8f0; text-decoration: line-through; }
    `,
  ],
})
export class CorrectiveActionStatusChipComponent {
  readonly status = input.required<CorrectiveActionStatus>();
  protected readonly label = computed(
    () => CORRECTIVE_ACTION_STATUS_LABEL[this.status()],
  );
}
