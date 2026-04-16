import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { SubscriptionPlan } from '@core/models';
import { BillingActionsService } from '@core/services/billing-actions.service';
import { SubscriptionPlansService } from '@core/services/subscription-plans.service';
import { SubscriptionService } from '@core/services/subscription.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { SubscriptionStatusBadgeComponent } from '@shared/components/subscription-status-badge/subscription-status-badge.component';
import { formatActivityDateOrDash } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

/** mailto: link for pre-billing sales inquiries. Swap for `environment`-driven value when we have per-env config. */
const SALES_MAILTO = 'mailto:sales@soteria.example?subject=Soteria%20billing%20inquiry';

interface StatusCallout {
  variant: 'info' | 'warn' | 'danger';
  title: string;
  body: string;
}

/**
 * Tenant-facing billing page.
 *
 * Phase 13 — self-serve checkout + portal
 * ---------------------------------------
 * When plans have Stripe Price ids mapped (populated by a platform
 * admin), tenants can launch Stripe Checkout directly from the
 * "Upgrade plan" card. Once a tenant completes checkout, their
 * subscription row is webhook-updated to `billing_provider = 'stripe'`
 * and subsequent changes (plan, payment method, cancellation) flow
 * through the Stripe Billing Portal via the "Manage subscription"
 * button.
 *
 * The page degrades gracefully: if no plans have Stripe prices
 * mapped (e.g., Stripe isn't configured on this environment), the
 * upgrade card reverts to the "contact sales" placeholder.
 *
 * Return-from-checkout handling
 * -----------------------------
 * Stripe redirects back to `/app/billing?checkout=success` or
 * `?checkout=cancelled`. The component reads the query param, shows
 * a banner, and clears the param so a refresh doesn't replay it.
 * Webhook latency: Stripe typically fires `checkout.session.completed`
 * before the user's redirect lands, but it's not guaranteed. We
 * refresh once and display a subtle "your plan is updating" note if
 * the subscription still shows the old state.
 */
