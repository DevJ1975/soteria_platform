import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  CreateEquipmentCheckPayload,
  EQUIPMENT_CHECK_STATUS_LABEL,
  EQUIPMENT_CHECK_TYPE_LABEL,
  EquipmentCheckStatus,
  EquipmentCheckType,
} from '../../models/equipment-check.model';

const NOTE_MAX = 1000;

/**
 * Form for recording one check against an equipment item. Status is a
 * three-way segmented control so it's thumb-friendly on mobile — the
 * most important field by far for this form.
 *
 * performed_at defaults to "now" at render time. Users can pick an
 * earlier time if they're logging a check retroactively.
 */
@Component({
  selector: 'sot-equipment-check-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="form__grid">
        <div class="form__field form__field--span-2">
          <label class="sot-label" id="status-label">
            Outcome <span class="form__required" aria-hidden="true">*</span>
          </label>
          <div class="status-group" role="radiogroup" aria-labelledby="status-label">
            @for (opt of statusOptions; track opt.value) {
              <label class="status-option" [attr.data-selected]="form.controls.status.value === opt.value">
                <input
                  type="radio"
                  [value]="opt.value"
                  formControlName="status"
                />
                <span class="status-option__label" [attr.data-status]="opt.value">
                  {{ opt.label }}
                </span>
              </label>
            }
          </div>
        </div>

        <div class="form__field">
          <label class="sot-label" for="checkType">Check type</label>
          <select id="checkType" class="sot-input" formControlName="checkType">
            @for (opt of typeOptions; track opt.value) {
              <option [ngValue]="opt.value">{{ opt.label }}</option>
            }
          </select>
        </div>

        <div class="form__field">
          <label class="sot-label" for="performedAt">Performed at</label>
          <input
            id="performedAt"
            type="datetime-local"
            class="sot-input"
            formControlName="performedAt"
          />
        </div>

        <div class="form__field form__field--span-2">
          <label class="sot-label" for="notes">Notes</label>
          <textarea
            id="notes"
            class="sot-input form__textarea"
            formControlName="notes"
            [attr.maxlength]="noteMax"
            rows="4"
            placeholder="Anything worth recording — defects found, parts needed, follow-ups."
          ></textarea>
          @if (showError('notes')) {
            <p class="form__error" role="alert">
              Notes are too long (max {{ noteMax }} characters).
            </p>
          }
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

      .form__textarea {
        height: auto;
        padding: var(--space-3);
        resize: vertical;
        line-height: 1.5;
        min-height: 96px;
      }

      .form__error {
        color: var(--color-danger);
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

      .status-group {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-2);
        margin-top: var(--space-1);
      }

      .status-option {
        position: relative;
        cursor: pointer;
      }
      .status-option input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .status-option__label {
        display: block;
        text-align: center;
        padding: 12px var(--space-3);
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-md);
        font-weight: 600;
        font-size: var(--font-size-md);
        background: var(--color-surface);
        color: var(--color-text-muted);
        transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
      }
      .status-option:hover .status-option__label {
        border-color: #8892a7;
      }
      .status-option input:focus-visible + .status-option__label {
        box-shadow: 0 0 0 3px var(--color-primary-ring);
      }
      .status-option[data-selected='true'] .status-option__label[data-status='pass']            { background: #ecfdf5; color: #047857; border-color: #047857; }
      .status-option[data-selected='true'] .status-option__label[data-status='fail']            { background: #fef2f2; color: #b91c1c; border-color: #b91c1c; }
      .status-option[data-selected='true'] .status-option__label[data-status='needs_attention'] { background: #fff7ed; color: #c2410c; border-color: #c2410c; }

      @media (max-width: 640px) {
        .form__grid { grid-template-columns: 1fr; }
        .form__field--span-2 { grid-column: auto; }
        .status-group { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class EquipmentCheckFormComponent {
  private readonly fb = inject(FormBuilder);

  /** Required — the check form always targets a known equipment item. */
  readonly equipmentId = input.required<string>();
  readonly submitLabel = input<string>('Record check');
  readonly submitting = input<boolean>(false);

  readonly submitted = output<CreateEquipmentCheckPayload>();
  readonly cancelled = output<void>();

  protected readonly noteMax = NOTE_MAX;

  protected readonly statusOptions: Array<{ value: EquipmentCheckStatus; label: string }> = [
    { value: 'pass', label: EQUIPMENT_CHECK_STATUS_LABEL.pass },
    { value: 'needs_attention', label: EQUIPMENT_CHECK_STATUS_LABEL.needs_attention },
    { value: 'fail', label: EQUIPMENT_CHECK_STATUS_LABEL.fail },
  ];

  protected readonly typeOptions = (
    Object.keys(EQUIPMENT_CHECK_TYPE_LABEL) as EquipmentCheckType[]
  ).map((value) => ({ value, label: EQUIPMENT_CHECK_TYPE_LABEL[value] }));

  protected readonly form = this.fb.nonNullable.group({
    status: this.fb.nonNullable.control<EquipmentCheckStatus>('pass', [
      Validators.required,
    ]),
    checkType: this.fb.nonNullable.control<EquipmentCheckType>('pre_use'),
    // Initialize to "now" in local timezone; users can override.
    performedAt: this.fb.nonNullable.control(localNow()),
    notes: this.fb.nonNullable.control('', [Validators.maxLength(NOTE_MAX)]),
  });

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
      equipmentId: this.equipmentId(),
      checkType: value.checkType,
      status: value.status,
      notes: value.notes.trim() || null,
      // datetime-local returns a value without timezone; convert to ISO
      // so the server stores a proper timestamptz.
      performedAt: value.performedAt
        ? new Date(value.performedAt).toISOString()
        : null,
    });
  }
}

/** Format the current time as YYYY-MM-DDTHH:mm for a datetime-local input. */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
