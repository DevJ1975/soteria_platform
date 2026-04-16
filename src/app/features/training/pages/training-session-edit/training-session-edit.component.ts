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

import { TrainingSessionFormComponent } from '../../components/training-session-form/training-session-form.component';
import {
  CreateTrainingSessionPayload,
  TrainingSession,
} from '../../models/training-session.model';
import { TrainingSessionsService } from '../../services/training-sessions.service';

@Component({
  selector: 'sot-training-session-edit',
  standalone: true,
  imports: [PageHeaderComponent, TrainingSessionFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="session()?.title ?? 'Edit session'"
      subtitle="Update details. Attendance is managed from the detail page."
    >
      <button
        type="button"
        class="sot-btn sot-btn--ghost edit__delete"
        (click)="remove()"
        [disabled]="deleting() || !session()"
      >
        {{ deleting() ? 'Deleting…' : 'Delete' }}
      </button>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading session…</div>
    } @else if (!session()) {
      <div class="sot-state">Session not found.</div>
    } @else {
      <sot-training-session-form
        submitLabel="Save changes"
        [initialValue]="session()"
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
export class TrainingSessionEditComponent implements OnInit {
  private readonly service = inject(TrainingSessionsService);
  private readonly router = inject(Router);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly session = signal<TrainingSession | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.session.set(await this.service.getTrainingSessionById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load session.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(payload: CreateTrainingSessionPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.service.updateTrainingSession(this.id(), payload);
      this.session.set(updated);
      await this.router.navigate(['/app/training', this.id()]);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not save changes. Please try again.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const target = this.session();
    if (!target) return;
    const ok = window.confirm(
      `Delete "${target.title}"? All attendance records will also be deleted. This cannot be undone.`,
    );
    if (!ok) return;

    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.deleteTrainingSession(target.id);
      await this.router.navigate(['/app/training']);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }

  protected navigateToDetail(): void {
    void this.router.navigate(['/app/training', this.id()]);
  }
}
