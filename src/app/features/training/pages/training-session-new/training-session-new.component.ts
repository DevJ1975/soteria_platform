import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { TrainingSessionFormComponent } from '../../components/training-session-form/training-session-form.component';
import { CreateTrainingSessionPayload } from '../../models/training-session.model';
import { TrainingSessionsService } from '../../services/training-sessions.service';

@Component({
  selector: 'sot-training-session-new',
  standalone: true,
  imports: [PageHeaderComponent, TrainingSessionFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="New toolbox talk"
      subtitle="Create the session, then record attendance from the detail page."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <sot-training-session-form
      submitLabel="Create session"
      [submitting]="submitting()"
      (submitted)="create($event)"
      (cancelled)="navigateToList()"
    />
  `,
})
export class TrainingSessionNewComponent {
  private readonly service = inject(TrainingSessionsService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async create(payload: CreateTrainingSessionPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const created = await this.service.createTrainingSession(payload);
      // Land on the detail page so the user can start adding attendees.
      await this.router.navigate(['/app/training', created.id]);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not create session.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/app/training']);
  }
}
