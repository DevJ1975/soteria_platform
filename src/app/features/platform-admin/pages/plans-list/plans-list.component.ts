import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModuleKey, SubscriptionPlan } from '@core/models';
import { MODULE_CATALOGUE } from '@core/services/module-registry.service';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage, isUniqueViolation } from '@shared/utils/errors.util';

import { PlatformAdminPlansService } from '../../services/platform-admin-plans.service';

interface PlanRow {
  plan: SubscriptionPlan;
  moduleKeys: readonly ModuleKey[];
}

interface CatalogueEntry {
  key: ModuleKey;
  name: string;
  sortOrder: number;
}

/**
 * Per-plan pending edits. `undefined` slots mean "not dirty, use the
 * stored value". `modules` being present means the operator touched the
 * checkboxes at least once — we snapshot the full desired set rather
 * than a diff so save-time logic stays obvious.
 */
interface PlanEdits {
  name?: string;
  description?: string;
  sortOrder?: number;
  /** Stripe Price id — empty string means "clear mapping." */
  stripePriceId?: string;
  modules?: ReadonlySet<ModuleKey>;
}

interface DraftPlan {
  key: string;
  name: string;
  description: string;
  sortOrder: number;
}

/**
 * Subscription plan catalogue — cards per plan with inline editable
 * metadata and module membership.
 *
 * Why inline (not separate pages)
 * -------------------------------
 * Plan mutations are low-volume and the surface is small (4 metadata
 * fields + checkbox membership). Splitting create/edit into dedicated
 * routes would add navigation friction without buying anything.
 *
 * Dirty-state UX
 * --------------
 * A card turns into "edit mode" the moment any field or checkbox
 * changes: accent border, badge in the header, and a sticky action
 * footer that doesn't scroll away. Without the sticky footer, editing
 * a plan's module list (7 checkboxes) easily scrolls the Save button
 * off-screen on smaller viewports.
 */
