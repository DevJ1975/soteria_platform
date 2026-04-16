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

import { localNow, toDatetimeLocal } from '@shared/utils/date.util';

import {
  CreateIncidentReportPayload,
  INCIDENT_REPORT_TYPE_LABEL,
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  IncidentReport,
  IncidentReportType,
  IncidentSeverity,
  IncidentStatus,
} from '../../models/incident-report.model';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;  // longer than inspections/CAs — reports are document-like
const NOTES_MAX = 2000;
const LOCATION_MAX = 200;

/**
 * Reusable reactive form for creating / editing incident reports.
 *
 * Laid out in four sections because the fieldset is wider than other
 * modules (10+ fields). Sectioning gives the eye rest points and makes
 * the form feel less like a wall of inputs.
 *
 * The form is dumb — it emits `submitted` with a typed payload; the host
 * calls the service and navigates.
 */
@Component({
  selector: 'sot-incident-report-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <section class="section">
        <header class="section__header">
          <h3 class="section__title">What happened</h3>
          <p class="section__subtitle">The essentials — required for every report.</p>
        </header>

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
              placeholder="e.g. Forklift tipped while turning in Bay 2"
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
            <label class="sot-label" for="reportType">
              Type <span class="form__required" aria-hidden="true">*</span>
            </label>
            <select id="reportType" class="sot-input" formControlName="reportType">
              @for (opt of typeOptions; track opt.value) {
                <option [ngValue]="opt.value">{{ opt.label }}</option>
              }
            </select>
          </div>

          <div class="form__field">
            <label class="sot-label" for="severity">
              Severity <span class="form__required" aria-hidden="true">*</span>
            </label>
            <select id="severity" class="sot-input" formControlName="severity">
              @for (opt of severityOptions; track opt.value) {
                <option [ngValue]="opt.value">{{ opt.label }}</option>
              }
            </select>
          </div>

          <div class="form__field form__field--span-2">
            <label class="sot-label" for="eventOccurredAt">
              Event occurred at <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="eventOccurredAt"
              type="datetime-local"
              class="sot-input"
              formControlName="eventOccurredAt"
              [attr.max]="maxEventOccurredAt"
            />
            <p class="form__hint">
              When did the event actually happen? You can record an event
              that happened earlier; future dates aren't allowed.
            </p>
            @if (showError('eventOccurredAt')) {
              <p class="form__error" role="alert">Event date is required.</p>
            }
          </div>

          <div class="form__field form__field--span-2">
            <label class="sot-label" for="description">Description</label>
            <textarea
              id="description"
              class="sot-input form__textarea"
              formControlName="description"
              [attr.maxlength]="descriptionMax"
              rows="5"
              placeholder="What happened, in your own words. Stick to observed facts; analysis and corrective actions can come later."
            ></textarea>
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__header">
          <h3 class="section__title">Where &amp; who</h3>
          <p class="section__subtitle">Optional context. Fill in what you know.</p>
        </header>

        <div class="form__grid">
          <div class="form__field form__field--span-2">
            <label class="sot-label" for="locationText">Location</label>
            <input
              id="locationText"
              type="text"
              class="sot-input"
              formControlName="locationText"
              [attr.maxlength]="locationMax"
              placeholder="e.g. Warehouse B, Aisle 4 · Loading dock 3"
            />
          </div>

          <div class="form__field form__field--span-2">
            <label class="sot-label" for="involvedPeopleNotes">People involved</label>
            <textarea
              id="involvedPeopleNotes"
              class="sot-input form__textarea"
              formControlName="involvedPeopleNotes"
              [attr.maxlength]="notesMax"
              rows="3"
              placeholder="Names, witnesses, roles. Free-form for now; a structured witness list is planned for a later release."
            ></textarea>
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__header">
          <h3 class="section__title">Response</h3>
          <p class="section__subtitle">What was done at the time, and what still needs to happen.</p>
        </header>

        <div class="form__grid">
          <div class="form__field form__field--span-2">
            <label class="sot-label" for="immediateActionsTaken">Immediate actions taken</label>
            <textarea
              id="immediateActionsTaken"
              class="sot-input form__textarea"
              formControlName="immediateActionsTaken"
              [attr.maxlength]="notesMax"
              rows="3"
              placeholder="What was done on the spot — first aid, area secured, equipment tagged out, etc."
            ></textarea>
          </div>

          <div class="form__field form__field--span-2">
            <label class="sot-label" for="followUpNotes">Follow-up notes</label>
            <textarea
              id="followUpNotes"
              class="sot-input form__textarea"
              formControlName="followUpNotes"
              [attr.maxlength]="notesMax"
              rows="3"
              placeholder="What still needs to be done. Corrective actions will be tracked separately in a later release."
            ></textarea>
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__header">
          <h3 class="section__title">Status</h3>
          <p class="section__subtitle">Where this report is in the investigation lifecycle.</p>
        </header>

        <div class="form__grid">
          <div class="form__field">
            <label class="sot-label" for="status">Status</label>
            <select id="status" class="sot-input" formControlName="status">
              @for (opt of statusOptions; track opt.value) {
                <option [ngValue]="opt.value">{{ opt.label }}</option>
              }
            </select>
            <p class="form__hint">
              Moving status to "Closed" stamps the closed date automatically.
              Reverting to any other status clears it.
            </p>
          </div>
        </div>
      </section>

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
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

      .section {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-5);
        box-shadow: var(--shadow-sm);
      }

      .section__header {
        margin-bottom: var(--space-4);
      }

      .section__title {
        font-size: var(--font-size-lg);
        font-weight: 600;
        margin-bottom: 2px;
      }

      .section__subtitle {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
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
      }

      @media (max-width: 640px) {
        .form__grid { grid-template-columns: 1fr; }
        .form__field--span-2 { grid-column: auto; }
      }
    `,
  ],
})
export class IncidentReportFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly initialValue = input<IncidentReport | null>(null);
  readonly submitLabel = input<string>('Save');
  readonly submitting = input<boolean>(false);

  readonly submitted = output<CreateIncidentReportPayload>();
  readonly cancelled = output<void>();

  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly notesMax = NOTES_MAX;
  protected readonly locationMax = LOCATION_MAX;

  /** Cap the datetime-local picker at "now" so users can't report an
   *  event as having occurred in the future. */
  protected readonly maxEventOccurredAt = localNow();

  protected readonly typeOptions = labelOptions<IncidentReportType>(
    INCIDENT_REPORT_TYPE_LABEL,
  );
  protected readonly severityOptions = labelOptions<IncidentSeverity>(
    INCIDENT_SEVERITY_LABEL,
  );
  protected readonly statusOptions = labelOptions<IncidentStatus>(
    INCIDENT_STATUS_LABEL,
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
    reportType: this.fb.nonNullable.control<IncidentReportType>('incident'),
    severity: this.fb.nonNullable.control<IncidentSeverity>('low'),
    status: this.fb.nonNullable.control<IncidentStatus>('draft'),
    eventOccurredAt: this.fb.nonNullable.control(localNow(), [
      Validators.required,
    ]),
    locationText: this.fb.nonNullable.control('', [
      Validators.maxLength(LOCATION_MAX),
    ]),
    involvedPeopleNotes: this.fb.nonNullable.control('', [
      Validators.maxLength(NOTES_MAX),
    ]),
    immediateActionsTaken: this.fb.nonNullable.control('', [
      Validators.maxLength(NOTES_MAX),
    ]),
    followUpNotes: this.fb.nonNullable.control('', [
      Validators.maxLength(NOTES_MAX),
    ]),
  });

  // Re-hydration guard — see InspectionFormComponent for rationale.
  private readonly lastPatchedId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (!initial) return;
      if (initial.id === this.lastPatchedId()) return;
      this.form.patchValue({
        title: initial.title,
        description: initial.description,
        reportType: initial.reportType,
        severity: initial.severity,
        status: initial.status,
        eventOccurredAt: toDatetimeLocal(initial.eventOccurredAt),
        locationText: initial.locationText ?? '',
        involvedPeopleNotes: initial.involvedPeopleNotes ?? '',
        immediateActionsTaken: initial.immediateActionsTaken ?? '',
        followUpNotes: initial.followUpNotes ?? '',
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
      title: value.title.trim(),
      description: value.description.trim(),
      reportType: value.reportType,
      severity: value.severity,
      status: value.status,
      eventOccurredAt: new Date(value.eventOccurredAt).toISOString(),
      locationText: value.locationText.trim() || null,
      involvedPeopleNotes: value.involvedPeopleNotes.trim() || null,
      immediateActionsTaken: value.immediateActionsTaken.trim() || null,
      followUpNotes: value.followUpNotes.trim() || null,
    });
  }
}

function labelOptions<T extends string>(
  labels: Record<T, string>,
): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

