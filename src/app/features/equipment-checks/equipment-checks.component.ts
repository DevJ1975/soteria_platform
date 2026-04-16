import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';

@Component({
  selector: 'sot-equipment-checks',
  standalone: true,
  imports: [PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Equipment Checks"
      subtitle="Pre-use checks for vehicles, tools, and PPE."
    >
      <button type="button" class="sot-btn sot-btn--primary" disabled>
        New check
      </button>
    </sot-page-header>

    <sot-empty-state
      title="Equipment checks will live here"
      body="Asset registry, check templates, and defect workflows are coming in a later phase."
    />
  `,
})
export class EquipmentChecksComponent {}
