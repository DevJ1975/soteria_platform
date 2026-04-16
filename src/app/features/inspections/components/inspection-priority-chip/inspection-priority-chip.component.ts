import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  INSPECTION_PRIORITY_LABEL,
  InspectionPriority,
} from '../../models/inspection.model';

/** Colored pill that communicates an inspection's priority. */
@Component({
  selector: 'sot-inspection-priority-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [attr.data-priority]="priority()">
      {{ label() }}
    </span>
  `,
  styles: [
    `
      .chip {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        border: 1px solid transparent;
        line-height: 1.4;
        text-transform: capitalize;
        white-space: nowrap;
      }

      .chip[data-priority='low']      { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
      .chip[data-priority='medium']   { background: #fefce8; color: #a16207; border-color: #fde68a; }
      .chip[data-priority='high']     { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
      .chip[data-priority='critical'] { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    `,
  ],
})
export class InspectionPriorityChipComponent {
  readonly priority = input.required<InspectionPriority>();
  protected readonly label = computed(
    () => INSPECTION_PRIORITY_LABEL[this.priority()],
  );
}
