import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { SubscriptionPlan, TenantStatus } from '@core/models';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage, isUniqueViolation } from '@shared/utils/errors.util';

import { PlatformAdminPlansService } from '../../services/platform-admin-plans.service';
import { PlatformAdminTenantsService } from '../../services/platform-admin-tenants.service';

const NAME_MAX = 200;
const SLUG_MAX = 100;

/**
 * Create-tenant page. In Phase 1 this mostly serves admin-side
 * pre-provisioning; most tenants will still be created implicitly via
 * the `handle_new_user` trigger when a user signs up. Once the invite
 * flow ships, admin-created tenants become the common path.
 */
@Component({
  selector: 'sot-platform-admin-tenant-new',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="New tenant"
      subtitle="Provision a new customer organization."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

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
            placeholder="e.g. Acme Corp"
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
            placeholder="e.g. acme"
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
            <option [ngValue]="null">— No plan (assign later) —</option>
            @for (p of plans(); track p.id) {
              <option [ngValue]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
      </div>

      <div class="form__actions">
        <button
          type="button"
          class="sot-btn sot-btn--ghost"
          (click)="navigateToList()"
        >Cancel</button>
        <button
          type="submit"
          class="sot-btn sot-btn--primary"
          [disabled]="form.invalid || submitting()"
        >
          {{ submitting() ? 'Creating…' : 'Create tenant' }}
        </button>
      </div>
    </form>
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
export class PlatformAdminTenantNewComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tenantsService = inject(PlatformAdminTenantsService);
  private readonly plansService = inject(PlatformAdminPlansService);
  private readonly router = inject(Router);

  protected readonly nameMax = NAME_MAX;
  protected readonly slugMax = SLUG_MAX;

  protected readonly plans = signal<SubscriptionPlan[]>([]);
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
      // Lower-case alphanumerics and hyphens; avoids accidental spaces
      // or uppercase that would break URL semantics later.
      Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      Validators.maxLength(SLUG_MAX),
    ]),
    status: this.fb.nonNullable.control<TenantStatus>('trial'),
    planId: this.fb.control<string | null>(null),
  });

  async ngOnInit(): Promise<void> {
    try {
      this.plans.set(await this.plansService.getPlans());
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load plans.'));
    }
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[name];
    return ctrl.invalid && (ctrl.touched || ctrl.dirty);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    try {
      const created = await this.tenantsService.createTenant({
        name: value.name.trim(),
        slug: value.slug.trim(),
        status: value.status,
        planId: value.planId,
      });
      await this.router.navigate(['/platform-admin/tenants', created.id, 'edit']);
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.errorMessage.set('A tenant with this slug already exists.');
      } else {
        this.errorMessage.set(
          extractErrorMessage(err, 'Could not create tenant.'),
        );
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/platform-admin/tenants']);
  }
}
