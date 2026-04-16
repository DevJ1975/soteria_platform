import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { SubscriptionPlan } from '@core/models';
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
 * Scope (Phase 12)
 * ----------------
 * Read-only surface that shows what the tenant is on, where they are
 * in the lifecycle, and how to get help. Plan *changes* aren't
 * possible from here yet — that path lands with Stripe integration.
 * Both visible CTAs ("Upgrade plan" and "Contact sales") are the
 * standard SaaS pre-billing placeholders, and we're deliberate about
 * labeling them "Coming soon" / `mailto:` so no one expects a
 * self-serve flow that isn't there.
 *
 * Also serves as the redirect target for `billingAccessGuard` — any
 * tenant whose subscription has lapsed lands here with a clear
 * explanation and a way to reach us.
 */
@Component({
  selector: 'sot-billing',
  standalone: true,
  imports: [PageHeaderComponent, SubscriptionStatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Billing"
      subtitle="Your Soteria subscription, trial status, and plan."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
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
              <dd>
                {{ formatDate(subs.current()!.currentPeriodEnd) }}
                <span class="details__sub">(placeholder until billing launches)</span>
              </dd>
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
        <div class="actions__row">
          <div>
            <h3 class="actions__title">Change your plan</h3>
            <p class="actions__body">
              Self-serve checkout is coming soon. Until then, contact sales and
              we'll switch plans, handle upgrades, or process cancellations
              for you.
            </p>
          </div>
          <div class="actions__buttons">
            <button type="button" class="sot-btn sot-btn--primary" disabled>
              Upgrade (coming soon)
            </button>
            <a class="sot-btn sot-btn--ghost" [href]="salesMailto">
              Contact sales
            </a>
          </div>
        </div>
      </section>
    }
  `,
  styles: [
    `
      .callout {
        padding: var(--space-5);
        margin-bottom: var(--space-5);
      }
      .callout[data-variant='danger'] {
        background: #fef2f2;
        border: 1px solid #fecaca;
      }
      .callout[data-variant='danger'] .callout__title { color: #991b1b; }
      .callout[data-variant='danger'] .callout__body  { color: #7f1d1d; }
      .callout[data-variant='warn'] {
        background: #fef3c7;
        border: 1px solid #fcd34d;
      }
      .callout[data-variant='warn'] .callout__title { color: #92400e; }
      .callout[data-variant='warn'] .callout__body  { color: #78350f; }
      .callout[data-variant='info'] {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
      }
      .callout[data-variant='info'] .callout__title { color: #1d4ed8; }
      .callout[data-variant='info'] .callout__body  { color: #1e3a8a; }
      .callout__title {
        font-size: var(--font-size-md);
        font-weight: 600;
        margin-bottom: var(--space-2);
      }
      .callout__body {
        margin-bottom: var(--space-4);
      }

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

      .details {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

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
      .details__row--highlight dd {
        font-weight: 600;
      }
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

      .actions {
        padding: 0;
        overflow: hidden;
      }
      .actions__row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-4) var(--space-5);
      }
      .actions__row + .actions__row {
        border-top: 1px solid var(--color-border);
      }
      .actions__buttons {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .actions__title {
        font-size: var(--font-size-md);
        font-weight: 600;
        margin-bottom: 4px;
      }
      .actions__body {
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
        max-width: 52ch;
      }

      @media (max-width: 640px) {
        .details__row { grid-template-columns: 1fr; gap: 4px; }
        .plan-card__header, .actions__row {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class BillingComponent implements OnInit {
  protected readonly subs = inject(SubscriptionService);
  private readonly plansService = inject(SubscriptionPlansService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly plans = signal<SubscriptionPlan[]>([]);

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
   * Status-specific callout rendered above the plan card. Returns
   * `null` when everything's healthy so the page stays clean.
   * Mirrors the logic in `TrialStatusBannerComponent` but tuned for
   * the richer billing-page real estate — longer copy, action-
   * oriented titles.
   */
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
    try {
      const [, plans] = await Promise.all([
        this.subs.refresh(),
        this.plansService.getPlans(),
      ]);
      this.plans.set(plans);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load your subscription.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
