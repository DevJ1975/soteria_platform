import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  CreateEquipmentPayload,
  EQUIPMENT_STATUS_LABEL,
  EQUIPMENT_TYPE_LABEL,
  Equipment,
  EquipmentStatus,
  EquipmentType,
} from '../../models/equipment.model';

const NAME_MAX = 200;
const TAG_MAX = 50;
const NOTE_MAX = 200;

/**
 * Reusable reactive form for creating / editing equipment.
 *
 * The form is dumb — it emits `submitted` with a typed payload and the
 * host page calls the service and navigates. Hydration from
 * `initialValue` is guarded by a last-patched-id signal so a successful
 * save doesn't wipe in-flight edits when the parent re-sets the input.
 */
@Component({
  selector: 'sot-equipment-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="form__grid">
        <div class="form__field form__field--span-2">
          <label class="sot-label" for="name">
            Name <span class="form__required" aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            type="text"
            class="sot-input"
            formControlName="name"
            [attr.maxlength]="nameMax"
            placeholder="e.g. Yard forklift #3"
          />
          @if (showError('name')) {
            <p class="form__error" role="alert">
              @if (form.controls.name.hasError('required')) {
                A name is required.
              } @else if (form.controls.name.hasError('minlength')) {
                Name must be at least 2 characters.
              } @else {
                Name is too long (max {{ nameMax }} characters).
              }
            </p>
          }
        </div>

        <div class="form__field">
          <label class="sot-label" for="assetTag">
            Asset tag <span class="form__required" aria-hidden="true">*</span>
          </label>
          <input
            id="assetTag"
            type="text"
            class="sot-input"
            formControlName="assetTag"
            [attr.maxlength]="tagMax"
            placeholder="e.g. FL-03"
          />
          <p class="form__hint">
            Unique within your organization. Case-insensitive — "FL-03" and
            "fl-03" are treated as the same tag.
          </p>
          @if (showError('assetTag')) {
            <p class="form__error" role="alert">
              Asset tag is required (2–{{ tagMax }} characters).
            </p>
          }
        </div>

        <div class="form__field">
          <label class="sot-label" for="type">
            Type <span class="form__required" aria-hidden="true">*</span>
          </label>
          <select id="type" class="sot-input" formControlName="equipmentType">
            @for (opt of typeOptions; track opt.value) {
              <option [ngValue]="opt.value">{{ opt.label }}</option>
            }
          </select>
        </div>

        <div class="form__field">
          <label class="sot-label" for="status">Status</label>
          <select id="status" class="sot-input" formControlName="status">
            @for (opt of statusOptions; track opt.value) {
              <option [ngValue]="opt.value">{{ opt.label }}</option>
            }
          </select>
        </div>

        <div class="form__field">
          <label class="sot-label" for="manufacturer">Manufacturer</label>
          <input
            id="manufacturer"
            type="text"
            class="sot-input"
            formControlName="manufacturer"
            [attr.maxlength]="noteMax"
            placeholder="e.g. Toyota"
          />
        </div>

        <div class="form__field">
          <label class="sot-label" for="model">Model</label>
          <input
            id="model"
            type="text"
            class="sot-input"
            formControlName="model"
            [attr.maxlength]="noteMax"
            placeholder="e.g. 8FGCU25"
          />
        </div>

        <div class="form__field form__field--span-2">
          <label class="sot-label" for="serialNumber">Serial number</label>
          <input
            id="serialNumber"
            type="text"
            class="sot-input"
            formControlName="serialNumber"
            [attr.maxlength]="noteMax"
          />
        </div>
      </div>

      <div class="form__actions">
        <button
          type="button"
          class="sot-btn sot-btn--ghost"
          (click)="cancelled.emit()"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="sot-btn sot-btn--primary"
          [disabled]="form.invalid || submitting()"
        >
          {{ submitting() ? 'Saving…' : submitLabel() }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .form {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-5);
        box-shadow: var(--shadow-sm);
      }

      .form__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
      }

      .form__field { display: flex; flex-direction: column; }
      .form__field--span-2 { grid-column: 1 / -1; }

      .form__required { color: var(--color-danger); margin-left: 2px; }

      .form__error {
        color: var(--color-danger);
        font-size: var(--font-size-sm);
        margin-top: 4px;
      }

      .form__hint {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin-top: 4px;
      }

      .form__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-top: var(--space-5);
        padding-top: var(--space-4);
        border-top: 1px solid var(--color-border);
      }

      @media (max-width: 640px) {
        .form__grid { grid-template-columns: 1fr; }
        .form__field--span-2 { grid-column: auto; }
      }
    `,
  ],
})
export class EquipmentFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly initialValue = input<Equipment | null>(null);
  readonly submitLabel = input<string>('Save');
  readonly submitting = input<boolean>(false);

  readonly submitted = output<CreateEquipmentPayload>();
  readonly cancelled = output<void>();

  protected readonly nameMax = NAME_MAX;
  protected readonly tagMax = TAG_MAX;
  protected readonly noteMax = NOTE_MAX;

  protected readonly typeOptions = labelOptions<EquipmentType>(EQUIPMENT_TYPE_LABEL);
  protected readonly statusOptions = labelOptions<EquipmentStatus>(EQUIPMENT_STATUS_LABEL);

  protected readonly form = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(NAME_MAX),
    ]),
    assetTag: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(TAG_MAX),
    ]),
    equipmentType: this.fb.nonNullable.control<EquipmentType>('other'),
    status: this.fb.nonNullable.control<EquipmentStatus>('active'),
    manufacturer: this.fb.nonNullable.control(''),
    model: this.fb.nonNullable.control(''),
    serialNumber: this.fb.nonNullable.control(''),
  });

  private readonly lastPatchedId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (!initial) return;
      if (initial.id === this.lastPatchedId()) return;
      this.form.patchValue({
        name: initial.name,
        assetTag: initial.assetTag,
        equipmentType: initial.equipmentType,
        status: initial.status,
        manufacturer: initial.manufacturer ?? '',
        model: initial.model ?? '',
        serialNumber: initial.serialNumber ?? '',
      });
      this.lastPatchedId.set(initial.id);
    });
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[name];
    return ctrl.invalid && (ctrl.touched || ctrl.dirty);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({
      name: value.name.trim(),
      assetTag: value.assetTag.trim(),
      equipmentType: value.equipmentType,
      status: value.status,
      // Empty strings normalize to null so we don't store "".
      manufacturer: value.manufacturer.trim() || null,
      model: value.model.trim() || null,
      serialNumber: value.serialNumber.trim() || null,
    });
  }
}

function labelOptions<T extends string>(
  labels: Record<T, string>,
): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
