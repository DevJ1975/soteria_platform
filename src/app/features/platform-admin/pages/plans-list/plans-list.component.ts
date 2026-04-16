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

interface PlanWithModules {
  plan: SubscriptionPlan;
  moduleKeys: readonly ModuleKey[];
}

interface CatalogueEntry {
  key: ModuleKey;
  name: string;
  sortOrder: number;
}

/**
 * Subscription plan catalogue — cards per plan with inline editable
 * metadata and module membership.
 *
 * Design note: I considered a separate plan-new / plan-edit pair to
 * match the tenant flow, but plan CRUD is a much lower-traffic admin
 * operation and the edit surface is narrow enough that keeping
 * everything on one screen avoids route-thrash. The "New plan" button
 * adds an in-memory draft card that writes on first save.
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
              <span class="plan-card__badge">New plan</span>
            </header>
            <div class="plan-card__body">
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
          <article class="plan-card sot-card" [class.plan-card--inactive]="!row.plan.isActive">
            <header class="plan-card__header">
              <div class="plan-card__title-wrap">
                <h2 class="plan-card__title">{{ row.plan.name }}</h2>
                <span class="plan-card__key">{{ row.plan.key }}</span>
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
                  [ngModel]="editingName(row.plan.id) ?? row.plan.name"
                  (ngModelChange)="onFieldEdit(row.plan.id, 'name', $event)"
                />

                <label class="sot-label" [for]="'desc-' + row.plan.id">Description</label>
                <input
                  [id]="'desc-' + row.plan.id"
                  type="text"
                  class="sot-input"
                  [ngModel]="editingDescription(row.plan.id) ?? row.plan.description"
                  (ngModelChange)="onFieldEdit(row.plan.id, 'description', $event)"
                />

                <label class="sot-label" [for]="'sort-' + row.plan.id">Sort order</label>
                <input
                  [id]="'sort-' + row.plan.id"
                  type="number"
                  class="sot-input plan-card__num"
                  [ngModel]="editingSortOrder(row.plan.id) ?? row.plan.sortOrder"
                  (ngModelChange)="onFieldEdit(row.plan.id, 'sortOrder', $event)"
                />
              </div>

              <div class="modules">
                <h3 class="modules__title">Included modules</h3>
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

            <footer class="plan-card__footer">
              @if (isDirty(row.plan.id)) {
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
              } @else {
                <span class="plan-card__footer-hint">
                  Edit any field to enable Save.
                </span>
              }
            </footer>
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
      }
      .plan-card--inactive { opacity: 0.78; }
      .plan-card--draft {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary-soft);
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
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        border: 1px solid #bfdbfe;
        font-size: var(--font-size-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .plan-card__body {
        padding: var(--space-4) var(--space-5);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-5);
      }
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

      .modules__title {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: var(--space-2);
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
      .plan-card__footer-hint {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
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

  protected readonly plans = signal<PlanWithModules[]>([]);
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
   * Per-plan pending edits. Stored as a signal of a Map keyed by
   * plan id so we can detect dirty state without a form per row.
   */
  private readonly edits = signal<
    Map<string, Partial<{ name: string; description: string; sortOrder: number; modules: Set<ModuleKey> }>>
  >(new Map());

  protected readonly draft = signal<{
    key: string;
    name: string;
    description: string;
    sortOrder: number;
  } | null>(null);
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

  protected editingName(planId: string): string | undefined {
    return this.edits().get(planId)?.name;
  }
  protected editingDescription(planId: string): string | undefined {
    return this.edits().get(planId)?.description;
  }
  protected editingSortOrder(planId: string): number | undefined {
    return this.edits().get(planId)?.sortOrder;
  }

  protected isDirty(planId: string): boolean {
    const e = this.edits().get(planId);
    return !!e && Object.keys(e).length > 0;
  }

  protected isModuleIncluded(row: PlanWithModules, key: ModuleKey): boolean {
    const pending = this.edits().get(row.plan.id)?.modules;
    return pending ? pending.has(key) : row.moduleKeys.includes(key);
  }

  protected onFieldEdit(
    planId: string,
    field: 'name' | 'description' | 'sortOrder',
    value: string | number,
  ): void {
    this.edits.update((map) => {
      const next = new Map(map);
      const current = { ...(next.get(planId) ?? {}) };
      (current as Record<string, unknown>)[field] = value;
      next.set(planId, current);
      return next;
    });
  }

  protected onModuleToggle(
    row: PlanWithModules,
    key: ModuleKey,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.edits.update((map) => {
      const next = new Map(map);
      const current = { ...(next.get(row.plan.id) ?? {}) };
      const existing =
        current.modules ?? new Set<ModuleKey>(row.moduleKeys);
      const updated = new Set(existing);
      if (checked) updated.add(key);
      else updated.delete(key);
      current.modules = updated;
      next.set(row.plan.id, current);
      return next;
    });
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
    if (!pending) return;

    this.saving.set(plan.id);
    this.errorMessage.set(null);
    try {
      const metaPayload: Record<string, unknown> = {};
      if (pending.name !== undefined) metaPayload['name'] = pending.name.trim();
      if (pending.description !== undefined) {
        metaPayload['description'] = pending.description.trim();
      }
      if (pending.sortOrder !== undefined) {
        metaPayload['sortOrder'] = Number(pending.sortOrder);
      }
      if (Object.keys(metaPayload).length > 0) {
        await this.service.updatePlan(plan.id, metaPayload);
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

  protected updateDraft<K extends 'key' | 'name' | 'description' | 'sortOrder'>(
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
