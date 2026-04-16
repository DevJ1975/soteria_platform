import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  INCIDENT_STATUS_LABEL,
  IncidentStatus,
} from '../../models/incident-report.model';

/** Colored pill for incident report lifecycle status. */
@Component({
  selector: 'sot-incident-report-status-chip',
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

      .chip[data-status='draft']         { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
      .chip[data-status='submitted']     { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
      .chip[data-status='investigating'] { background: #fefce8; color: #a16207; border-color: #fde68a; }
      .chip[data-status='closed']        { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
    `,
  ],
})
export class IncidentReportStatusChipComponent {
  readonly status = input.required<IncidentStatus>();
  protected readonly label = computed(() => INCIDENT_STATUS_LABEL[this.status()]);
}
