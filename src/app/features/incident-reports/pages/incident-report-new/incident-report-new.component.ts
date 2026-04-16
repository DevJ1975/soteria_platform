import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { IncidentReportFormComponent } from '../../components/incident-report-form/incident-report-form.component';
import { CreateIncidentReportPayload } from '../../models/incident-report.model';
import { IncidentReportsService } from '../../services/incident-reports.service';

@Component({
  selector: 'sot-incident-report-new',
  standalone: true,
  imports: [PageHeaderComponent, IncidentReportFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="New incident report"
      subtitle="Capture a safety event while it's fresh. You can keep it as a draft and finish later."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <sot-incident-report-form
      submitLabel="Create report"
      [submitting]="submitting()"
      (submitted)="create($event)"
      (cancelled)="navigateToList()"
    />
  `,
})
export class IncidentReportNewComponent {
  private readonly service = inject(IncidentReportsService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async create(payload: CreateIncidentReportPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const created = await this.service.createIncidentReport(payload);
      // Land on the detail page so the reporter sees the report rendered
      // cleanly and can verify what was saved.
      await this.router.navigate(['/app/incident-reports', created.id]);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not file report.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/app/incident-reports']);
  }
}
