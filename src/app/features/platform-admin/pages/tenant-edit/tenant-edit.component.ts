import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  Tenant,
  TenantStatus,
} from '@core/models';
import {
  getRemainingTrialDays,
  isTrialExpired,
} from '@core/utils/subscription-access.util';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { SubscriptionStatusBadgeComponent } from '@shared/components/subscription-status-badge/subscription-status-badge.component';
import { formatActivityDate } from '@shared/utils/date.util';
import { extractErrorMessage, isUniqueViolation } from '@shared/utils/errors.util';

import { TenantStatusChipComponent } from '../../components/tenant-status-chip/tenant-status-chip.component';
import { PlatformAdminPlansService } from '../../services/platform-admin-plans.service';
import { PlatformAdminSubscriptionsService } from '../../services/platform-admin-subscriptions.service';
import { PlatformAdminTenantsService } from '../../services/platform-admin-tenants.service';

const NAME_MAX = 200;
const SLUG_MAX = 100;

const ALL_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'inactive',
];

/**
 * Edit an existing tenant. Two distinct sections:
 *
 *   1. Tenant details — name / slug / status (non-billing).
 *   2. Subscription — plan, lifecycle state, trial dates, cancel /
 *      start-trial / status-override actions. Mutations here go
 *      through `PlatformAdminSubscriptionsService` so the billing
 *      event log stays intact.
 *
 * The plan dropdown deliberately lives in the Subscription section
 * (not the main form) because `subscriptions.plan_id` is the source of
 * truth. A direct write to `tenants.plan_id` would be overwritten by
 * the sync trigger on the next subscription update.
 */
