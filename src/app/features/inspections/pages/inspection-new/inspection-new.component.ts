import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';

import { InspectionFormComponent } from '../../components/inspection-form/inspection-form.component';
import { CreateInspectionPayload } from '../../models/inspection.model';
import { InspectionsService } from '../../services/inspections.service';

@Component({
  selector: 'sot-inspection-new',
  standalone: true,
  imports: [PageHeaderComponent, InspectionFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="New inspection"
      subtitle="Capture what needs inspecting, who will do it, and by when."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <sot-inspection-form
      submitLabel="Create inspection"
      [submitting]="submitting()"
      (submitted)="create($event)"
      (cancelled)="navigateToList()"
    />
  `,
})
export class InspectionNewComponent {
  private readonly service = inject(InspectionsService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async create(payload: CreateInspectionPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.createInspection(payload);
      await this.router.navigate(['/app/inspections']);
    } catch (err) {
      this.errorMessage.set(extractMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/app/inspections']);
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Could not create inspection. Please try again.';
}
