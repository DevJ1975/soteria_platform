import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  EQUIPMENT_CHECK_STATUS_LABEL,
  EquipmentCheckStatus,
} from '../../models/equipment-check.model';

/** Colored pill for the pass/fail/needs-attention outcome of one check. */
@Component({
  selector: 'sot-equipment-check-status-chip',
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

      .chip[data-status='pass']            { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .chip[data-status='fail']            { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
      .chip[data-status='needs_attention'] { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
    `,
  ],
})
export class EquipmentCheckStatusChipComponent {
  readonly status = input.required<EquipmentCheckStatus>();
  protected readonly label = computed(
    () => EQUIPMENT_CHECK_STATUS_LABEL[this.status()],
  );
}
