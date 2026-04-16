import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';

@Component({
  selector: 'sot-inspections',
  standalone: true,
  imports: [PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Inspections"
      subtitle="Schedule, complete, and review safety inspections."
    >
      <button type="button" class="sot-btn sot-btn--primary" disabled>
        New inspection
      </button>
    </sot-page-header>

    <sot-empty-state
      title="Inspections will live here"
      body="This is a placeholder for phase 1. Inspection templates, assignments, and submissions will be built out in a later phase."
    />
  `,
})
export class InspectionsComponent {}
