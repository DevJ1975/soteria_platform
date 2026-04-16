import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { EquipmentChecksPanelComponent } from '../../components/equipment-checks-panel/equipment-checks-panel.component';
import { EquipmentStatusChipComponent } from '../../components/equipment-status-chip/equipment-status-chip.component';
import {
  EQUIPMENT_TYPE_LABEL,
  Equipment,
} from '../../models/equipment.model';
import { EquipmentService } from '../../services/equipment.service';

/**
 * Read-mostly equipment page. Primary actions:
 *   - Record check (also surfaced in the panel header).
 *   - Edit equipment (small button top-right).
 *
 * The big summary card up top is intentionally plain — operators on
 * mobile spend most of their time on the check panel below, not
 * re-reading equipment metadata.
 */
@Component({
  selector: 'sot-equipment-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    EquipmentStatusChipComponent,
    EquipmentChecksPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="equipment()?.name ?? 'Equipment'"
      [subtitle]="equipment() ? typeLabel() : ''"
    >
      @if (equipment(); as eq) {
        <a
          class="sot-btn sot-btn--ghost"
          [routerLink]="[eq.id, 'edit']"
        >Edit</a>
        <a
          class="sot-btn sot-btn--primary"
          [routerLink]="['checks', 'new']"
        >Record check</a>
      }
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading equipment…</div>
    } @else if (!equipment()) {
      <div class="sot-state">Equipment not found.</div>
    } @else if (equipment(); as eq) {
      <section class="summary sot-card">
        <div class="summary__row">
          <span class="summary__label">Status</span>
          <sot-equipment-status-chip [status]="eq.status" />
        </div>
        <div class="summary__row">
          <span class="summary__label">Asset tag</span>
          <span class="summary__mono">{{ eq.assetTag }}</span>
        </div>
        @if (eq.manufacturer) {
          <div class="summary__row">
            <span class="summary__label">Manufacturer</span>
            <span>{{ eq.manufacturer }}</span>
          </div>
        }
        @if (eq.model) {
          <div class="summary__row">
            <span class="summary__label">Model</span>
            <span>{{ eq.model }}</span>
          </div>
        }
        @if (eq.serialNumber) {
          <div class="summary__row">
            <span class="summary__label">Serial</span>
            <span class="summary__mono">{{ eq.serialNumber }}</span>
          </div>
        }
      </section>

      <sot-equipment-checks-panel [equipmentId]="eq.id" />
    }
  `,
  styles: [
    `
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-3) var(--space-5);
      }

      .summary__row {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .summary__label {
        font-size: 11px;
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      .summary__mono {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: var(--font-size-sm);
      }
    `,
  ],
})
export class EquipmentDetailComponent implements OnInit {
  private readonly service = inject(EquipmentService);

  /** Bound from `:id` route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly equipment = signal<Equipment | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly typeLabel = computed(() => {
    const eq = this.equipment();
    return eq ? EQUIPMENT_TYPE_LABEL[eq.equipmentType] ?? eq.equipmentType : '';
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.equipment.set(await this.service.getEquipmentById(this.id()));
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load equipment.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
