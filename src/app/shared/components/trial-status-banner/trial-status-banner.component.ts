import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { SubscriptionService } from '@core/services/subscription.service';

/**
 * Thin status bar rendered in the authenticated shell whenever the
 * tenant's subscription needs attention: trial ending soon, payment
 * past due, cancellation queued, or lockout.
 *
 * Renders nothing for healthy `active` subscriptions — quiet when
 * things are fine. For `trialing` we only surface the banner in the
 * last week of the trial, so "Day 1 of 14" users don't see a nag.
 *
 * Tone is deliberately non-alarming: banner is a visual affordance,
 * not an interruption. Destructive language is reserved for the
 * billing-page lockout.
 */
@Component({
  selector: 'sot-trial-status-banner',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible(); as state) {
      <div class="banner" [attr.data-variant]="state.variant" role="status">
        <span class="banner__message">{{ state.message }}</span>
        <a class="banner__cta" routerLink="/app/billing">
          {{ state.cta }} →
        </a>
      </div>
    }
  `,
  styles: [
    `
      .banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        padding: 8px var(--space-6);
        font-size: var(--font-size-sm);
        font-weight: 500;
        border-bottom: 1px solid transparent;
      }
      .banner[data-variant='info'] {
        background: #eff6ff;
        color: #1d4ed8;
        border-bottom-color: #bfdbfe;
      }
      .banner[data-variant='warn'] {
        background: #fef3c7;
        color: #92400e;
        border-bottom-color: #fcd34d;
      }
      .banner[data-variant='danger'] {
        background: #fef2f2;
        color: #991b1b;
        border-bottom-color: #fecaca;
      }
      .banner__cta {
        color: inherit;
        font-weight: 600;
        text-decoration: underline;
        white-space: nowrap;
      }
    `,
  ],
})
export class TrialStatusBannerComponent {
  private readonly subs = inject(SubscriptionService);

  /**
   * Returns the banner state or null if nothing should render. Four
   * scenarios, in precedence order:
   *
   *   1. No access (trial expired, canceled past cancel_at, inactive) →
   *      danger tone, "resolve billing" CTA.
   *   2. Past due → warn tone, "update payment" CTA.
   *   3. Canceled with cancel_at in the future → warn, surfaces the
   *      wind-down date so admins can reactivate before losing access.
   *   4. Trialing with ≤7 days left → info tone, countdown + upgrade
   *      CTA. We stay silent earlier in the trial window to avoid
   *      nag fatigue.
   */
  protected readonly visible = computed<BannerState | null>(() => {
    const sub = this.subs.current();
    if (!sub) return null;

    if (!this.subs.hasAccess()) {
      return {
        variant: 'danger',
        message:
          sub.status === 'trialing'
            ? 'Your free trial has ended. Reach out to keep using Soteria.'
            : 'Your subscription is paused. Contact sales to restore access.',
        cta: 'Manage billing',
      };
    }

    if (sub.status === 'past_due') {
      return {
        variant: 'warn',
        message:
          'Your last payment did not go through. Update your payment method to avoid interruption.',
        cta: 'Update payment',
      };
    }

    if (sub.status === 'canceled' && sub.cancelAt) {
      return {
        variant: 'warn',
        message: `Your subscription ends on ${formatShortDate(sub.cancelAt)}.`,
        cta: 'Reactivate',
      };
    }

    const days = this.subs.remainingTrialDays();
    if (sub.status === 'trialing' && days !== null && days <= 7) {
      return {
        variant: 'info',
        message: `Trial ends in ${days} ${days === 1 ? 'day' : 'days'}.`,
        cta: 'Upgrade',
      };
    }

    return null;
  });
}

interface BannerState {
  variant: 'info' | 'warn' | 'danger';
  message: string;
  cta: string;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
