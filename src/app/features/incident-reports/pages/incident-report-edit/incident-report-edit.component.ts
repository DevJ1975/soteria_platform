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

import { IncidentReportFormComponent } from '../../components/incident-report-form/incident-report-form.component';
import {
  CreateIncidentReportPayload,
  IncidentReport,
} from '../../models/incident-report.model';
import { IncidentReportsService } from '../../services/incident-reports.service';

@Component({
  selector: 'sot-incident-report-edit',
  standalone: true,
  imports: [PageHeaderComponent, IncidentReportFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="report()?.title ?? 'Edit report'"
      subtitle="Amend details, update status, or add follow-up notes."
    >
      <button
        type="button"
        class="sot-btn sot-btn--ghost edit__delete"
        (click)="remove()"
        [disabled]="deleting() || !report()"
      >
        {{ deleting() ? 'Deleting…' : 'Delete' }}
      </button>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading report…</div>
    } @else if (!report()) {
      <div class="sot-state">Report not found.</div>
    } @else {
      <sot-incident-report-form
        submitLabel="Save changes"
        [initialValue]="report()"
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
export class IncidentReportEditComponent implements OnInit {
  private readonly service = inject(IncidentReportsService);
  private readonly router = inject(Router);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly report = signal<IncidentReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.report.set(await this.service.getIncidentReportById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load report.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(payload: CreateIncidentReportPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.service.updateIncidentReport(this.id(), payload);
      this.report.set(updated);
      await this.router.navigate(['/app/incident-reports', this.id()]);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not save changes. Please try again.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const target = this.report();
    if (!target) return;
    const ok = window.confirm(
      `Delete "${target.title}"? This will remove it from the audit trail and cannot be undone.`,
    );
    if (!ok) return;

    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.deleteIncidentReport(target.id);
      await this.router.navigate(['/app/incident-reports']);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }

  protected navigateToDetail(): void {
    void this.router.navigate(['/app/incident-reports', this.id()]);
  }
}
