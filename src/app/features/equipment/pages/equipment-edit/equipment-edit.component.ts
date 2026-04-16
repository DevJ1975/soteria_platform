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
import {
  extractErrorMessage,
  isUniqueViolation,
} from '@shared/utils/errors.util';

import { EquipmentFormComponent } from '../../components/equipment-form/equipment-form.component';
import {
  CreateEquipmentPayload,
  Equipment,
} from '../../models/equipment.model';
import { EquipmentService } from '../../services/equipment.service';

@Component({
  selector: 'sot-equipment-edit',
  standalone: true,
  imports: [PageHeaderComponent, EquipmentFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="equipment()?.name ?? 'Edit equipment'"
      subtitle="Update details, take assets out of service, or retire them."
    >
      <button
        type="button"
        class="sot-btn sot-btn--ghost edit__delete"
        (click)="remove()"
        [disabled]="deleting() || !equipment()"
      >
        {{ deleting() ? 'Deleting…' : 'Delete' }}
      </button>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading equipment…</div>
    } @else if (!equipment()) {
      <div class="sot-state">Equipment not found.</div>
    } @else {
      <sot-equipment-form
        submitLabel="Save changes"
        [initialValue]="equipment()"
        [submitting]="submitting()"
        (submitted)="save($event)"
        (cancelled)="navigateToDetail()"
      />
    }
  `,
  styles: [
    `
      .edit__delete {
        color: var(--color-danger);
        border-color: #fecaca;
      }
      .edit__delete:hover:not(:disabled) { background: #fef2f2; }
    `,
  ],
})
export class EquipmentEditComponent implements OnInit {
  private readonly service = inject(EquipmentService);
  private readonly router = inject(Router);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly equipment = signal<Equipment | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.equipment.set(await this.service.getEquipmentById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load equipment.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(payload: CreateEquipmentPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.service.updateEquipment(this.id(), payload);
      this.equipment.set(updated);
      await this.router.navigate(['/app/equipment', this.id()]);
    } catch (err) {
      if (isUniqueViolation(err, 'equipment_tenant_asset_tag_uq')) {
        this.errorMessage.set(
          'An asset with this tag already exists in your organization. Pick a different tag.',
        );
      } else {
        this.errorMessage.set(
          extractErrorMessage(err, 'Could not save changes. Please try again.'),
        );
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const target = this.equipment();
    if (!target) return;
    const ok = window.confirm(
      `Delete "${target.name}"? All check history for this equipment will also be deleted. This cannot be undone.`,
    );
    if (!ok) return;

    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.deleteEquipment(target.id);
      await this.router.navigate(['/app/equipment']);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }

  protected navigateToDetail(): void {
    void this.router.navigate(['/app/equipment', this.id()]);
  }
}
