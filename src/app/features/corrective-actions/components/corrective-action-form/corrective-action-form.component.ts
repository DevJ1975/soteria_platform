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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { TenantMemberLookupService } from '@core/services/tenant-member-lookup.service';
import { Inspection } from '@features/inspections/models/inspection.model';
import { InspectionsService } from '@features/inspections/services/inspections.service';

import {
  CORRECTIVE_ACTION_PRIORITY_LABEL,
  CORRECTIVE_ACTION_STATUS_LABEL,
  CorrectiveAction,
  CorrectiveActionPriority,
  CorrectiveActionStatus,
  CreateCorrectiveActionPayload,
} from '../../models/corrective-action.model';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

/**
 * Reusable reactive form shared by create and edit pages.
 *
 * Two ways to pre-fill linkage to an inspection:
 *   1. Pass a full `initialValue` (edit mode) — any fields are hydrated.
 *   2. Pass `initialInspectionId` (new-from-inspection-context mode) — the
 *      dropdown starts pre-selected. Takes precedence only when there's
 *      no `initialValue` to hydrate from.
 *
 * The form is deliberately dumb. It emits `submitted` with a typed payload
 * and the host is responsible for calling the service and navigating.
 */
@Component({
  selector: 'sot-corrective-action-form',
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
            placeholder="e.g. Replace cracked guard on saw #4"
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

        <div class="form__field">
          <label class="sot-label" for="assignedTo">Assigned to</label>
          <select id="assignedTo" class="sot-input" formControlName="assignedTo">
            <option [ngValue]="null">— Unassigned —</option>
            @for (m of lookup.members(); track m.id) {
              <option [ngValue]="m.id">
                {{ m.firstName }} {{ m.lastName }} ({{ m.email }})
              </option>
            }
          </select>
        </div>

        <div class="form__field form__field--span-2">
          <label class="sot-label" for="inspectionId">Linked inspection</label>
          <select
            id="inspectionId"
            class="sot-input"
            formControlName="inspectionId"
          >
            <option [ngValue]="null">— Not linked —</option>
            @for (i of inspections(); track i.id) {
              <option [ngValue]="i.id">{{ i.title }}</option>
            }
          </select>
          <p class="form__hint">
            Link this action to an inspection when it addresses a finding from
            that inspection. Leave unlinked for ad-hoc hazards or audit items.
          </p>
        </div>

        <div class="form__field form__field--span-2">
          <label class="sot-label" for="description">Description / notes</label>
          <textarea
            id="description"
            class="sot-input form__textarea"
            formControlName="description"
            [attr.maxlength]="descriptionMax"
            rows="4"
            placeholder="What needs to be done, constraints, parts needed…"
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
export class CorrectiveActionFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  protected readonly lookup = inject(TenantMemberLookupService);
  private readonly inspectionsService = inject(InspectionsService);

  readonly initialValue = input<CorrectiveAction | null>(null);
  readonly initialInspectionId = input<string | null>(null);
  readonly submitLabel = input<string>('Save');
  readonly submitting = input<boolean>(false);

  readonly submitted = output<CreateCorrectiveActionPayload>();
  readonly cancelled = output<void>();

  protected readonly inspections = signal<Array<Pick<Inspection, 'id' | 'title'>>>([]);

  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;

  protected readonly statusOptions = labelOptions<CorrectiveActionStatus>(
    CORRECTIVE_ACTION_STATUS_LABEL,
  );
  protected readonly priorityOptions = labelOptions<CorrectiveActionPriority>(
    CORRECTIVE_ACTION_PRIORITY_LABEL,
  );

  protected readonly form = this.fb.nonNullable.group({
    title: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(TITLE_MAX),
    ]),
    description: this.fb.nonNullable.control('', [
      Validators.maxLength(DESCRIPTION_MAX),
    ]),
    priority: this.fb.nonNullable.control<CorrectiveActionPriority>('medium'),
    status: this.fb.nonNullable.control<CorrectiveActionStatus>('open'),
    inspectionId: this.fb.control<string | null>(null),
    assignedTo: this.fb.control<string | null>(null),
    dueDate: this.fb.control<string | null>(null),
  });

  // Guards against re-hydrating the form on every `initialValue` signal
  // change. Without it, the effect would fire after a successful save
  // (when the page re-sets `inspection` to the server's echo) and wipe
  // any edits the user has started since. We patch only when the
  // incoming entity's id differs from what we last patched.
  private readonly lastPatchedId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (initial) {
        if (initial.id === this.lastPatchedId()) return;
        this.form.patchValue({
          title: initial.title,
          description: initial.description,
          priority: initial.priority,
          status: initial.status,
          inspectionId: initial.inspectionId,
          assignedTo: initial.assignedTo,
          dueDate: initial.dueDate,
        });
        this.lastPatchedId.set(initial.id);
        return;
      }
      // No full initialValue yet — seed the inspection dropdown from the
      // "from inspection context" preset, but only once.
      const preset = this.initialInspectionId();
      if (preset && this.form.controls.inspectionId.pristine) {
        this.form.patchValue({ inspectionId: preset });
      }
    });
  }

  async ngOnInit(): Promise<void> {
    // Roster comes from the shared lookup service — cached and reactive,
    // so templates bind to lookup.members(). Inspections are still loaded
    // here because they're a per-form concern.
    void this.lookup.ensureLoaded();
    const rows: Inspection[] = await this.inspectionsService.getInspections();
    this.inspections.set(rows.map((r: Inspection) => ({ id: r.id, title: r.title })));
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
      priority: value.priority,
      status: value.status,
      inspectionId: value.inspectionId,
      assignedTo: value.assignedTo,
      dueDate: value.dueDate || null,
    });
  }
}

function labelOptions<T extends string>(
  labels: Record<T, string>,
): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
