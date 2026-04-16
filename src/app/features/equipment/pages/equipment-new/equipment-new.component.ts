import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import {
  extractErrorMessage,
  isUniqueViolation,
} from '@shared/utils/errors.util';

import { EquipmentFormComponent } from '../../components/equipment-form/equipment-form.component';
import { CreateEquipmentPayload } from '../../models/equipment.model';
import { EquipmentService } from '../../services/equipment.service';

@Component({
  selector: 'sot-equipment-new',
  standalone: true,
  imports: [PageHeaderComponent, EquipmentFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="New equipment"
      subtitle="Register a new asset so your team can record checks against it."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <sot-equipment-form
      submitLabel="Create equipment"
      [submitting]="submitting()"
      (submitted)="create($event)"
      (cancelled)="navigateToList()"
    />
  `,
})
export class EquipmentNewComponent {
  private readonly service = inject(EquipmentService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async create(payload: CreateEquipmentPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const created = await this.service.createEquipment(payload);
      // Go to the detail page so the user can start recording checks.
      await this.router.navigate(['/app/equipment', created.id]);
    } catch (err) {
      if (isUniqueViolation(err, 'equipment_tenant_asset_tag_uq')) {
        this.errorMessage.set(
          'An asset with this tag already exists in your organization. Pick a different tag.',
        );
      } else {
        this.errorMessage.set(
          extractErrorMessage(err, 'Could not create equipment.'),
        );
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/app/equipment']);
  }
}
