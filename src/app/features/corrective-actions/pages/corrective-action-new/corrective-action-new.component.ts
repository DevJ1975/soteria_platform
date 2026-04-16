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
 * Accepts three optional query params, any one of which pre-links the
 * new action to its source:
 *
 *   ?inspectionId=<uuid>       from an inspection finding
 *   ?incidentReportId=<uuid>   from an incident report
 *   ?equipmentCheckId=<uuid>   from a failed / needs-attention check
 *
 * Query-param → input binding comes for free via
 * `withComponentInputBinding()` on the router config.
 *
 * After a successful save, we return the user to the originating
 * context's detail page so the new action appears in the panel
 * immediately. If no context was provided (ad-hoc create from the CA
 * list), we return to the CA list.
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
      [initialIncidentReportId]="incidentReportId() ?? null"
      [initialEquipmentCheckId]="equipmentCheckId() ?? null"
      [submitting]="submitting()"
      (submitted)="create($event)"
      (cancelled)="navigateBack()"
    />
  `,
})
export class CorrectiveActionNewComponent {
  private readonly service = inject(CorrectiveActionsService);
  private readonly router = inject(Router);

  // Query params → inputs. Any one of these (or none) may be present.
  readonly inspectionId = input<string | undefined>();
  readonly incidentReportId = input<string | undefined>();
  readonly equipmentCheckId = input<string | undefined>();

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async create(payload: CreateCorrectiveActionPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.createCorrectiveAction(payload);
      await this.afterSubmit(payload);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not create corrective action.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateBack(): void {
    // Cancel should go back to the context the user came from, if any.
    void this.afterSubmit({
      inspectionId: this.inspectionId() ?? null,
      incidentReportId: this.incidentReportId() ?? null,
      equipmentCheckId: this.equipmentCheckId() ?? null,
    });
  }

  /**
   * Return to the originating context so the new row appears where the
   * user expects. Inspection → inspection edit page; incident →
   * incident detail; equipment check → the equipment detail that owns
   * the check. Fallback: the corrective-actions list.
   */
  private async afterSubmit(source: {
    inspectionId?: string | null;
    incidentReportId?: string | null;
    equipmentCheckId?: string | null;
  }): Promise<void> {
    if (source.inspectionId) {
      await this.router.navigate(['/app/inspections', source.inspectionId, 'edit']);
      return;
    }
    if (source.incidentReportId) {
      await this.router.navigate(['/app/incident-reports', source.incidentReportId]);
      return;
    }
    if (source.equipmentCheckId) {
      // Equipment checks don't have their own detail page; the user
      // came from an equipment detail page whose id we don't know here.
      // Land on the CA list, which surfaces the new row at the top.
      await this.router.navigate(['/app/corrective-actions']);
      return;
    }
    await this.router.navigate(['/app/corrective-actions']);
  }
}
