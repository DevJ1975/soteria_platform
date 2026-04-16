import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { EquipmentCheckFormComponent } from '../../components/equipment-check-form/equipment-check-form.component';
import { CreateEquipmentCheckPayload } from '../../models/equipment-check.model';
import { Equipment } from '../../models/equipment.model';
import { EquipmentChecksService } from '../../services/equipment-checks.service';
import { EquipmentService } from '../../services/equipment.service';

/**
 * "Record a check" page. Reached via
 *   /app/equipment/:id/checks/new
 * from the equipment detail page. Loads the equipment so the header can
 * show the asset name without the user having to guess which asset
 * they're filling out a check for.
 */
@Component({
  selector: 'sot-equipment-check-new',
  standalone: true,
  imports: [PageHeaderComponent, EquipmentCheckFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="titleText()"
      subtitle="Record the outcome of a safety check. Notes are shown on the equipment detail page."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading equipment…</div>
    } @else if (!equipment()) {
      <div class="sot-state">Equipment not found.</div>
    } @else {
      <sot-equipment-check-form
        [equipmentId]="id()"
        submitLabel="Record check"
        [submitting]="submitting()"
        (submitted)="save($event)"
        (cancelled)="navigateToDetail()"
      />
    }
  `,
})
export class EquipmentCheckNewComponent implements OnInit {
  private readonly service = inject(EquipmentChecksService);
  private readonly equipmentService = inject(EquipmentService);
  private readonly router = inject(Router);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly equipment = signal<Equipment | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected titleText(): string {
    const eq = this.equipment();
    return eq ? `Record check · ${eq.name}` : 'Record check';
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.equipment.set(await this.equipmentService.getEquipmentById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load equipment.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(payload: CreateEquipmentCheckPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.createCheck(payload);
      // Return the user to the detail page so the new check appears in
      // the panel immediately.
      await this.router.navigate(['/app/equipment', this.id()]);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not record check. Please try again.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateToDetail(): void {
    void this.router.navigate(['/app/equipment', this.id()]);
  }
}
