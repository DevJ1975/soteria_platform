import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TenantMember, TenantService } from '@core/services/tenant.service';
import { createGenerationGuard } from '@shared/utils/async-guards.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { EquipmentCheckStatusChipComponent } from '../equipment-check-status-chip/equipment-check-status-chip.component';
import {
  EQUIPMENT_CHECK_TYPE_LABEL,
  EquipmentCheck,
} from '../../models/equipment-check.model';
import { EquipmentChecksService } from '../../services/equipment-checks.service';

/**
 * Reusable "Check history for this equipment" panel.
 *
 * Drops into the equipment detail page today; would also fit on a future
 * inspection page that references the equipment. Loads its own data and
 * owns its UI state; the host just passes `equipmentId`.
 */
@Component({
  selector: 'sot-equipment-checks-panel',
  standalone: true,
  imports: [RouterLink, EquipmentCheckStatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel sot-card">
      <header class="panel__header">
        <div>
          <h2 class="panel__title">Check history</h2>
          <p class="panel__subtitle">
            Recorded checks against this equipment, newest first.
          </p>
        </div>
        <a
          class="sot-btn sot-btn--primary"
          [routerLink]="['/app/equipment', equipmentId(), 'checks', 'new']"
        >
          Record check
        </a>
      </header>

      @if (errorMessage()) {
        <div class="sot-alert sot-alert--error" role="alert">
          {{ errorMessage() }}
        </div>
      }

      @if (loading()) {
        <div class="sot-state">Loading check history…</div>
      } @else if (checks().length === 0) {
        <div class="panel__empty">
          No checks recorded yet for this equipment.
        </div>
      } @else {
        <ul class="panel__list">
          @for (c of checks(); track c.id) {
            <li class="row">
              <div class="row__main">
                <div class="row__top">
                  <sot-equipment-check-status-chip [status]="c.status" />
                  <span class="row__type">{{ typeLabel(c) }}</span>
                </div>
                @if (c.notes) {
                  <p class="row__notes">{{ c.notes }}</p>
                }
                <p class="row__meta">
                  {{ formatDate(c.performedAt) }} ·
                  {{ performerName(c.performedBy) }}
                </p>
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
        margin-bottom: 2px;
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

      .panel__list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .row {
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
      }

      .row__top {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: 4px;
      }

      .row__type {
        font-weight: 600;
        color: var(--color-text);
      }

      .row__notes {
        color: var(--color-text);
        font-size: var(--font-size-sm);
        margin: 4px 0;
      }

      .row__meta {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
      }
    `,
  ],
})
export class EquipmentChecksPanelComponent {
  private readonly service = inject(EquipmentChecksService);
  private readonly tenants = inject(TenantService);
  private readonly guard = createGenerationGuard();

  readonly equipmentId = input.required<string>();

  protected readonly checks = signal<EquipmentCheck[]>([]);
  protected readonly members = signal<TenantMember[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.equipmentId();
      if (!id) return;
      void this.refresh(id);
    });

    // Fetch the roster once so we can render performer names, not UUIDs.
    void this.tenants.getTenantMembers().then((r) => this.members.set(r));
  }

  protected typeLabel(c: EquipmentCheck): string {
    return EQUIPMENT_CHECK_TYPE_LABEL[c.checkType] ?? c.checkType;
  }

  protected performerName(id: string): string {
    const match = this.members().find((m) => m.id === id);
    if (!match) return 'Unknown';
    return `${match.firstName} ${match.lastName}`.trim() || match.email;
  }

  protected formatDate(iso: string): string {
    // Locale-sensitive date + time; the raw ISO is ugly for users.
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  private async refresh(equipmentId: string): Promise<void> {
    const gen = this.guard.next();
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const rows = await this.service.getChecksByEquipment(equipmentId);
      if (!this.guard.isCurrent(gen)) return;
      this.checks.set(rows);
    } catch (err) {
      if (!this.guard.isCurrent(gen)) return;
      this.errorMessage.set(extractErrorMessage(err));
    } finally {
      if (this.guard.isCurrent(gen)) this.loading.set(false);
    }
  }
}
