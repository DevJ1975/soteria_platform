import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { CorrectiveActionFormComponent } from '../../components/corrective-action-form/corrective-action-form.component';
import { CreateCorrectiveActionPayload } from '../../models/corrective-action.model';
import { CorrectiveActionsService } from '../../services/corrective-actions.service';

/**
 * New corrective action page.
 *
 * Accepts an optional `?inspectionId=` query param. When present, the form
 * starts with the inspection dropdown pre-selected so users creating an
 * action from an inspection context don't have to search for it.
 *
 * The query-param binding comes from `withComponentInputBinding()` on the
 * router config — query params flow straight into declared inputs.
 */
@Component({
  selector: 'sot-corrective-action-new',
  standalone: true,
  imports: [PageHeaderComponent, CorrectiveActionFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="New corrective action"
      subtitle="Capture what needs fixing, who owns it, and when it's due."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <sot-corrective-action-form
      submitLabel="Create action"
      [initialInspectionId]="inspectionId() ?? null"
      [submitting]="submitting()"
      (submitted)="create($event)"
      (cancelled)="navigateBack()"
    />
  `,
})
export class CorrectiveActionNewComponent {
  private readonly service = inject(CorrectiveActionsService);
  private readonly router = inject(Router);

  /** Bound from `?inspectionId=` query param via withComponentInputBinding. */
  readonly inspectionId = input<string | undefined>();

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async create(payload: CreateCorrectiveActionPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.createCorrectiveAction(payload);
      await this.afterSubmit(payload.inspectionId ?? null);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not create corrective action.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateBack(): void {
    void this.afterSubmit(this.inspectionId() ?? null);
  }

  /**
   * If the user started from an inspection, return them to that inspection's
   * edit page so they see the new action show up in the panel. Otherwise
   * land on the main corrective-actions list.
   */
  private async afterSubmit(inspectionId: string | null): Promise<void> {
    if (inspectionId) {
      await this.router.navigate(['/app/inspections', inspectionId, 'edit']);
    } else {
      await this.router.navigate(['/app/corrective-actions']);
    }
  }
}
