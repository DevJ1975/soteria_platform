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

import { InspectionFormComponent } from '../../components/inspection-form/inspection-form.component';
import {
  CreateInspectionPayload,
  Inspection,
} from '../../models/inspection.model';
import { InspectionsService } from '../../services/inspections.service';

/**
 * Edit page. Loads the target inspection by `:id` (bound automatically via
 * `withComponentInputBinding()` in app.config.ts) and hands it off to the
 * shared form. Also hosts the delete action.
 */
@Component({
  selector: 'sot-inspection-edit',
  standalone: true,
  imports: [PageHeaderComponent, InspectionFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="inspection()?.title ?? 'Edit inspection'"
      subtitle="Update details, reassign, or mark progress."
    >
      <button
        type="button"
        class="sot-btn sot-btn--ghost edit__delete"
        (click)="remove()"
        [disabled]="deleting() || !inspection()"
      >
        {{ deleting() ? 'Deleting…' : 'Delete' }}
      </button>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="state">Loading inspection…</div>
    } @else if (!inspection()) {
      <div class="state">Inspection not found.</div>
    } @else {
      <sot-inspection-form
        submitLabel="Save changes"
        [initialValue]="inspection()"
        [submitting]="submitting()"
        (submitted)="save($event)"
        (cancelled)="navigateToList()"
      />
    }
  `,
  styles: [
    `
      .state {
        padding: var(--space-6);
        text-align: center;
        color: var(--color-text-muted);
        background: var(--color-surface);
        border: 1px dashed var(--color-border-strong);
        border-radius: var(--radius-lg);
      }

      .edit__delete {
        color: var(--color-danger);
        border-color: #fecaca;
      }
      .edit__delete:hover:not(:disabled) { background: #fef2f2; }
    `,
  ],
})
export class InspectionEditComponent implements OnInit {
  private readonly service = inject(InspectionsService);
  private readonly router = inject(Router);

  /** Bound from the `:id` route param via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly inspection = signal<Inspection | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.inspection.set(await this.service.getInspectionById(this.id()));
    } catch (err) {
      this.errorMessage.set(extractMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(payload: CreateInspectionPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.service.updateInspection(this.id(), payload);
      this.inspection.set(updated);
      await this.router.navigate(['/app/inspections']);
    } catch (err) {
      this.errorMessage.set(extractMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const target = this.inspection();
    if (!target) return;
    const ok = window.confirm(
      `Delete "${target.title}"? This cannot be undone.`,
    );
    if (!ok) return;

    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.deleteInspection(target.id);
      await this.router.navigate(['/app/inspections']);
    } catch (err) {
      this.errorMessage.set(extractMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/app/inspections']);
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Could not save changes. Please try again.';
}