@Component({
  selector: 'sot-billing',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, SubscriptionStatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Billing"
      subtitle="Your Soteria subscription, trial status, and plan."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (checkoutState() === 'success') {
      <div class="sot-alert sot-alert--success" role="status">
        Checkout complete. Your subscription is being updated — refresh in a
        moment if the plan below still looks stale.
      </div>
    } @else if (checkoutState() === 'cancelled') {
      <div class="sot-alert" role="status">
        Checkout cancelled. Your subscription hasn't changed.
      </div>
    }

    @if (loading()) {
      <div class="sot-state">Loading your subscription…</div>
    } @else if (!subs.current()) {
      <div class="sot-alert sot-alert--error" role="alert">
        We couldn't find a subscription record for your organization. Please
        contact support so we can reset your account.
      </div>
    } @else {
      @if (callout(); as c) {
        <div class="callout sot-card" [attr.data-variant]="c.variant" role="alert">
          <h2 class="callout__title">{{ c.title }}</h2>
          <p class="callout__body">{{ c.body }}</p>
          <a class="sot-btn sot-btn--primary" [href]="salesMailto">Contact sales</a>
        </div>
      }

      <section class="plan-card sot-card">
        <header class="plan-card__header">
          <div>
            <p class="plan-card__eyebrow">Current plan</p>
            <h2 class="plan-card__title">{{ planName() }}</h2>
            @if (currentPlan()?.description) {
              <p class="plan-card__desc">{{ currentPlan()?.description }}</p>
            }
          </div>
          <sot-subscription-status-badge [status]="subs.current()!.status" />
        </header>

        <dl class="details">
          @if (subs.current()!.status === 'trialing') {
            <div class="details__row details__row--highlight">
              <dt>Trial ends</dt>
              <dd>
                {{ formatDate(subs.current()!.trialEndDate) }}
                @if (remainingDays() !== null) {
                  <span class="details__sub">
                    ({{ remainingDays() }}
                    {{ remainingDays() === 1 ? 'day' : 'days' }} remaining)
                  </span>
                }
              </dd>
            </div>
          }
          @if (subs.current()!.currentPeriodEnd) {
            <div class="details__row">
              <dt>Next billing period</dt>
              <dd>{{ formatDate(subs.current()!.currentPeriodEnd) }}</dd>
            </div>
          }
          @if (subs.current()!.cancelAt) {
            <div class="details__row">
              <dt>Cancellation effective</dt>
              <dd>{{ formatDate(subs.current()!.cancelAt) }}</dd>
            </div>
          }
          <div class="details__row">
            <dt>Subscription ID</dt>
            <dd class="details__mono">{{ subs.current()!.id }}</dd>
          </div>
        </dl>
      </section>

      <section class="actions sot-card">
        @if (canManageViaPortal()) {
          <div class="actions__row">
            <div>
              <h3 class="actions__title">Manage subscription</h3>
              <p class="actions__body">
                Change plan, update your payment method, download invoices,
                or cancel — handled on Stripe's secure portal.
              </p>
            </div>
            <div class="actions__buttons">
              <button
                type="button"
                class="sot-btn sot-btn--primary"
                (click)="openPortal()"
                [disabled]="portalLoading()"
              >
                {{ portalLoading() ? 'Opening…' : 'Manage subscription' }}
              </button>
            </div>
          </div>
        } @else if (upgradablePlans().length > 0) {
          <div class="actions__row">
            <div>
              <h3 class="actions__title">Upgrade plan</h3>
              <p class="actions__body">
                Pick a plan and we'll take you to Stripe to complete the
                purchase securely.
              </p>
            </div>
            <form class="actions__form" (submit)="$event.preventDefault(); upgrade()">
              <select
                class="sot-input"
                aria-label="Choose a plan"
                [(ngModel)]="selectedPlanId"
                name="planId"
                [disabled]="checkoutLoading()"
              >
                @for (p of upgradablePlans(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
              <button
                type="submit"
                class="sot-btn sot-btn--primary"
                [disabled]="!selectedPlanId || checkoutLoading()"
              >
                {{ checkoutLoading() ? 'Redirecting…' : 'Continue to Stripe →' }}
              </button>
            </form>
          </div>
        } @else {
          <div class="actions__row">
            <div>
              <h3 class="actions__title">Change your plan</h3>
              <p class="actions__body">
                Self-serve checkout isn't available on your account yet.
                Contact sales and we'll switch plans, handle upgrades, or
                process cancellations for you.
              </p>
            </div>
            <div class="actions__buttons">
              <a class="sot-btn sot-btn--primary" [href]="salesMailto">
                Contact sales
              </a>
            </div>
          </div>
        }
      </section>
    }
  `,
  styles: [
    `
      .callout {
        padding: var(--space-5);
        margin-bottom: var(--space-5);
      }
      .callout[data-variant='danger'] { background: #fef2f2; border: 1px solid #fecaca; }
      .callout[data-variant='danger'] .callout__title { color: #991b1b; }
      .callout[data-variant='danger'] .callout__body  { color: #7f1d1d; }
      .callout[data-variant='warn']   { background: #fef3c7; border: 1px solid #fcd34d; }
      .callout[data-variant='warn']   .callout__title { color: #92400e; }
      .callout[data-variant='warn']   .callout__body  { color: #78350f; }
      .callout[data-variant='info']   { background: #eff6ff; border: 1px solid #bfdbfe; }
      .callout[data-variant='info']   .callout__title { color: #1d4ed8; }
      .callout[data-variant='info']   .callout__body  { color: #1e3a8a; }
      .callout__title { font-size: var(--font-size-md); font-weight: 600; margin-bottom: var(--space-2); }
      .callout__body  { margin-bottom: var(--space-4); }

      .plan-card { padding: var(--space-5); margin-bottom: var(--space-5); }

      .plan-card__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-4);
        margin-bottom: var(--space-5);
        padding-bottom: var(--space-4);
        border-bottom: 1px solid var(--color-border);
      }
      .plan-card__eyebrow {
        font-size: var(--font-size-xs);
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .plan-card__title {
        font-size: var(--font-size-xl);
        font-weight: 600;
        color: var(--color-text);
      }
      .plan-card__desc {
        color: var(--color-text-muted);
        margin-top: var(--space-2);
        max-width: 52ch;
      }

      .details { display: flex; flex-direction: column; gap: var(--space-3); }
      .details__row {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: var(--space-4);
        align-items: baseline;
      }
      .details__row dt {
        font-size: var(--font-size-sm);
        color: var(--color-text-subtle);
        font-weight: 500;
      }
      .details__row dd {
        font-size: var(--font-size-base);
        color: var(--color-text);
        margin: 0;
      }
      .details__row--highlight dd { font-weight: 600; }
      .details__sub {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        margin-left: 6px;
        font-weight: 400;
      }
      .details__mono {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px;
      }

      .actions { padding: 0; overflow: hidden; }
      .actions__row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-4) var(--space-5);
      }
      .actions__buttons {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .actions__form {
        display: flex;
        gap: var(--space-2);
        align-items: stretch;
      }
      .actions__form .sot-input { max-width: 220px; }
      .actions__title { font-size: var(--font-size-md); font-weight: 600; margin-bottom: 4px; }
      .actions__body {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
        max-width: 52ch;
      }

      .sot-alert--success {
        background: #ecfdf5;
        color: #047857;
        border: 1px solid #a7f3d0;
      }

      @media (max-width: 640px) {
        .details__row { grid-template-columns: 1fr; gap: 4px; }
        .plan-card__header, .actions__row {
          flex-direction: column;
          align-items: flex-start;
        }
        .actions__form { flex-direction: column; width: 100%; }
        .actions__form .sot-input { max-width: none; }
      }
    `,
  ],
})
export class BillingComponent implements OnInit {
  protected readonly subs = inject(SubscriptionService);
  private readonly plansService = inject(SubscriptionPlansService);
  private readonly billingActions = inject(BillingActionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly checkoutLoading = signal(false);
  protected readonly portalLoading = signal(false);
  protected readonly checkoutState = signal<'success' | 'cancelled' | null>(null);

  /** Two-way bound via `ngModel` on the plan selector. */
  protected selectedPlanId: string | null = null;

  protected readonly currentPlan = computed<SubscriptionPlan | null>(() => {
    const planId = this.subs.current()?.planId;
    if (!planId) return null;
    return this.plans().find((p) => p.id === planId) ?? null;
  });

  protected readonly planName = computed(
    () => this.currentPlan()?.name ?? 'No plan assigned',
  );

  protected readonly remainingDays = this.subs.remainingTrialDays;
  protected readonly formatDate = formatActivityDateOrDash;
  protected readonly salesMailto = SALES_MAILTO;

  /**
   * Plans the tenant could switch to via Stripe Checkout. Excludes
   * the current plan (nothing to upgrade to) and any plan without a
   * `stripe_price_id` (unpurchasable — operator hasn't mapped it).
   */
  protected readonly upgradablePlans = computed<SubscriptionPlan[]>(() => {
    const currentId = this.subs.current()?.planId ?? null;
    return this.plans().filter(
      (p) => !!p.stripePriceId && p.id !== currentId,
    );
  });

  /**
   * Once the tenant has a Stripe customer record, plan management
   * goes through the Stripe Billing Portal. Before that, they need
   * to complete a Checkout first.
   */
  protected readonly canManageViaPortal = computed<boolean>(() => {
    const sub = this.subs.current();
    return !!sub?.externalCustomerId && sub.billingProvider === 'stripe';
  });

  protected readonly callout = computed<StatusCallout | null>(() => {
    const sub = this.subs.current();
    if (!sub) return null;

    if (!this.subs.hasAccess()) {
      return {
        variant: 'danger',
        title: 'Your access is paused',
        body: this.subs.trialExpired()
          ? 'Your free trial has ended. To continue using Soteria, please contact sales to move to a paid plan.'
          : 'Your subscription is no longer active. Reach out to reactivate your organization.',
      };
    }
    if (sub.status === 'past_due') {
      return {
        variant: 'warn',
        title: 'Payment needs attention',
        body: 'We were unable to collect your most recent payment. Update your payment method to avoid interruption.',
      };
    }
    if (sub.status === 'canceled' && sub.cancelAt) {
      return {
        variant: 'warn',
        title: 'Cancellation scheduled',
        body: `Your subscription is set to end on ${formatActivityDateOrDash(sub.cancelAt)}. You still have access until then.`,
      };
    }
    return null;
  });

  async ngOnInit(): Promise<void> {
    this.readCheckoutQueryParam();

    try {
      const [, plans] = await Promise.all([
        this.subs.refresh(),
        this.plansService.getPlans(),
      ]);
      this.plans.set(plans);
      // Prefill the plan selector with the first available upgrade.
      const first = this.upgradablePlans()[0];
      if (first) this.selectedPlanId = first.id;
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load your subscription.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async upgrade(): Promise<void> {
    if (!this.selectedPlanId) return;
    this.checkoutLoading.set(true);
    this.errorMessage.set(null);
    try {
      const { url } = await this.billingActions.createCheckoutSession(
        this.selectedPlanId,
      );
      // Hand the browser off to Stripe — nothing more happens on
      // our side until the webhook fires and the user returns.
      window.location.href = url;
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not start checkout.'),
      );
      this.checkoutLoading.set(false);
    }
  }

  protected async openPortal(): Promise<void> {
    this.portalLoading.set(true);
    this.errorMessage.set(null);
    try {
      const { url } = await this.billingActions.createPortalSession();
      window.location.href = url;
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not open billing portal.'),
      );
      this.portalLoading.set(false);
    }
  }

  /**
   * Reads `?checkout=success|cancelled` off the URL and clears it so
   * a refresh doesn't replay the banner. Deliberately `replaceUrl`
   * so back-button doesn't land on a stale state.
   */
  private readCheckoutQueryParam(): void {
    const state = this.route.snapshot.queryParamMap.get('checkout');
    if (state === 'success' || state === 'cancelled') {
      this.checkoutState.set(state);
      void this.router.navigate([], {
        queryParams: { checkout: null, session_id: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }
}
