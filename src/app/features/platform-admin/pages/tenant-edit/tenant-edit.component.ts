import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SubscriptionPlan, Tenant, TenantStatus } from '@core/models';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { formatActivityDate } from '@shared/utils/date.util';
import { extractErrorMessage, isUniqueViolation } from '@shared/utils/errors.util';

import { PlatformAdminPlansService } from '../../services/platform-admin-plans.service';
import { PlatformAdminTenantsService } from '../../services/platform-admin-tenants.service';

const NAME_MAX = 200;
const SLUG_MAX = 100;

/**
 * Edit an existing tenant. Mirror of `tenant-new` but hydrates from
 * `getTenantById` and routes back to the list on save rather than to
 * its own edit page.
 *
 * Plan re-assignment here triggers a cascade of effective-access
 * changes for every user in the tenant (the tenant's sidebar, their
 * guards). The DB handles that via RLS + the registry's own refresh;
 * there's nothing special to do on the admin side beyond writing the
 * FK.
 */
@Component({
  selector: 'sot-platform-admin-tenant-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="tenant()?.name ?? 'Edit tenant'"
      subtitle="Update tenant details and plan assignment."
    >
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
      <div class="sot-alert sot-alert--error" role="alert">
        Tenant not found.
      </div>
    } @else {
      <form class="form sot-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="form__grid">
          <div class="form__field form__field--span-2">
            <label class="sot-label" for="name">
              Name <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="name"
              type="text"
              class="sot-input"
              formControlName="name"
              [attr.maxlength]="nameMax"
            />
            @if (showError('name')) {
              <p class="form__error" role="alert">A tenant name is required.</p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="slug">
              Slug <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="slug"
              type="text"
              class="sot-input"
              formControlName="slug"
              [attr.maxlength]="slugMax"
            />
            <p class="form__hint">
              URL-safe identifier. Lowercase letters, numbers, and hyphens.
            </p>
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

          <div class="form__field form__field--span-2">
            <label class="sot-label" for="planId">Plan</label>
            <select id="planId" class="sot-input" formControlName="planId">
              <option [ngValue]="null">— No plan —</option>
              @for (p of plans(); track p.id) {
                <option [ngValue]="p.id">{{ p.name }}</option>
              }
            </select>
            <p class="form__hint">
              Changing the plan updates every user's effective module access
              the next time their session refreshes.
            </p>
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
          <a
            class="sot-btn sot-btn--ghost"
            routerLink="/platform-admin/tenants"
          >Cancel</a>
          <button
            type="submit"
            class="sot-btn sot-btn--primary"
            [disabled]="form.invalid || submitting()"
          >
            {{ submitting() ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [
    `
      .form { padding: var(--space-5); }

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
      .form__meta-mono {
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly nameMax = NAME_MAX;
  protected readonly slugMax = SLUG_MAX;
  protected readonly formatDate = formatActivityDate;

  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly tenant = signal<Tenant | null>(null);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

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
    planId: this.fb.control<string | null>(null),
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage.set('No tenant id in the URL.');
      this.loading.set(false);
      return;
    }
    try {
      const [plans, tenant] = await Promise.all([
        this.plansService.getPlans(),
        this.tenantsService.getTenantById(id),
      ]);
      this.plans.set(plans);
      this.tenant.set(tenant);
      if (tenant) {
        this.form.setValue({
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          planId: tenant.planId,
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

  protected async submit(): Promise<void> {
    const current = this.tenant();
    if (!current) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    try {
      const updated = await this.tenantsService.updateTenant(current.id, {
        name: value.name.trim(),
        slug: value.slug.trim(),
        status: value.status,
        planId: value.planId,
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
      this.submitting.set(false);
    }
  }
}
