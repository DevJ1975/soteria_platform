import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  CORRECTIVE_ACTION_PRIORITY_LABEL,
  CorrectiveActionPriority,
} from '../../models/corrective-action.model';

/** Colored pill communicating a corrective action's priority. */
@Component({
  selector: 'sot-corrective-action-priority-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [attr.data-priority]="priority()">{{ label() }}</span>
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
        white-space: nowrap;
      }

      .chip[data-priority='low']      { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
      .chip[data-priority='medium']   { background: #fefce8; color: #a16207; border-color: #fde68a; }
      .chip[data-priority='high']     { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
      .chip[data-priority='critical'] { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    `,
  ],
})
export class CorrectiveActionPriorityChipComponent {
  readonly priority = input.required<CorrectiveActionPriority>();
  protected readonly label = computed(
    () => CORRECTIVE_ACTION_PRIORITY_LABEL[this.priority()],
  );
}
