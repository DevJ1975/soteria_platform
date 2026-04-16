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

import { TenantMemberLookupService } from '@core/services/tenant-member-lookup.service';
import { localNow, toDatetimeLocal } from '@shared/utils/date.util';

import {
  CreateTrainingSessionPayload,
  TrainingSession,
} from '../../models/training-session.model';

const TITLE_MAX = 200;
const TOPIC_MAX = 200;
const DESCRIPTION_MAX = 4000;
const LOCATION_MAX = 200;

/**
 * Reusable reactive form for creating / editing training sessions.
 *
 * Two sections — the essentials (title/topic/date/conductor) and the
 * supplementals (description/location). The form is dumb; host pages
 * call the service and navigate on submit.
 */
@Component({
  selector: 'sot-training-session-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <section class="section">
        <header class="section__header">
          <h3 class="section__title">Session details</h3>
          <p class="section__subtitle">What, when, and who's running it.</p>
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
              placeholder="e.g. Fall protection refresher"
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
            <label class="sot-label" for="topic">
              Topic <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="topic"
              type="text"
              class="sot-input"
              formControlName="topic"
              [attr.maxlength]="topicMax"
              placeholder="e.g. PPE, LOTO, Heat safety"
            />
            <p class="form__hint">
              Short tag used for filtering and compliance reporting.
            </p>
            @if (showError('topic')) {
              <p class="form__error" role="alert">
                @if (form.controls.topic.hasError('required')) {
                  A topic is required.
                } @else {
                  Topic is too long (max {{ topicMax }} characters).
                }
              </p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="sessionDate">
              Session date <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="sessionDate"
              type="datetime-local"
              class="sot-input"
              formControlName="sessionDate"
            />
            @if (showError('sessionDate')) {
              <p class="form__error" role="alert">Session date is required.</p>
            }
          </div>

          <div class="form__field form__field--span-2">
            <label class="sot-label" for="conductedBy">Conducted by</label>
            <select
              id="conductedBy"
              class="sot-input"
              formControlName="conductedBy"
            >
              <option [ngValue]="null">— Not specified —</option>
              @for (m of lookup.members(); track m.id) {
                <option [ngValue]="m.id">
                  {{ m.firstName }} {{ m.lastName }} ({{ m.email }})
                </option>
              }
            </select>
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__header">
          <h3 class="section__title">Details</h3>
          <p class="section__subtitle">Where it happened and what was covered.</p>
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
              placeholder="e.g. Warehouse B break room"
            />
          </div>

          <div class="form__field form__field--span-2">
            <label class="sot-label" for="description">Description / notes</label>
            <textarea
              id="description"
              class="sot-input form__textarea"
              formControlName="description"
              [attr.maxlength]="descriptionMax"
              rows="4"
              placeholder="What was covered, key takeaways, references, etc."
            ></textarea>
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
      .form { display: flex; flex-direction: column; gap: var(--space-5); }

      .section {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-5);
        box-shadow: var(--shadow-sm);
      }

      .section__header { margin-bottom: var(--space-4); }

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
export class TrainingSessionFormComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly lookup = inject(TenantMemberLookupService);

  readonly initialValue = input<TrainingSession | null>(null);
  readonly submitLabel = input<string>('Save');
  readonly submitting = input<boolean>(false);

  readonly submitted = output<CreateTrainingSessionPayload>();
  readonly cancelled = output<void>();

  protected readonly titleMax = TITLE_MAX;
  protected readonly topicMax = TOPIC_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly locationMax = LOCATION_MAX;

  protected readonly form = this.fb.nonNullable.group({
    title: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(TITLE_MAX),
    ]),
    topic: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(TOPIC_MAX),
    ]),
    sessionDate: this.fb.nonNullable.control(localNow(), [Validators.required]),
    conductedBy: this.fb.control<string | null>(null),
    locationText: this.fb.nonNullable.control('', [
      Validators.maxLength(LOCATION_MAX),
    ]),
    description: this.fb.nonNullable.control('', [
      Validators.maxLength(DESCRIPTION_MAX),
    ]),
  });

  // Re-hydration guard — see InspectionFormComponent for rationale.
  private readonly lastPatchedId = signal<string | null>(null);

  constructor() {
    void this.lookup.ensureLoaded();

    effect(() => {
      const initial = this.initialValue();
      if (!initial) return;
      if (initial.id === this.lastPatchedId()) return;
      this.form.patchValue({
        title: initial.title,
        topic: initial.topic,
        sessionDate: toDatetimeLocal(initial.sessionDate),
        conductedBy: initial.conductedBy,
        locationText: initial.locationText ?? '',
        description: initial.description,
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
      topic: value.topic.trim(),
      sessionDate: new Date(value.sessionDate).toISOString(),
      conductedBy: value.conductedBy,
      locationText: value.locationText.trim() || null,
      description: value.description.trim(),
    });
  }
}
