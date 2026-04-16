import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { TenantMember, TenantService } from '@core/services/tenant.service';

import {
  CreateInspectionPayload,
  INSPECTION_PRIORITY_LABEL,
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPE_LABEL,
  Inspection,
  InspectionPriority,
  InspectionStatus,
  InspectionType,
} from '../../models/inspection.model';

/** Column-width caps match the DB side (text columns, plus a sane UI cap). */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

/**
 * Reusable reactive form shared by the create and edit pages.
 *
 * The form is deliberately dumb: it emits `submitted` with a typed payload
 * and the host page is responsible for calling the service and navigating
 * afterwards. This keeps the form trivially testable and means the same
 * component works for both create and edit without branching internally.
 */
@Component({
  selector: 'sot-inspection-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="form__grid">
        <div class="form__field form__field--span-2">
          <label class="sot-label" for="title">
            Title <span class="form__required" aria-hidden="true">*</span>
          </label>
          <input
            id="title"
            type="text"
            class="sot-input"
            formControlName="title"
            [attr.maxlength]="titleMax"
            placeholder="e.g. Morning safety walk — Bay 3"
            #titleInput
          />
          @if (showError('title')) {
            <p class="form__error" role="alert">
              @if (form.controls.title.hasError('required')) {
                A title is required.
              } @else if (form.controls.title.hasError('minlength')) {
                Title must be at least 3 characters.
              } @else {
                Title is too long (max {{ titleMax }} characters).
              }
            </p>
          }
        </div>

        <div class="form__field">
          <label class="sot-label" for="type">
            Type <span class="form__required" aria-hidden="true">*</span>
          </label>
          <select id="type" class="sot-input" formControlName="inspectionType">
            @for (opt of typeOptions; track opt.value) {
              <option [ngValue]="opt.value">{{ opt.label }}</option>
            }
          </select>
        </div>

        <div class="form__field">
          <label class="sot-label" for="priority">
            Priority <span class="form__required" aria-hidden="true">*</span>
          </label>
          <select id="priority" class="sot-input" formControlName="priority">
            @for (opt of priorityOptions; track opt.value) {
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
          <label class="sot-label" for="dueDate">Due date</label>
          <input
            id="dueDate"
            type="date"
            class="sot-input"
            formControlName="dueDate"
          />
        </div>

        <div class="form__field form__field--span-2">
          <label class="sot-label" for="assignedTo">Assigned to</label>
          <select id="assignedTo" class="sot-input" formControlName="assignedTo">
            <option [ngValue]="null">— Unassigned —</option>
            @for (m of members(); track m.id) {
              <option [ngValue]="m.id">
                {{ m.firstName }} {{ m.lastName }} ({{ m.email }})
              </option>
            }
          </select>
        </div>

        <div class="form__field form__field--span-2">
          <label class="sot-label" for="description">Description</label>
          <textarea
            id="description"
            class="sot-input form__textarea"
            formControlName="description"
            [attr.maxlength]="descriptionMax"
            rows="4"
            placeholder="What's being inspected, scope, safety notes…"
          ></textarea>
          @if (showError('description')) {
            <p class="form__error" role="alert">
              Description is too long (max {{ descriptionMax }} characters).
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

      @media (max-width: 640px) {
        .form__grid { grid-template-columns: 1fr; }
        .form__field--span-2 { grid-column: auto; }
      }
    `,
  ],
})
export class InspectionFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tenants = inject(TenantService);

  /** When provided, the form hydrates from it on init (edit flow). */
  readonly initialValue = input<Inspection | null>(null);
  /** Driven by the host so button text matches (e.g. "Create" vs "Save"). */
  readonly submitLabel = input<string>('Save');
  /** True while the save is in flight; disables the submit button. */
  readonly submitting = input<boolean>(false);

  /** Emitted with a payload ready for InspectionsService.create / update. */
  readonly submitted = output<CreateInspectionPayload>();
  readonly cancelled = output<void>();

  protected readonly members = signal<TenantMember[]>([]);

  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;

  protected readonly typeOptions = labelOptions<InspectionType>(INSPECTION_TYPE_LABEL);
  protected readonly statusOptions = labelOptions<InspectionStatus>(INSPECTION_STATUS_LABEL);
  protected readonly priorityOptions = labelOptions<InspectionPriority>(INSPECTION_PRIORITY_LABEL);

  // Typed form — Angular infers the FormGroup type from the nonNullable
  // controls so `form.controls.title.value` is `string`, etc.
  protected readonly form = this.fb.nonNullable.group({
    title: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(TITLE_MAX),
    ]),
    description: this.fb.nonNullable.control('', [
      Validators.maxLength(DESCRIPTION_MAX),
    ]),
    inspectionType: this.fb.nonNullable.control<InspectionType>('general'),
    priority: this.fb.nonNullable.control<InspectionPriority>('medium'),
    status: this.fb.nonNullable.control<InspectionStatus>('draft'),
    assignedTo: this.fb.control<string | null>(null),
    dueDate: this.fb.control<string | null>(null),
  });

  // Guards against re-hydrating the form on every `initialValue` change.
  // Without it, the effect would fire after a successful save (when the
  // page sets `inspection` to the server's echo) and wipe any edits the
  // user has started since. We patch only when the incoming entity's id
  // differs from what we last patched.
  private readonly lastPatchedId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (!initial) return;
      if (initial.id === this.lastPatchedId()) return;
      this.form.patchValue({
        title: initial.title,
        description: initial.description,
        inspectionType: initial.inspectionType,
        priority: initial.priority,
        status: initial.status,
        assignedTo: initial.assignedTo,
        dueDate: initial.dueDate,
      });
      this.lastPatchedId.set(initial.id);
    });
  }

  async ngOnInit(): Promise<void> {
    this.members.set(await this.tenants.getTenantMembers());
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
      title: value.title.trim(),
      description: value.description.trim(),
      inspectionType: value.inspectionType,
      priority: value.priority,
      status: value.status,
      assignedTo: value.assignedTo,
      // Empty date input comes back as '' — normalize to null.
      dueDate: value.dueDate || null,
    });
  }
}

function labelOptions<T extends string>(
  labels: Record<T, string>,
): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
