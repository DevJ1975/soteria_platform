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

import { CorrectiveActionFormComponent } from '../../components/corrective-action-form/corrective-action-form.component';
import {
  CorrectiveAction,
  CreateCorrectiveActionPayload,
} from '../../models/corrective-action.model';
import { CorrectiveActionsService } from '../../services/corrective-actions.service';

@Component({
  selector: 'sot-corrective-action-edit',
  standalone: true,
  imports: [PageHeaderComponent, CorrectiveActionFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="action()?.title ?? 'Edit corrective action'"
      subtitle="Update details, reassign, or mark progress."
    >
      <button
        type="button"
        class="sot-btn sot-btn--ghost edit__delete"
        (click)="remove()"
        [disabled]="deleting() || !action()"
      >
        {{ deleting() ? 'Deleting…' : 'Delete' }}
      </button>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading action…</div>
    } @else if (!action()) {
      <div class="sot-state">Corrective action not found.</div>
    } @else {
      <sot-corrective-action-form
        submitLabel="Save changes"
        [initialValue]="action()"
        [submitting]="submitting()"
        (submitted)="save($event)"
        (cancelled)="navigateToList()"
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
export class CorrectiveActionEditComponent implements OnInit {
  private readonly service = inject(CorrectiveActionsService);
  private readonly router = inject(Router);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly action = signal<CorrectiveAction | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.action.set(await this.service.getCorrectiveActionById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load corrective action.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(payload: CreateCorrectiveActionPayload): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.service.updateCorrectiveAction(this.id(), payload);
      this.action.set(updated);
      await this.router.navigate(['/app/corrective-actions']);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not save changes. Please try again.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const target = this.action();
    if (!target) return;
    const ok = window.confirm(`Delete "${target.title}"? This cannot be undone.`);
    if (!ok) return;

    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.deleteCorrectiveAction(target.id);
      await this.router.navigate(['/app/corrective-actions']);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/app/corrective-actions']);
  }
}
