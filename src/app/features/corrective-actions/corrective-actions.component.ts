import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';

@Component({
  selector: 'sot-corrective-actions',
  standalone: true,
  imports: [PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Corrective Actions"
      subtitle="Track findings from identification through to resolution."
    >
      <button type="button" class="sot-btn sot-btn--primary" disabled>
        New action
      </button>
    </sot-page-header>

    <sot-empty-state
      title="Corrective actions will live here"
      body="Assignment, SLAs, escalation, and audit trail will be built out in a later phase."
    />
  `,
})
export class CorrectiveActionsComponent {}
