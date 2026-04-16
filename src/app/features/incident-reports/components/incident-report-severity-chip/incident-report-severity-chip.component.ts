import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  INCIDENT_SEVERITY_LABEL,
  IncidentSeverity,
} from '../../models/incident-report.model';

/** Colored pill for incident severity. Color intensity scales with severity. */
@Component({
  selector: 'sot-incident-report-severity-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [attr.data-severity]="severity()">{{ label() }}</span>
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

      .chip[data-severity='informational'] { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
      .chip[data-severity='low']           { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .chip[data-severity='medium']        { background: #fefce8; color: #a16207; border-color: #fde68a; }
      .chip[data-severity='high']          { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
      .chip[data-severity='critical']      { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    `,
  ],
})
export class IncidentReportSeverityChipComponent {
  readonly severity = input.required<IncidentSeverity>();
  protected readonly label = computed(() => INCIDENT_SEVERITY_LABEL[this.severity()]);
}