@Component({
  selector: 'sot-platform-admin-plans-list',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Subscription plans"
      subtitle="Bundle modules into plans that tenants can subscribe to."
    >
      <button
        type="button"
        class="sot-btn sot-btn--primary"
        (click)="startDraft()"
        [disabled]="!!draft()"
      >
        New plan
      </button>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading plans…</div>
    } @else {
      <div class="plans">
        @if (draft(); as d) {
          <article class="plan-card plan-card--draft sot-card">
            <header class="plan-card__header">
              <span class="plan-card__badge plan-card__badge--draft">New plan</span>
            </header>
            <div class="plan-card__body plan-card__body--single">
              <div class="plan-card__grid">
                <label class="sot-label" for="draft-key">
                  Key <span class="required" aria-hidden="true">*</span>
                </label>
                <input
                  id="draft-key"
                  type="text"
                  class="sot-input"
                  [ngModel]="d.key"
                  (ngModelChange)="updateDraft('key', $event)"
                  placeholder="e.g. enterprise"
                />

                <label class="sot-label" for="draft-name">
                  Name <span class="required" aria-hidden="true">*</span>
                </label>
                <input
                  id="draft-name"
                  type="text"
                  class="sot-input"
                  [ngModel]="d.name"
                  (ngModelChange)="updateDraft('name', $event)"
                  placeholder="e.g. Enterprise"
                />

                <label class="sot-label" for="draft-desc">Description</label>
                <input
                  id="draft-desc"
                  type="text"
                  class="sot-input"
                  [ngModel]="d.description"
                  (ngModelChange)="updateDraft('description', $event)"
                />

                <label class="sot-label" for="draft-sort">Sort order</label>
                <input
                  id="draft-sort"
                  type="number"
                  class="sot-input plan-card__num"
                  [ngModel]="d.sortOrder"
                  (ngModelChange)="updateDraft('sortOrder', $event)"
                />
              </div>
              <p class="plan-card__hint">
                Module membership can be configured once the plan is created.
              </p>
            </div>
            <footer class="plan-card__footer">
              <button
                type="button"
                class="sot-btn sot-btn--ghost"
                (click)="cancelDraft()"
              >Cancel</button>
              <button
                type="button"
                class="sot-btn sot-btn--primary"
                (click)="saveDraft()"
                [disabled]="!canSaveDraft() || savingDraft()"
              >
                {{ savingDraft() ? 'Creating…' : 'Create plan' }}
              </button>
            </footer>
          </article>
        }

        @if (plans().length === 0 && !draft()) {
          <sot-empty-state
            title="No plans yet"
            body="Add a plan to start bundling modules for tenants."
          >
            <button
              type="button"
              class="sot-btn sot-btn--primary"
              (click)="startDraft()"
            >New plan</button>
          </sot-empty-state>
        }

        @for (row of plans(); track row.plan.id) {
          <article
            class="plan-card sot-card"
            [class.plan-card--inactive]="!row.plan.isActive"
            [class.plan-card--dirty]="isDirty(row.plan.id)"
          >
            <header class="plan-card__header">
              <div class="plan-card__title-wrap">
                <h2 class="plan-card__title">{{ row.plan.name }}</h2>
                <span class="plan-card__key">{{ row.plan.key }}</span>
                @if (isDirty(row.plan.id)) {
                  <span class="plan-card__badge plan-card__badge--dirty">
                    Unsaved changes
                  </span>
                }
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  [checked]="row.plan.isActive"
                  (change)="onActiveToggle(row.plan, $event)"
                />
                <span>{{ row.plan.isActive ? 'Active' : 'Inactive' }}</span>
              </label>
            </header>

            <div class="plan-card__body">
              <div class="plan-card__grid">
                <label class="sot-label" [for]="'name-' + row.plan.id">Name</label>
                <input
                  [id]="'name-' + row.plan.id"
                  type="text"
                  class="sot-input"
                  [ngModel]="editValue(row.plan.id, 'name') ?? row.plan.name"
                  (ngModelChange)="onFieldEdit(row.plan.id, 'name', $event)"
                />

                <label class="sot-label" [for]="'desc-' + row.plan.id">Description</label>
                <input
                  [id]="'desc-' + row.plan.id"
                  type="text"
                  class="sot-input"
                  [ngModel]="editValue(row.plan.id, 'description') ?? row.plan.description"
                  (ngModelChange)="onFieldEdit(row.plan.id, 'description', $event)"
                />

                <label class="sot-label" [for]="'sort-' + row.plan.id">Sort order</label>
                <input
                  [id]="'sort-' + row.plan.id"
                  type="number"
                  class="sot-input plan-card__num"
                  [ngModel]="editValue(row.plan.id, 'sortOrder') ?? row.plan.sortOrder"
                  (ngModelChange)="onFieldEdit(row.plan.id, 'sortOrder', $event)"
                />

                <label class="sot-label" [for]="'stripe-' + row.plan.id">
                  Stripe price id
                </label>
                <div class="plan-card__stripe-field">
                  <input
                    [id]="'stripe-' + row.plan.id"
                    type="text"
                    class="sot-input"
                    placeholder="price_..."
                    [ngModel]="editValue(row.plan.id, 'stripePriceId') ?? row.plan.stripePriceId ?? ''"
                    (ngModelChange)="onStripePriceEdit(row.plan.id, $event)"
                  />
                  @if (row.plan.stripePriceId) {
                    <span class="plan-card__stripe-status plan-card__stripe-status--ok">
                      Stripe-ready
                    </span>
                  } @else {
                    <span class="plan-card__stripe-status plan-card__stripe-status--missing">
                      Unmapped — checkout disabled
                    </span>
                  }
                </div>
              </div>

              <div class="modules">
                <h3 class="modules__title">
                  Included modules
                  <span class="modules__count">
                    {{ includedCount(row) }} of {{ catalogue().length }}
                  </span>
                </h3>
                <ul class="modules__list">
                  @for (m of catalogue(); track m.key) {
                    <li class="modules__item">
                      <label>
                        <input
                          type="checkbox"
                          [checked]="isModuleIncluded(row, m.key)"
                          (change)="onModuleToggle(row, m.key, $event)"
                        />
                        <span>{{ m.name }}</span>
                      </label>
                    </li>
                  }
                </ul>
              </div>
            </div>

            @if (isDirty(row.plan.id)) {
              <footer class="plan-card__footer plan-card__footer--sticky">
                <span class="plan-card__footer-hint">
                  You have unsaved changes.
                </span>
                <div class="plan-card__footer-actions">
                  <button
                    type="button"
                    class="sot-btn sot-btn--ghost"
                    (click)="cancelEdits(row.plan.id)"
                    [disabled]="saving() === row.plan.id"
                  >Cancel</button>
                  <button
                    type="button"
                    class="sot-btn sot-btn--primary"
                    (click)="saveEdits(row.plan)"
                    [disabled]="saving() === row.plan.id"
                  >
                    {{ saving() === row.plan.id ? 'Saving…' : 'Save changes' }}
                  </button>
                </div>
              </footer>
            }
          </article>
        }
      </div>
    }
  `,
  styles: [
    `
      .plans {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .plan-card {
        padding: 0;
        overflow: hidden;
        transition: border-color 120ms ease, box-shadow 120ms ease;
      }
      .plan-card--inactive { opacity: 0.78; }
      .plan-card--draft {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary-soft);
      }
      .plan-card--dirty {
        border-color: #f59e0b;
        box-shadow: 0 0 0 1px #fef3c7;
      }

      .plan-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface-muted);
      }

      .plan-card__title-wrap {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
        flex-wrap: wrap;
      }

      .plan-card__title {
        font-size: var(--font-size-md);
        font-weight: 600;
      }

      .plan-card__key {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: var(--font-size-xs);
        color: var(--color-text-subtle);
        background: var(--color-surface);
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--color-border);
      }

      .plan-card__badge {
        display: inline-flex;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: var(--font-size-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border: 1px solid transparent;
      }
      .plan-card__badge--draft {
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        border-color: #bfdbfe;
      }
      .plan-card__badge--dirty {
        background: #fef3c7;
        color: #92400e;
        border-color: #fcd34d;
      }

      .plan-card__body {
        padding: var(--space-4) var(--space-5);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-5);
      }
      .plan-card__body--single { grid-template-columns: 1fr; }
      @media (max-width: 768px) {
        .plan-card__body { grid-template-columns: 1fr; }
      }

      .plan-card__grid {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: var(--space-3) var(--space-4);
        align-items: center;
      }

      .plan-card__num { max-width: 120px; }

      .plan-card__stripe-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .plan-card__stripe-status {
        font-size: var(--font-size-xs);
        font-weight: 500;
      }
      .plan-card__stripe-status--ok      { color: #047857; }
      .plan-card__stripe-status--missing { color: #92400e; }

      .plan-card__hint {
        margin-top: var(--space-3);
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
      }

      .modules__title {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: var(--space-2);
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }
      .modules__count {
        font-size: var(--font-size-xs);
        color: var(--color-text-subtle);
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
      }
      .modules__list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
      }
      .modules__item label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: var(--font-size-sm);
        cursor: pointer;
      }

      .plan-card__footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-5);
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
      }
      .plan-card__footer--sticky {
        position: sticky;
        bottom: 0;
        background: var(--color-surface);
        z-index: 1;
        box-shadow: 0 -1px 2px rgba(15, 23, 42, 0.06);
        justify-content: space-between;
      }
      .plan-card__footer-hint {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
      }
      .plan-card__footer-actions {
        display: flex;
        gap: var(--space-2);
      }

      .toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        cursor: pointer;
      }

      .required { color: var(--color-danger); margin-left: 2px; }
    `,
  ],
})
export class PlatformAdminPlansListComponent implements OnInit {
  private readonly service = inject(PlatformAdminPlansService);

  protected readonly plans = signal<PlanRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  /** id of the plan whose save is in flight, or null. */
  protected readonly saving = signal<string | null>(null);

  protected readonly catalogue = computed<readonly CatalogueEntry[]>(() =>
    (Object.keys(MODULE_CATALOGUE) as ModuleKey[])
      .map((key) => ({
        key,
        name: MODULE_CATALOGUE[key].name,
        sortOrder: MODULE_CATALOGUE[key].sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  /**
   * Per-plan pending edits. Stored as a `Map` keyed by plan id so we
   * can detect dirty state without a reactive form per row.
   */
  private readonly edits = signal<ReadonlyMap<string, PlanEdits>>(new Map());

  protected readonly draft = signal<DraftPlan | null>(null);
  protected readonly savingDraft = signal(false);

  protected readonly canSaveDraft = computed(() => {
    const d = this.draft();
    return !!d && d.key.trim().length > 0 && d.name.trim().length > 0;
  });

  async ngOnInit(): Promise<void> {
    await this.loadPlans();
  }

  private async loadPlans(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const plans = await this.service.getPlans();
      const rows = await Promise.all(
        plans.map(async (plan) => ({
          plan,
          moduleKeys: await this.service.getPlanModuleKeys(plan.id),
        })),
      );
      this.plans.set(rows);
      this.edits.set(new Map());
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load plans.'));
    } finally {
      this.loading.set(false);
    }
  }

  // -- Edit helpers ------------------------------------------------

  /** Typed accessor for a single edit field. */
  protected editValue<K extends 'name' | 'description' | 'sortOrder' | 'stripePriceId'>(
    planId: string,
    field: K,
  ): PlanEdits[K] {
    return this.edits().get(planId)?.[field];
  }

  protected isDirty(planId: string): boolean {
    const e = this.edits().get(planId);
    if (!e) return false;
    return (
      e.name !== undefined ||
      e.description !== undefined ||
      e.sortOrder !== undefined ||
      e.stripePriceId !== undefined ||
      e.modules !== undefined
    );
  }

  protected isModuleIncluded(row: PlanRow, key: ModuleKey): boolean {
    const pending = this.edits().get(row.plan.id)?.modules;
    return pending ? pending.has(key) : row.moduleKeys.includes(key);
  }

  /** Number of modules currently (pending + saved) included on the plan. */
  protected includedCount(row: PlanRow): number {
    const pending = this.edits().get(row.plan.id)?.modules;
    return pending ? pending.size : row.moduleKeys.length;
  }

  private patchEdits(planId: string, patch: PlanEdits): void {
    this.edits.update((map) => {
      const next = new Map(map);
      next.set(planId, { ...(next.get(planId) ?? {}), ...patch });
      return next;
    });
  }

  protected onFieldEdit(
    planId: string,
    field: 'name' | 'description' | 'sortOrder',
    value: string | number,
  ): void {
    const coerced = field === 'sortOrder' ? Number(value) : value;
    this.patchEdits(planId, { [field]: coerced });
  }

  /**
   * Separate method from `onFieldEdit` because the Stripe price id
   * needs whitespace-trim handling and explicit empty-string handling
   * (which `onFieldEdit`'s signature doesn't express naturally).
   */
  protected onStripePriceEdit(planId: string, value: string): void {
    this.patchEdits(planId, { stripePriceId: value });
  }

  protected onModuleToggle(
    row: PlanRow,
    key: ModuleKey,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    const existing =
      this.edits().get(row.plan.id)?.modules ?? new Set(row.moduleKeys);
    const updated = new Set(existing);
    if (checked) updated.add(key);
    else updated.delete(key);
    this.patchEdits(row.plan.id, { modules: updated });
  }

  protected cancelEdits(planId: string): void {
    this.edits.update((map) => {
      const next = new Map(map);
      next.delete(planId);
      return next;
    });
  }

  protected async saveEdits(plan: SubscriptionPlan): Promise<void> {
    const pending = this.edits().get(plan.id);
    if (!pending || !this.isDirty(plan.id)) return;

    this.saving.set(plan.id);
    this.errorMessage.set(null);
    try {
      // Metadata patch: only the fields the operator touched.
      const hasMetaChange =
        pending.name !== undefined ||
        pending.description !== undefined ||
        pending.sortOrder !== undefined ||
        pending.stripePriceId !== undefined;
      if (hasMetaChange) {
        await this.service.updatePlan(plan.id, {
          ...(pending.name !== undefined && { name: pending.name.trim() }),
          ...(pending.description !== undefined && {
            description: pending.description.trim(),
          }),
          ...(pending.sortOrder !== undefined && {
            sortOrder: Number(pending.sortOrder),
          }),
          // Service coerces empty-string → null so cleared mappings
          // drop out of the partial unique index.
          ...(pending.stripePriceId !== undefined && {
            stripePriceId: pending.stripePriceId,
          }),
        });
      }
      if (pending.modules) {
        await this.service.setPlanModules(plan.id, [...pending.modules]);
      }
      await this.loadPlans();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not save plan.'));
    } finally {
      this.saving.set(null);
    }
  }

  // -- is_active toggle --------------------------------------------

  protected async onActiveToggle(plan: SubscriptionPlan, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const next = checkbox.checked;
    // Optimistic UI; revert on failure.
    this.plans.update((rows) =>
      rows.map((r) =>
        r.plan.id === plan.id
          ? { ...r, plan: { ...r.plan, isActive: next } }
          : r,
      ),
    );
    try {
      await this.service.updatePlan(plan.id, { isActive: next });
    } catch (err) {
      checkbox.checked = !next;
      this.plans.update((rows) =>
        rows.map((r) =>
          r.plan.id === plan.id
            ? { ...r, plan: { ...r.plan, isActive: !next } }
            : r,
        ),
      );
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not change plan active state.'),
      );
    }
  }

  // -- Draft plan (create flow) ------------------------------------

  protected startDraft(): void {
    const nextSort =
      this.plans().reduce((m, r) => Math.max(m, r.plan.sortOrder), 0) + 10;
    this.draft.set({
      key: '',
      name: '',
      description: '',
      sortOrder: nextSort,
    });
  }

  protected cancelDraft(): void {
    this.draft.set(null);
  }

  protected updateDraft<K extends keyof DraftPlan>(
    field: K,
    value: string | number,
  ): void {
    this.draft.update((d) =>
      d ? { ...d, [field]: field === 'sortOrder' ? Number(value) : value } : d,
    );
  }

  protected async saveDraft(): Promise<void> {
    const d = this.draft();
    if (!d || !this.canSaveDraft()) return;

    this.savingDraft.set(true);
    this.errorMessage.set(null);
    try {
      await this.service.createPlan({
        key: d.key.trim(),
        name: d.name.trim(),
        description: d.description.trim(),
        sortOrder: d.sortOrder,
        isActive: true,
      });
      this.draft.set(null);
      await this.loadPlans();
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.errorMessage.set('A plan with this key already exists.');
      } else {
        this.errorMessage.set(
          extractErrorMessage(err, 'Could not create plan.'),
        );
      }
    } finally {
      this.savingDraft.set(false);
    }
  }
}
