import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  EQUIPMENT_STATUS_LABEL,
  EquipmentStatus,
} from '../../models/equipment.model';

/** Colored pill communicating an equipment item's operational status. */
@Component({
  selector: 'sot-equipment-status-chip',
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

      .chip[data-status='active']         { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .chip[data-status='maintenance']    { background: #fefce8; color: #a16207; border-color: #fde68a; }
      .chip[data-status='out_of_service'] { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
      .chip[data-status='retired']        { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
    `,
  ],
})
export class EquipmentStatusChipComponent {
  readonly status = input.required<EquipmentStatus>();
  protected readonly label = computed(() => EQUIPMENT_STATUS_LABEL[this.status()]);
}
