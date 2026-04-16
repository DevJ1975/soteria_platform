import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { SubscriptionPlan } from '@core/models';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { extractErrorMessage, isUniqueViolation } from '@shared/utils/errors.util';

import { PlatformAdminPlansService } from '../../services/platform-admin-plans.service';
import { PlatformAdminProvisioningService } from '../../services/platform-admin-provisioning.service';

const NAME_MAX = 200;
const SLUG_MAX = 100;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Short list of common IANA timezones for the site-timezone dropdown.
 * Keeps the picker manageable; the DB accepts any string, so an "Other
 * (UTC)" option is still a valid fallback.
 */
const TIMEZONE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'UTC',                label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'US — Pacific' },
  { value: 'America/Denver',      label: 'US — Mountain' },
  { value: 'America/Chicago',     label: 'US — Central' },
  { value: 'America/New_York',    label: 'US — Eastern' },
  { value: 'America/Toronto',     label: 'Canada — Eastern' },
  { value: 'Europe/London',       label: 'UK' },
  { value: 'Europe/Berlin',       label: 'Europe — Central' },
  { value: 'Europe/Athens',       label: 'Europe — Eastern' },
  { value: 'Asia/Dubai',          label: 'Middle East — Gulf' },
  { value: 'Asia/Singapore',      label: 'Asia — Southeast' },
  { value: 'Asia/Tokyo',          label: 'Japan' },
  { value: 'Australia/Sydney',    label: 'Australia — Eastern' },
];

/**
 * Create-tenant page — Phase 14 orchestrated provisioning.
 *
 * What happens on submit
 * ----------------------
 * The form posts to the `provision-tenant` Edge Function. In one
 * round-trip:
 *
 *   1. `provision_tenant_environment` RPC commits:
 *        * tenants row
 *        * auto-provisioned trialing subscription (billing trigger)
 *        * default site with the operator's name / timezone / type
 *        * tenant_settings with mobile defaults
 *   2. `auth.admin.inviteUserByEmail` sends the admin-first-use
 *      invite. When the user accepts, `handle_new_user`'s
 *      invite branch attaches them to the new tenant as `admin`
 *      and the `ensure_user_primary_membership` trigger wires them
 *      to the default site.
 *
 * Partial success
 * ---------------
 * If the invite fails (SMTP down, email already owns an auth
 * account), the RPC has already committed. The edge function returns
 * HTTP 207 with `inviteSent = false`; we surface that as a warning on
 * the summary screen so the operator can retry the invite
 * out-of-band rather than re-running the whole flow and creating a
 * duplicate tenant.
 */
