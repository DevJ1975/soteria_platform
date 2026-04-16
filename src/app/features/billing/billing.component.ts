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
import { formatActivityDate } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

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
      @if (!subs.hasAccess()) {
        <div class="lockout sot-card" role="alert">
          <h2 class="lockout__title">Your access is paused</h2>
          <p class="lockout__body">
            @if (subs.trialExpired()) {
              Your free trial has ended. To continue using Soteria, please
              contact us to move to a paid plan.
            } @else {
              Your subscription is no longer active. Reach out to sales to
              reactivate your organization.
            }
          </p>
          <a class="sot-btn sot-btn--primary" [href]="salesMailto()">Contact sales</a>
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
            <h3 class="actions__title">Upgrade plan</h3>
            <p class="actions__body">
              Self-serve upgrades are coming soon. For now, reach out and
              we'll switch your plan for you.
            </p>
          </div>
          <button type="button" class="sot-btn sot-btn--primary" disabled>
            Coming soon
          </button>
        </div>

        <div class="actions__row">
          <div>
            <h3 class="actions__title">Contact sales</h3>
            <p class="actions__body">
              Have billing questions, need a custom plan, or want to cancel?
              We're one email away.
            </p>
          </div>
          <a class="sot-btn sot-btn--ghost" [href]="salesMailto()">
            Email sales
          </a>
        </div>
      </section>
    }
  `,
  styles: [
    `
      .lockout {
        padding: var(--space-5);
        margin-bottom: var(--space-5);
        border: 1px solid #fecaca;
        background: #fef2f2;
      }
      .lockout__title {
        color: #991b1b;
        font-size: var(--font-size-md);
        font-weight: 600;
        margin-bottom: var(--space-2);
      }
      .lockout__body {
        color: #7f1d1d;
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

  protected readonly formatDate = (value: string | null) =>
    value ? formatActivityDate(value) : '—';

  /**
   * Sales email is a platform-wide constant today; when we have a
   * real config endpoint or `environment.billingEmail`, wire that in
   * instead.
   */
  protected readonly salesMailto = () =>
    'mailto:sales@soteria.example?subject=Soteria%20billing%20inquiry';

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
