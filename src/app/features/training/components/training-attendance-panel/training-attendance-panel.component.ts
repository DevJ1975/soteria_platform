import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TenantMemberLookupService } from '@core/services/tenant-member-lookup.service';
import { createGenerationGuard } from '@shared/utils/async-guards.util';
import { formatDateTime } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { TrainingAttendance } from '../../models/training-attendance.model';
import { TrainingAttendanceService } from '../../services/training-attendance.service';

/**
 * Reusable attendance panel for a training session. Designed for speed:
 * one input autocompletes from the tenant roster, press Enter to add,
 * input refocuses. External attendees (visitors, new hires) just type
 * the name — if it doesn't match a member, `attendee_id` stays null and
 * the name carries the record.
 *
 * The panel owns its own state (loaded attendees, error messages, add
 * form). Host passes `sessionId` and stays out of the way.
 */
@Component({
  selector: 'sot-training-attendance-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel sot-card">
      <header class="panel__header">
        <div>
          <h2 class="panel__title">
            Attendees
            @if (attendees().length > 0) {
              <span class="panel__count">
                {{ attendees().length }} ·
                {{ signedCount() }} signed
              </span>
            }
          </h2>
          <p class="panel__subtitle">
            Tap a name from the roster or type a visitor's name, then Enter.
          </p>
        </div>
      </header>

      @if (errorMessage()) {
        <div class="sot-alert sot-alert--error" role="alert">
          {{ errorMessage() }}
        </div>
      }

      <form class="add-form" (ngSubmit)="addAttendee()">
        <div class="add-form__input">
          <label class="sot-label" for="attendee-name">Attendee</label>
          <input
            #nameInput
            id="attendee-name"
            type="text"
            class="sot-input"
            placeholder="Pick from list or type a name…"
            [(ngModel)]="inputName"
            name="attendeeName"
            list="roster-options"
            autocomplete="off"
          />
          <datalist id="roster-options">
            @for (m of availableMembers(); track m.id) {
              <option [value]="m.firstName + ' ' + m.lastName"></option>
            }
          </datalist>
        </div>
        <div class="add-form__signed">
          <label class="sot-checkbox">
            <input type="checkbox" [(ngModel)]="inputSigned" name="signed" />
            <span>Signed</span>
          </label>
        </div>
        <button
          type="submit"
          class="sot-btn sot-btn--primary"
          [disabled]="adding() || !inputName.trim()"
        >
          {{ adding() ? 'Adding…' : 'Add' }}
        </button>
      </form>

      @if (loading()) {
        <div class="sot-state">Loading attendees…</div>
      } @else if (attendees().length === 0) {
        <div class="panel__empty">
          No attendees recorded yet.
        </div>
      } @else {
        <ul class="attendee-list">
          @for (a of attendees(); track a.id) {
            <li class="row">
              <div class="row__main">
                <span class="row__name">{{ a.attendeeName }}</span>
                @if (a.attendeeId === null) {
                  <span class="row__badge">External</span>
                } @else {
                  <span class="row__badge row__badge--member">Member</span>
                }
              </div>
              <div class="row__actions">
                <label class="sot-checkbox row__signed">
                  <input
                    type="checkbox"
                    [checked]="a.signed"
                    (change)="toggleSigned(a, $event)"
                  />
                  @if (a.signed && a.signedAt) {
                    <span>Signed {{ formatDate(a.signedAt) }}</span>
                  } @else if (a.signed) {
                    <span>Signed</span>
                  } @else {
                    <span>Mark signed</span>
                  }
                </label>
                <button
                  type="button"
                  class="sot-btn sot-btn--ghost row__btn row__btn--danger"
                  (click)="remove(a)"
                  aria-label="Remove attendee"
                >Remove</button>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .panel { margin-top: var(--space-5); }

      .panel__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }

      .panel__title {
        font-size: var(--font-size-lg);
        font-weight: 600;
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }

      .panel__count {
        color: var(--color-text-muted);
        font-weight: 500;
        font-size: var(--font-size-md);
      }

      .panel__subtitle {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .panel__empty {
        padding: var(--space-5);
        text-align: center;
        color: var(--color-text-subtle);
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
      }

      .add-form {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: var(--space-3);
        align-items: end;
        padding: var(--space-4);
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
        margin-bottom: var(--space-4);
      }

      .add-form__input { display: flex; flex-direction: column; }
      .add-form__signed { padding-bottom: 10px; }

      .sot-checkbox {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--font-size-sm);
        color: var(--color-text);
        user-select: none;
        cursor: pointer;
      }
      .sot-checkbox input[type='checkbox'] {
        width: 16px;
        height: 16px;
        accent-color: var(--color-primary);
      }

      .attendee-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
      }

      .row__main {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;
        flex: 1;
      }

      .row__name { font-weight: 600; color: var(--color-text); }

      .row__badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .row__badge--member { background: var(--color-primary-soft); color: var(--color-primary-hover); border-color: #bfdbfe; }

      .row__actions { display: flex; align-items: center; gap: var(--space-3); }

      .row__signed {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .row__btn { height: 32px; padding: 0 10px; font-size: var(--font-size-sm); }
      .row__btn--danger { color: var(--color-danger); border-color: #fecaca; }
      .row__btn--danger:hover:not(:disabled) { background: #fef2f2; }

      @media (max-width: 640px) {
        .add-form { grid-template-columns: 1fr; }
        .row { flex-wrap: wrap; }
      }
    `,
  ],
})
export class TrainingAttendancePanelComponent {
  private readonly service = inject(TrainingAttendanceService);
  protected readonly lookup = inject(TenantMemberLookupService);
  private readonly guard = createGenerationGuard();

  readonly sessionId = input.required<string>();

  protected readonly attendees = signal<TrainingAttendance[]>([]);
  protected readonly loading = signal(false);
  protected readonly adding = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected inputName = '';
  protected inputSigned = true;  // default to "yes they attended and signed"

  protected readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly formatDate = formatDateTime;

  /** Count of attendees who have signed the session. */
  protected readonly signedCount = computed(
    () => this.attendees().filter((a) => a.signed).length,
  );

  /**
   * Members not yet on the attendee list — dedups the roster so you
   * can't pick the same member twice. External attendees still match by
   * name because they share the datalist.
   */
  protected readonly availableMembers = computed(() => {
    const taken = new Set(
      this.attendees()
        .map((a) => a.attendeeId)
        .filter((id): id is string => !!id),
    );
    return this.lookup.members().filter((m) => !taken.has(m.id));
  });

  constructor() {
    void this.lookup.ensureLoaded();
    effect(() => {
      const id = this.sessionId();
      if (!id) return;
      void this.refresh(id);
    });
  }

  protected async addAttendee(): Promise<void> {
    const trimmed = this.inputName.trim();
    if (!trimmed || this.adding()) return;

    // Match against the roster (first + last, case-insensitive). If we
    // find a member, their id goes on the row; otherwise the row is an
    // external attendee.
    const attendeeId = this.resolveMemberId(trimmed);

    // Cheap duplicate guard — prevents adding the same person twice in
    // the same session. Matches on id when available, falls back to
    // name for external attendees.
    const already = this.attendees().some((a) =>
      attendeeId
        ? a.attendeeId === attendeeId
        : a.attendeeName.toLowerCase() === trimmed.toLowerCase(),
    );
    if (already) {
      this.errorMessage.set(`${trimmed} is already on the attendance list.`);
      return;
    }

    this.adding.set(true);
    this.errorMessage.set(null);
    try {
      const row = await this.service.addAttendance({
        sessionId: this.sessionId(),
        attendeeName: trimmed,
        attendeeId,
        signed: this.inputSigned,
      });
      this.attendees.update((list) => [...list, row]);
      this.inputName = '';
      // Keep signed checkbox sticky so rapid-fire entry ("everyone
      // signed") doesn't require re-checking every time.
      this.nameInput()?.nativeElement.focus();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      this.adding.set(false);
    }
  }

  protected async toggleSigned(a: TrainingAttendance, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const checked = checkbox.checked;
    this.errorMessage.set(null);
    try {
      const updated = await this.service.updateAttendance(a.id, {
        signed: checked,
      });
      this.attendees.update((list) =>
        list.map((r) => (r.id === a.id ? updated : r)),
      );
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
      // The binding `[checked]="a.signed"` is one-way; on error the DOM
      // checkbox is still in the user-clicked state. Force it back to
      // the saved value so the UI stays truthful.
      checkbox.checked = a.signed;
    }
  }

  protected async remove(a: TrainingAttendance): Promise<void> {
    const ok = window.confirm(
      `Remove ${a.attendeeName} from this session? You can add them back.`,
    );
    if (!ok) return;
    this.errorMessage.set(null);
    try {
      await this.service.removeAttendance(a.id);
      this.attendees.update((list) => list.filter((r) => r.id !== a.id));
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err));
    }
  }

  /** Case-insensitive full-name match against the tenant roster. */
  private resolveMemberId(name: string): string | null {
    const needle = name.toLowerCase();
    const match = this.lookup
      .members()
      .find(
        (m) =>
          `${m.firstName} ${m.lastName}`.trim().toLowerCase() === needle,
      );
    return match ? match.id : null;
  }

  private async refresh(sessionId: string): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getAttendanceBySession(sessionId);
      if (!this.guard.isCurrent(gen)) return;
      this.attendees.set(rows);
    } catch (err) {
      if (!this.guard.isCurrent(gen)) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (this.guard.isCurrent(gen)) this.loading.set(false);
    }
  }
}