@Component({
  selector: 'sot-platform-admin-tenant-edit',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    TenantStatusChipComponent,
    SubscriptionStatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="tenant()?.name ?? 'Edit tenant'"
      subtitle="Update tenant details and manage the subscription."
    >
      @if (tenant(); as t) {
        <sot-tenant-status-chip [status]="t.status" />
      }
      <a class="sot-btn sot-btn--ghost" routerLink="/platform-admin/tenants">
        ← Back to tenants
      </a>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <div class="sot-state">Loading tenant…</div>
    } @else if (!tenant()) {
      <div class="sot-alert sot-alert--error" role="alert">Tenant not found.</div>
    } @else {
      <form class="form sot-card" [formGroup]="form" (ngSubmit)="saveDetails()" novalidate>
        <header class="form__header">
          <h2 class="form__title">Tenant details</h2>
          <p class="form__subtitle">Identity and operational status.</p>
        </header>

        <div class="form__grid">
          <div class="form__field form__field--span-2">
            <label class="sot-label" for="name">
              Name <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input id="name" type="text" class="sot-input" formControlName="name" [attr.maxlength]="nameMax" />
            @if (showError('name')) {
              <p class="form__error" role="alert">A tenant name is required.</p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="slug">
              Slug <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input id="slug" type="text" class="sot-input" formControlName="slug" [attr.maxlength]="slugMax" />
            <p class="form__hint">Lowercase letters, numbers, and hyphens.</p>
            @if (showError('slug')) {
              <p class="form__error" role="alert">
                Slug is required. Lowercase letters, numbers, and hyphens only.
              </p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="status">Status</label>
            <select id="status" class="sot-input" formControlName="status">
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <dl class="form__meta">
          <div>
            <dt>Created</dt>
            <dd>{{ formatDate(tenant()!.createdAt) }}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{{ formatDate(tenant()!.updatedAt) }}</dd>
          </div>
          <div>
            <dt>Tenant&nbsp;ID</dt>
            <dd class="form__meta-mono">{{ tenant()!.id }}</dd>
          </div>
        </dl>

        <div class="form__actions">
          <a class="sot-btn sot-btn--ghost" routerLink="/platform-admin/tenants">Cancel</a>
          <button type="submit" class="sot-btn sot-btn--primary"
            [disabled]="form.invalid || savingDetails()">
            {{ savingDetails() ? 'Saving…' : 'Save details' }}
          </button>
        </div>
      </form>

      <!-- Subscription section -->
      <section class="sub sot-card">
        <header class="sub__header">
          <div>
            <h2 class="sub__title">Subscription</h2>
            <p class="sub__subtitle">
              Billing lifecycle, plan, and trial for this tenant.
            </p>
          </div>
          @if (subscription(); as s) {
            <sot-subscription-status-badge [status]="s.status" />
          }
        </header>

        @if (!subscription()) {
          <div class="sub__missing">
            <p>No subscription record found for this tenant.</p>
            <button
              type="button"
              class="sot-btn sot-btn--primary"
              (click)="createMissingSubscription()"
              [disabled]="workingOnSub()"
            >
              Provision trial subscription
            </button>
          </div>
        } @else {
          <dl class="sub__details">
            <div>
              <dt>Plan</dt>
              <dd>
                <select
                  class="sot-input sub__plan-select"
                  [ngModel]="subscription()!.planId"
                  (ngModelChange)="onPlanChange($event)"
                  [disabled]="workingOnSub()"
                >
                  <option [ngValue]="null">— No plan —</option>
                  @for (p of plans(); track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
              </dd>
            </div>

            <div>
              <dt>Status override</dt>
              <dd>
                <select
                  class="sot-input sub__status-select"
                  [ngModel]="subscription()!.status"
                  (ngModelChange)="onStatusOverride($event)"
                  [disabled]="workingOnSub()"
                >
                  @for (s of allStatuses; track s) {
                    <option [value]="s">{{ statusLabel(s) }}</option>
                  }
                </select>
                <p class="sub__hint">
                  Logged as <code>status_changed</code> with admin_override=true.
                </p>
              </dd>
            </div>

            @if (subscription()!.status === 'trialing') {
              <div>
                <dt>Trial ends</dt>
                <dd>
                  {{ formatDate(subscription()!.trialEndDate) }}
                  @if (remainingTrialDays() !== null) {
                    <span class="sub__sub">
                      ({{ trialLabel() }})
                    </span>
                  }
                </dd>
              </div>
            } @else if (subscription()!.trialEndDate) {
              <div>
                <dt>Trial ended</dt>
                <dd>{{ formatDate(subscription()!.trialEndDate) }}</dd>
              </div>
            }

            @if (subscription()!.currentPeriodEnd) {
              <div>
                <dt>Current period ends</dt>
                <dd>{{ formatDate(subscription()!.currentPeriodEnd) }}</dd>
              </div>
            }

            @if (subscription()!.cancelAt) {
              <div>
                <dt>Cancellation effective</dt>
                <dd>{{ formatDate(subscription()!.cancelAt) }}</dd>
              </div>
            }

            <div>
              <dt>Subscription&nbsp;ID</dt>
              <dd class="sub__mono">{{ subscription()!.id }}</dd>
            </div>
          </dl>

          <div class="sub__actions">
            <button
              type="button"
              class="sot-btn sot-btn--ghost"
              (click)="startTrial()"
              [disabled]="workingOnSub()"
              title="Set status to trialing and reset the 14-day clock."
            >Start / restart trial</button>

            @if (subscription()!.status !== 'canceled' && subscription()!.status !== 'inactive') {
              <button
                type="button"
                class="sot-btn sot-btn--ghost sub__danger"
                (click)="cancel(false)"
                [disabled]="workingOnSub()"
              >Cancel at period end</button>

              <button
                type="button"
                class="sot-btn sot-btn--danger"
                (click)="cancel(true)"
                [disabled]="workingOnSub()"
              >Cancel immediately</button>
            }
          </div>
        }
      </section>
    }
  `,
  styles: [
    `
      .form, .sub {
        padding: var(--space-5);
      }
      .form { margin-bottom: var(--space-5); }

      .form__header, .sub__header {
        margin-bottom: var(--space-4);
        padding-bottom: var(--space-3);
        border-bottom: 1px solid var(--color-border);
      }
      .sub__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-4);
      }
      .form__title, .sub__title {
        font-size: var(--font-size-md);
        font-weight: 600;
      }
      .form__subtitle, .sub__subtitle {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
        margin-top: 2px;
      }

      .form__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
      }
      .form__field { display: flex; flex-direction: column; }
      .form__field--span-2 { grid-column: 1 / -1; }
      .form__required { color: var(--color-danger); margin-left: 2px; }
      .form__error { color: var(--color-danger); font-size: var(--font-size-sm); margin-top: 4px; }
      .form__hint { color: var(--color-text-subtle); font-size: var(--font-size-sm); margin-top: 4px; }

      .form__meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-4);
        margin-top: var(--space-5);
        padding: var(--space-4);
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
      }
      .form__meta dt {
        font-size: var(--font-size-xs);
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
        margin-bottom: 2px;
      }
      .form__meta dd {
        font-size: var(--font-size-sm);
        color: var(--color-text);
        margin: 0;
      }
      .form__meta-mono, .sub__mono {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px;
      }

      .form__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-top: var(--space-5);
        padding-top: var(--space-4);
        border-top: 1px solid var(--color-border);
      }

      .sub__details {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-5);
      }
      .sub__details dt {
        font-size: var(--font-size-xs);
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .sub__details dd {
        font-size: var(--font-size-sm);
        color: var(--color-text);
        margin: 0;
      }
      .sub__hint {
        color: var(--color-text-subtle);
        font-size: var(--font-size-xs);
        margin-top: 4px;
      }
      .sub__hint code {
        background: var(--color-surface-muted);
        padding: 1px 4px;
        border-radius: 4px;
      }
      .sub__plan-select, .sub__status-select { max-width: 260px; }

      .sub__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        padding-top: var(--space-4);
        border-top: 1px solid var(--color-border);
      }

      .sub__missing {
        padding: var(--space-4);
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        align-items: flex-start;
      }

      .sub__sub {
        color: var(--color-text-subtle);
        margin-left: 4px;
      }

      @media (max-width: 640px) {
        .form__grid { grid-template-columns: 1fr; }
        .form__field--span-2 { grid-column: auto; }
      }
    `,
  ],
})
export class PlatformAdminTenantEditComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tenantsService = inject(PlatformAdminTenantsService);
  private readonly plansService = inject(PlatformAdminPlansService);
  private readonly subsService = inject(PlatformAdminSubscriptionsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly nameMax = NAME_MAX;
  protected readonly slugMax = SLUG_MAX;
  protected readonly allStatuses = ALL_STATUSES;
  protected readonly formatDate = (value: string | null) =>
    value ? formatActivityDate(value) : '—';

  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly tenant = signal<Tenant | null>(null);
  protected readonly subscription = signal<Subscription | null>(null);
  protected readonly loading = signal(true);
  protected readonly savingDetails = signal(false);
  protected readonly workingOnSub = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly remainingTrialDays = computed(() =>
    getRemainingTrialDays(this.subscription()),
  );

  protected readonly form = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(NAME_MAX),
    ]),
    slug: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      Validators.maxLength(SLUG_MAX),
    ]),
    status: this.fb.nonNullable.control<TenantStatus>('active'),
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage.set('No tenant id in the URL.');
      this.loading.set(false);
      return;
    }
    try {
      const [plans, tenant, subscription] = await Promise.all([
        this.plansService.getPlans(),
        this.tenantsService.getTenantById(id),
        this.subsService.getSubscription(id),
      ]);
      this.plans.set(plans);
      this.tenant.set(tenant);
      this.subscription.set(subscription);
      if (tenant) {
        this.form.setValue({
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
        });
      }
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load tenant.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[name];
    return ctrl.invalid && (ctrl.touched || ctrl.dirty);
  }

  protected statusLabel(s: SubscriptionStatus): string {
    return s.replace('_', ' ');
  }

  protected trialLabel(): string {
    const days = this.remainingTrialDays();
    if (days === null) return '';
    if (isTrialExpired(this.subscription())) return 'expired';
    return `${days} ${days === 1 ? 'day' : 'days'} remaining`;
  }

  protected async saveDetails(): Promise<void> {
    const current = this.tenant();
    if (!current) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.savingDetails.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    try {
      const updated = await this.tenantsService.updateTenant(current.id, {
        name: value.name.trim(),
        slug: value.slug.trim(),
        status: value.status,
      });
      this.tenant.set(updated);
      await this.router.navigate(['/platform-admin/tenants']);
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.errorMessage.set('A tenant with this slug already exists.');
      } else {
        this.errorMessage.set(
          extractErrorMessage(err, 'Could not save tenant.'),
        );
      }
    } finally {
      this.savingDetails.set(false);
    }
  }

  protected async onPlanChange(newPlanId: string | null): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.workingOnSub.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.subsService.changePlan(sub, newPlanId);
      this.subscription.set(updated);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not change plan.'));
    } finally {
      this.workingOnSub.set(false);
    }
  }

  protected async onStatusOverride(newStatus: SubscriptionStatus): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.workingOnSub.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.subsService.setStatus(sub, newStatus);
      this.subscription.set(updated);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not override status.'),
      );
    } finally {
      this.workingOnSub.set(false);
    }
  }

  protected async startTrial(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.workingOnSub.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.subsService.startTrial(sub);
      this.subscription.set(updated);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not start trial.'));
    } finally {
      this.workingOnSub.set(false);
    }
  }

  protected async cancel(immediate: boolean): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    const confirmMsg = immediate
      ? 'Cancel this subscription immediately? The tenant will lose access right away.'
      : 'Cancel this subscription at the end of the current period?';
    if (!window.confirm(confirmMsg)) return;

    this.workingOnSub.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.subsService.cancelSubscription(sub, { immediate });
      this.subscription.set(updated);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not cancel subscription.'),
      );
    } finally {
      this.workingOnSub.set(false);
    }
  }

  protected async createMissingSubscription(): Promise<void> {
    const current = this.tenant();
    if (!current) return;
    this.workingOnSub.set(true);
    this.errorMessage.set(null);
    try {
      const sub = await this.subsService.createSubscription({
        tenantId: current.id,
        planId: current.planId,
        status: 'trialing',
      });
      this.subscription.set(sub);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not create subscription.'),
      );
    } finally {
      this.workingOnSub.set(false);
    }
  }
}
