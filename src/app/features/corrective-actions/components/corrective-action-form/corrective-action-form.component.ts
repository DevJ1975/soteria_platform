import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { TenantMemberLookupService } from '@core/services/tenant-member-lookup.service';
import { IncidentReport } from '@features/incident-reports/models/incident-report.model';
import { IncidentReportsService } from '@features/incident-reports/services/incident-reports.service';
import { Inspection } from '@features/inspections/models/inspection.model';
import { InspectionsService } from '@features/inspections/services/inspections.service';
import { formatDateTime } from '@shared/utils/date.util';

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
 * Cross-module linkage
 * --------------------
 * A corrective action can optionally be linked to a source that produced
 * it — one of three at most:
 *   - an inspection finding
 *   - an incident report
 *   - an equipment check (failed or needs-attention)
 *
 * Two ways to pre-fill linkage:
 *   1. Pass a full `initialValue` (edit mode) — all three link fields
 *      hydrate from the entity.
 *   2. Pass `initialInspectionId` / `initialIncidentReportId` /
 *      `initialEquipmentCheckId` (new-from-context mode) — the matching
 *      control starts pre-selected. Used by the "Add corrective action"
 *      deep-links from each detail panel.
 *
 * The inspection and incident pickers are dropdowns. The equipment-check
 * linkage is view-only in this form — users who need to rewire one do
 * so by deleting and recreating (context linkage is rare to change).
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
          <select id="inspectionId" class="sot-input" formControlName="inspectionId">
            <option [ngValue]="null">— Not linked —</option>
            @for (i of inspections(); track i.id) {
              <option [ngValue]="i.id">{{ i.title }}</option>
            }
          </select>
        </div>

        <div class="form__field form__field--span-2">
          <label class="sot-label" for="incidentReportId">Linked incident report</label>
          <select id="incidentReportId" class="sot-input" formControlName="incidentReportId">
            <option [ngValue]="null">— Not linked —</option>
            @for (r of incidentReports(); track r.id) {
              <option [ngValue]="r.id">{{ r.title }}</option>
            }
          </select>
        </div>

        @if (form.controls.equipmentCheckId.value) {
          <div class="form__field form__field--span-2 linked-check">
            <span class="linked-check__label">Linked equipment check</span>
            <span class="linked-check__value">
              @if (linkedEquipmentCheckSummary()) {
                {{ linkedEquipmentCheckSummary() }}
              } @else {
                Linked to an equipment check
              }
            </span>
            <p class="form__hint">
              Check linkage is set when you create an action from a
              failed check. To change it, delete this action and create
              a new one from the right check.
            </p>
          </div>
        }

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
        <button type="button" class="sot-btn sot-btn--ghost" (click)="cancelled.emit()">
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

      .linked-check {
        background: var(--color-primary-soft);
        border: 1px solid #bfdbfe;
        border-radius: var(--radius-md);
        padding: var(--space-3);
      }
      .linked-check__label {
        font-size: 11px;
        color: var(--color-primary-hover);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }
      .linked-check__value {
        font-weight: 500;
        color: var(--color-text);
        margin-top: 2px;
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
  private readonly incidentsService = inject(IncidentReportsService);

  readonly initialValue = input<CorrectiveAction | null>(null);
  readonly initialInspectionId = input<string | null>(null);
  readonly initialIncidentReportId = input<string | null>(null);
  readonly initialEquipmentCheckId = input<string | null>(null);
  readonly submitLabel = input<string>('Save');
  readonly submitting = input<boolean>(false);

  readonly submitted = output<CreateCorrectiveActionPayload>();
  readonly cancelled = output<void>();

  protected readonly inspections = signal<Array<Pick<Inspection, 'id' | 'title'>>>([]);
  protected readonly incidentReports = signal<Array<Pick<IncidentReport, 'id' | 'title'>>>([]);

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
    incidentReportId: this.fb.control<string | null>(null),
    equipmentCheckId: this.fb.control<string | null>(null),
    assignedTo: this.fb.control<string | null>(null),
    dueDate: this.fb.control<string | null>(null),
  });

  /** Pretty summary of the linked equipment check, when the edit entity
   *  came with one embedded. */
  protected readonly linkedEquipmentCheckSummary = computed(() => {
    const embedded = this.initialValue()?.linkedEquipmentCheck;
    if (!embedded) return null;
    return `${embedded.checkType.replace(/_/g, ' ')} · ${formatDateTime(embedded.performedAt)}`;
  });

  // Re-hydration guard — see InspectionFormComponent for rationale.
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
          incidentReportId: initial.incidentReportId,
          equipmentCheckId: initial.equipmentCheckId,
          assignedTo: initial.assignedTo,
          dueDate: initial.dueDate,
        });
        this.lastPatchedId.set(initial.id);
        return;
      }

      // New-from-context presets. At most one of the three should be
      // provided in practice; if multiple are, they all get set and the
      // user sees all three dropdowns filled — unusual but not broken.
      const inspPreset = this.initialInspectionId();
      if (inspPreset && this.form.controls.inspectionId.pristine) {
        this.form.patchValue({ inspectionId: inspPreset });
      }
      const incidentPreset = this.initialIncidentReportId();
      if (incidentPreset && this.form.controls.incidentReportId.pristine) {
        this.form.patchValue({ incidentReportId: incidentPreset });
      }
      const checkPreset = this.initialEquipmentCheckId();
      if (checkPreset && this.form.controls.equipmentCheckId.pristine) {
        this.form.patchValue({ equipmentCheckId: checkPreset });
      }
    });
  }

  async ngOnInit(): Promise<void> {
    void this.lookup.ensureLoaded();
    // Load inspections and incidents in parallel for the dropdowns.
    const [inspections, incidents] = await Promise.all([
      this.inspectionsService.getInspections(),
      this.incidentsService.getIncidentReports(),
    ]);
    this.inspections.set(inspections.map((r) => ({ id: r.id, title: r.title })));
    this.incidentReports.set(incidents.map((r) => ({ id: r.id, title: r.title })));
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
      incidentReportId: value.incidentReportId,
      equipmentCheckId: value.equipmentCheckId,
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
