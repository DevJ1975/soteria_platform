import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { ModuleKey } from '@core/models';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { PlatformModule } from '../../models/platform-admin.model';
import { PlatformAdminModulesService } from '../../services/platform-admin-modules.service';

/**
 * Platform module catalogue list.
 *
 * Phase 1 scope: show every module with its description, `is_core` /
 * `is_available` flags, and a toggle for availability. Core modules
 * can't be toggled off (they're a DB invariant tenants can't opt out
 * of anyway). Creating new modules from here is intentionally not
 * supported — a module needs frontend code to do anything, so the
 * create path lives in migrations + `MODULE_CATALOGUE`.
 */
@Component({
  selector: 'sot-platform-admin-modules-list',
  standalone: true,
  imports: [PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Platform modules"
      subtitle="The module catalogue. Flip availability when a module ships or gets pulled."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading modules…</div>
    } @else {
      <div class="sot-card table-card">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Module</th>
              <th scope="col">Key</th>
              <th scope="col">Core</th>
              <th scope="col">Available</th>
            </tr>
          </thead>
          <tbody>
            @for (m of modules(); track m.key) {
              <tr>
                <td>
                  <div class="module-name">{{ m.name }}</div>
                  <p class="module-desc">{{ m.description }}</p>
                </td>
                <td class="mono">{{ m.key }}</td>
                <td>
                  @if (m.isCore) {
                    <span class="badge badge--core">Core</span>
                  } @else {
                    <span class="badge badge--off">—</span>
                  }
                </td>
                <td>
                  <label class="toggle" [class.toggle--disabled]="m.isCore">
                    <input
                      type="checkbox"
                      [checked]="m.isAvailable"
                      [disabled]="m.isCore || saving() === m.key"
                      (change)="onAvailableToggle(m, $event)"
                    />
                    <span>
                      {{ m.isAvailable ? 'Available' : 'Hidden' }}
                    </span>
                  </label>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="footnote">
        Core modules are always available to every tenant and can't be
        toggled off here. To introduce a new module, add a migration row
        and frontend catalogue entry.
      </p>
    }
  `,
  styles: [
    `
      .table-card { padding: 0; }

      .table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--font-size-base);
      }

      .table thead th {
        text-align: left;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-muted);
        color: var(--color-text-muted);
        font-weight: 600;
        font-size: var(--font-size-xs);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--color-border);
      }

      .table tbody td {
        padding: var(--space-3) var(--space-4);
        border-bottom: 1px solid var(--color-border);
        vertical-align: top;
      }
      .table tbody tr:last-child td { border-bottom: none; }

      .module-name {
        font-weight: 600;
        color: var(--color-text);
      }

      .module-desc {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin-top: 2px;
      }

      .mono {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: var(--font-size-sm);
      }

      .badge {
        display: inline-flex;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        border: 1px solid transparent;
      }
      .badge--core { background: var(--color-primary-soft); color: var(--color-primary-hover); border-color: #bfdbfe; }
      .badge--off  { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }

      .toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        cursor: pointer;
      }
      .toggle--disabled { cursor: not-allowed; opacity: 0.7; }

      .footnote {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin-top: var(--space-4);
      }
    `,
  ],
})
export class PlatformAdminModulesListComponent implements OnInit {
  private readonly service = inject(PlatformAdminModulesService);

  protected readonly modules = signal<PlatformModule[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  /** ModuleKey currently being saved, or null. */
  protected readonly saving = signal<ModuleKey | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.modules.set(await this.service.getModules());
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load modules.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async onAvailableToggle(
    module: PlatformModule,
    event: Event,
  ): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const next = checkbox.checked;

    this.saving.set(module.key);
    this.errorMessage.set(null);
    try {
      await this.service.toggleAvailability(module.key, next);
      this.modules.update((rows) =>
        rows.map((r) =>
          r.key === module.key ? { ...r, isAvailable: next } : r,
        ),
      );
    } catch (err) {
      // Revert the DOM state manually — `[checked]` is one-way, so
      // Angular won't put it back for us on failure.
      checkbox.checked = !next;
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not update module availability.'),
      );
    } finally {
      this.saving.set(null);
    }
  }
}
