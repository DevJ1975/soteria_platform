import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ModuleKey,
  SubscriptionPlan,
  TenantModuleAccess,
} from '@core/models';
import { AuthService } from '@core/services/auth.service';
import {
  MODULE_CATALOGUE,
  ModuleRegistryService,
} from '@core/services/module-registry.service';
import { SubscriptionPlansService } from '@core/services/subscription-plans.service';
import { TenantPlanService } from '@core/services/tenant-plan.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage } from '@shared/utils/errors.util';

/**
 * Admin-only settings page for controlling module access.
 *
 * Shows the tenant's current plan, the full module catalogue with each
 * module's plan-default vs. override vs. effective state, and controls
 * for changing the plan and toggling per-module overrides.
 *
 * Every mutation writes through a service and then calls
 * `ModuleRegistryService.refresh()` so the sidebar + guards pick up the
 * new state without a page reload.
 */
@Component({
  selector: 'sot-tenant-modules',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Modules & Plan"
      subtitle="Control which Soteria features your team can use."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading settings…</div>
    } @else {
      <section class="plan-card sot-card">
        <div class="plan-card__main">
          <h2 class="plan-card__label">Current plan</h2>
          <select
            class="sot-input plan-card__select"
            [ngModel]="currentPlanId()"
            (ngModelChange)="onPlanChange($event)"
            [disabled]="savingPlan()"
          >
            <option [ngValue]="null">— No plan —</option>
            @for (p of plans(); track p.id) {
              <option [ngValue]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
        <p class="plan-card__desc">
          {{ currentPlan()?.description ?? 'Select a plan to see its default modules.' }}
        </p>
        @if (currentPlanIncludedModules().length > 0) {
          <div class="plan-card__modules">
            <span class="plan-card__modules-label">Included:</span>
            @for (name of currentPlanIncludedModules(); track name) {
              <span class="plan-card__chip">{{ name }}</span>
            }
          </div>
        }
        @if (savingPlan()) {
          <p class="plan-card__status">Saving…</p>
        }
      </section>

      <section class="sot-card table-card">
        <header class="table-card__header">
          <h2 class="table-card__title">Modules</h2>
          <p class="table-card__hint">
            Override a module to force it on or off for your organization,
            regardless of plan default. Clear the override to fall back to
            the plan.
          </p>
        </header>

        <table class="table">
          <thead>
            <tr>
              <th scope="col">Module</th>
              <th scope="col">Plan default</th>
              <th scope="col">Override</th>
              <th scope="col">Effective</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.access.moduleKey) {
              <tr>
                <td>
                  <div class="module-name">{{ row.displayName }}</div>
                  <p class="module-desc">{{ row.description }}</p>
                </td>
                <td>
                  @if (row.access.isCore) {
                    <span class="badge badge--core">Always on</span>
                  } @else if (row.access.planDefault) {
                    <span class="badge badge--on">Included</span>
                  } @else {
                    <span class="badge badge--off">Not included</span>
                  }
                </td>
                <td>
                  <select
                    class="sot-input override-select"
                    [ngModel]="overrideValue(row.access)"
                    (ngModelChange)="onOverrideChange(row.access.moduleKey, $event)"
                    [disabled]="row.access.isCore || savingOverride() === row.access.moduleKey"
                  >
                    <option value="none">— Use plan default —</option>
                    <option value="on">Force on</option>
                    <option value="off">Force off</option>
                  </select>
                </td>
                <td>
                  @if (row.access.effective) {
                    <span class="badge badge--on">
                      <span class="badge__dot" aria-hidden="true"></span>
                      Enabled
                    </span>
                  } @else {
                    <span class="badge badge--off">Disabled</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
  styles: [
    `
      .plan-card {
        margin-bottom: var(--space-5);
      }

      .plan-card__main {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-4);
        margin-bottom: var(--space-3);
        flex-wrap: wrap;
      }

      .plan-card__label {
        font-size: var(--font-size-md);
        font-weight: 600;
      }

      .plan-card__select {
        max-width: 260px;
      }

      .plan-card__desc {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .plan-card__status {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        font-style: italic;
        margin-top: var(--space-2);
      }

      .plan-card__modules {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-top: var(--space-3);
      }

      .plan-card__modules-label {
        font-size: var(--font-size-sm);
        color: var(--color-text-subtle);
        font-weight: 500;
      }

      .plan-card__chip {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        border: 1px solid #bfdbfe;
      }

      .table-card { padding: 0; }

      .table-card__header {
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border);
      }

      .table-card__title {
        font-size: var(--font-size-md);
        font-weight: 600;
        margin-bottom: var(--space-1);
      }

      .table-card__hint {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

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

      .override-select { width: 100%; max-width: 200px; height: 36px; }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        border: 1px solid transparent;
        line-height: 1.4;
      }
      .badge__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .badge--on   { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .badge--off  { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
      .badge--core { background: var(--color-primary-soft); color: var(--color-primary-hover); border-color: #bfdbfe; }
    `,
  ],
})
export class TenantModulesComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly plansService = inject(SubscriptionPlansService);
  private readonly tenantPlan = inject(TenantPlanService);
  protected readonly registry = inject(ModuleRegistryService);

  protected readonly loading = signal(true);
  protected readonly savingPlan = signal(false);
  /** ModuleKey currently being saved, or null. Used to disable that row. */
  protected readonly savingOverride = signal<ModuleKey | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly currentPlanId = signal<string | null>(null);

  protected readonly currentPlan = computed<SubscriptionPlan | null>(() => {
    const id = this.currentPlanId();
    if (!id) return null;
    return this.plans().find((p) => p.id === id) ?? null;
  });

  /**
   * Display names of the modules included in the currently-selected
   * plan. Derived from the resolved access map — an entry whose
   * `planDefault = true` is in the plan, regardless of override state.
   * Sorted by the catalogue's display order for consistency with the
   * table below.
   */
  protected readonly currentPlanIncludedModules = computed<readonly string[]>(() => {
    if (!this.currentPlanId()) return [];
    return Array.from(this.registry.access().values())
      .filter((a) => a.planDefault)
      .map((a) => ({
        name: MODULE_CATALOGUE[a.moduleKey]?.name ?? a.moduleKey,
        sort: MODULE_CATALOGUE[a.moduleKey]?.sortOrder ?? 999,
      }))
      .sort((a, b) => a.sort - b.sort)
      .map((x) => x.name);
  });

  /** Rows for the access table. Derived from the registry's resolved access. */
  protected readonly rows = computed(() => {
    const access = this.registry.access();
    return (Array.from(access.values()) as TenantModuleAccess[])
      .map((a) => ({
        access: a,
        displayName: MODULE_CATALOGUE[a.moduleKey]?.name ?? a.moduleKey,
        description: MODULE_CATALOGUE[a.moduleKey]?.description ?? '',
        sortOrder: MODULE_CATALOGUE[a.moduleKey]?.sortOrder ?? 999,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });

  async ngOnInit(): Promise<void> {
    try {
      const [plans, planId] = await Promise.all([
        this.plansService.getPlans(),
        this.tenantPlan.getTenantPlanId(),
      ]);
      this.plans.set(plans);
      this.currentPlanId.set(planId);
      // Make sure the registry has up-to-date resolution for the table.
      await this.registry.refresh();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load settings.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected overrideValue(a: TenantModuleAccess): 'none' | 'on' | 'off' {
    if (a.override === null) return 'none';
    return a.override.isEnabled ? 'on' : 'off';
  }

  protected async onPlanChange(planId: string | null): Promise<void> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return;

    this.savingPlan.set(true);
    this.errorMessage.set(null);
    try {
      await this.tenantPlan.updateTenantPlan(tenantId, planId);
      this.currentPlanId.set(planId);
      // Plan change ripples through effective access; re-resolve so the
      // sidebar and this page's table refresh immediately.
      await this.registry.refresh();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not change plan.'));
    } finally {
      this.savingPlan.set(false);
    }
  }

  protected async onOverrideChange(
    moduleKey: ModuleKey,
    value: 'none' | 'on' | 'off',
  ): Promise<void> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return;

    const isEnabled = value === 'none' ? null : value === 'on';

    this.savingOverride.set(moduleKey);
    this.errorMessage.set(null);
    try {
      await this.tenantPlan.setTenantModuleOverride(tenantId, moduleKey, isEnabled);
      await this.registry.refresh();
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not save module override.'),
      );
    } finally {
      this.savingOverride.set(null);
    }
  }
}