@Component({
  selector: 'sot-platform-admin-tenant-new',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Provision new tenant"
      subtitle="Creates the tenant, a trialing subscription, a default site, and invites the first admin."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <!-- Tenant -->
      <section class="form__section sot-card">
        <header class="form__section-header">
          <h2 class="form__section-title">Tenant</h2>
          <p class="form__section-subtitle">
            Organization identity on the platform.
          </p>
        </header>

        <div class="form__grid">
          <div class="form__field form__field--span-2">
            <label class="sot-label" for="tenantName">
              Tenant name <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="tenantName"
              type="text"
              class="sot-input"
              formControlName="tenantName"
              [attr.maxlength]="nameMax"
              placeholder="e.g. Acme Corp"
            />
            @if (showError('tenantName')) {
              <p class="form__error" role="alert">A tenant name is required.</p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="tenantSlug">
              Slug <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="tenantSlug"
              type="text"
              class="sot-input"
              formControlName="tenantSlug"
              [attr.maxlength]="slugMax"
              placeholder="e.g. acme"
            />
            <p class="form__hint">
              Lowercase letters, numbers, and hyphens.
            </p>
            @if (showError('tenantSlug')) {
              <p class="form__error" role="alert">
                Slug is required. Lowercase letters, numbers, and hyphens only.
              </p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="planId">Starting plan</label>
            <select id="planId" class="sot-input" formControlName="planId">
              <option [ngValue]="null">— Default (trial on cheapest plan) —</option>
              @for (p of plans(); track p.id) {
                <option [ngValue]="p.id">{{ p.name }}</option>
              }
            </select>
            <p class="form__hint">
              The subscription starts in a 14-day trial regardless of plan.
            </p>
          </div>
        </div>
      </section>

      <!-- Default site -->
      <section class="form__section sot-card">
        <header class="form__section-header">
          <h2 class="form__section-title">Default site</h2>
          <p class="form__section-subtitle">
            The mobile app and first admin land here. More sites can be added later.
          </p>
        </header>

        <div class="form__grid">
          <div class="form__field">
            <label class="sot-label" for="siteName">
              Site name <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="siteName"
              type="text"
              class="sot-input"
              formControlName="siteName"
              placeholder="e.g. Main Office"
            />
            @if (showError('siteName')) {
              <p class="form__error" role="alert">A site name is required.</p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="siteTimezone">
              Timezone <span class="form__required" aria-hidden="true">*</span>
            </label>
            <select id="siteTimezone" class="sot-input" formControlName="siteTimezone">
              @for (tz of timezones; track tz.value) {
                <option [value]="tz.value">{{ tz.label }} — {{ tz.value }}</option>
              }
            </select>
          </div>

          <div class="form__field">
            <label class="sot-label" for="siteType">Site type (optional)</label>
            <input
              id="siteType"
              type="text"
              class="sot-input"
              formControlName="siteType"
              placeholder="e.g. warehouse, field office"
            />
            <p class="form__hint">Free text — used as a filter/label later.</p>
          </div>
        </div>
      </section>

      <!-- Admin -->
      <section class="form__section sot-card">
        <header class="form__section-header">
          <h2 class="form__section-title">First admin</h2>
          <p class="form__section-subtitle">
            We'll email them an invite to set their password. They become the tenant <code>admin</code>.
          </p>
        </header>

        <div class="form__grid">
          <div class="form__field form__field--span-2">
            <label class="sot-label" for="adminEmail">
              Email <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="adminEmail"
              type="email"
              class="sot-input"
              formControlName="adminEmail"
              autocomplete="off"
              placeholder="admin@acme.com"
            />
            @if (showError('adminEmail')) {
              <p class="form__error" role="alert">A valid email is required.</p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="adminFirstName">
              First name <span class="form__required" aria-hidden="true">*</span>
            </label>
            <input
              id="adminFirstName"
              type="text"
              class="sot-input"
              formControlName="adminFirstName"
            />
            @if (showError('adminFirstName')) {
              <p class="form__error" role="alert">First name is required.</p>
            }
          </div>

          <div class="form__field">
            <label class="sot-label" for="adminLastName">Last name</label>
            <input
              id="adminLastName"
              type="text"
              class="sot-input"
              formControlName="adminLastName"
            />
          </div>
        </div>
      </section>

      <div class="form__actions">
        <button
          type="button"
          class="sot-btn sot-btn--ghost"
          (click)="navigateToList()"
          [disabled]="submitting()"
        >Cancel</button>
        <button
          type="submit"
          class="sot-btn sot-btn--primary"
          [disabled]="form.invalid || submitting()"
        >
          {{ submitting() ? 'Provisioning…' : 'Provision tenant' }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .form__section { padding: var(--space-5); }

      .form__section-header {
        margin-bottom: var(--space-4);
        padding-bottom: var(--space-3);
        border-bottom: 1px solid var(--color-border);
      }
      .form__section-title {
        font-size: var(--font-size-md);
        font-weight: 600;
      }
      .form__section-subtitle {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
        margin-top: 2px;
      }
      .form__section-subtitle code {
        background: var(--color-surface-muted);
        padding: 1px 4px;
        border-radius: 4px;
      }

      .form__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
      }

      .form__field { display: flex; flex-direction: column; }
      .form__field--span-2 { grid-column: 1 / -1; }
      .form__required { color: var(--color-danger); margin-left: 2px; }
      .form__error    { color: var(--color-danger); font-size: var(--font-size-sm); margin-top: 4px; }
      .form__hint     { color: var(--color-text-subtle); font-size: var(--font-size-sm); margin-top: 4px; }

      .form__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-top: var(--space-2);
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
  private readonly provisioning = inject(PlatformAdminProvisioningService);
  private readonly plansService = inject(PlatformAdminPlansService);
  private readonly router = inject(Router);

  protected readonly nameMax = NAME_MAX;
  protected readonly slugMax = SLUG_MAX;
  protected readonly timezones = TIMEZONE_OPTIONS;

  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    tenantName: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(NAME_MAX),
    ]),
    tenantSlug: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(SLUG_PATTERN),
      Validators.maxLength(SLUG_MAX),
    ]),
    planId: this.fb.control<string | null>(null),

    siteName: this.fb.nonNullable.control('Main Office', [
      Validators.required,
      Validators.minLength(2),
    ]),
    siteTimezone: this.fb.nonNullable.control('UTC', [Validators.required]),
    siteType: this.fb.nonNullable.control(''),

    adminEmail: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(EMAIL_PATTERN),
    ]),
    adminFirstName: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(1),
    ]),
    adminLastName: this.fb.nonNullable.control(''),
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
      const result = await this.provisioning.provisionTenant({
        tenantName: value.tenantName.trim(),
        tenantSlug: value.tenantSlug.trim(),
        planId: value.planId,
        siteName: value.siteName.trim(),
        siteTimezone: value.siteTimezone,
        siteType: value.siteType.trim() || null,
        adminEmail: value.adminEmail.trim(),
        adminFirstName: value.adminFirstName.trim(),
        adminLastName: value.adminLastName.trim() || undefined,
      });

      // Hand off to the tenant edit page — the summary banner lives
      // there so operators see it in the context of the rest of the
      // tenant's settings.
      await this.router.navigate(
        ['/platform-admin/tenants', result.tenantId, 'edit'],
        {
          queryParams: {
            provisioned: 1,
            invite_sent: result.inviteSent ? 1 : 0,
            admin_email: value.adminEmail.trim(),
            invite_error: result.inviteError ?? undefined,
          },
          queryParamsHandling: 'merge',
        },
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.errorMessage.set('A tenant with this slug already exists.');
      } else {
        this.errorMessage.set(
          extractErrorMessage(err, 'Could not provision tenant.'),
        );
      }
      this.submitting.set(false);
    }
  }

  protected navigateToList(): void {
    void this.router.navigate(['/platform-admin/tenants']);
  }
}
