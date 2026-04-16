import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

/**
 * One-shot success banner rendered on the tenant edit page after a
 * fresh provisioning run. Reads the `?provisioned=1&invite_sent=…`
 * query params that `tenant-new` attaches on navigation, renders a
 * summary + next-step links, and clears the params on dismiss so a
 * browser refresh doesn't replay it.
 *
 * Why a query-param handoff (vs. a session signal)
 * -------------------------------------------------
 * Keeps the handoff bookmarkable-neutral (no hidden state across
 * tabs), matches how the billing page handles Stripe return
 * (`?checkout=success`), and means the summary survives a sibling
 * component refresh while still being cleared on user action.
 */
@Component({
  selector: 'sot-provisioning-summary-banner',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section
        class="banner sot-card"
        [attr.data-variant]="inviteSent() ? 'success' : 'warn'"
        role="status"
      >
        <header class="banner__header">
          <h2 class="banner__title">Tenant provisioned</h2>
          <button
            type="button"
            class="banner__dismiss"
            aria-label="Dismiss"
            (click)="dismiss()"
          >×</button>
        </header>

        <ul class="banner__list">
          <li><strong>Tenant</strong> created.</li>
          <li><strong>Trial subscription</strong> started (14-day default).</li>
          <li><strong>Default site</strong> created and set as primary.</li>
          @if (inviteSent()) {
            <li>
              <strong>Admin invite</strong> sent to
              <span class="banner__email">{{ adminEmail() }}</span>.
              They'll land in the tenant as <code>admin</code> after
              accepting.
            </li>
          } @else {
            <li class="banner__warn">
              <strong>Admin invite failed.</strong>
              The tenant is ready, but the email to
              <span class="banner__email">{{ adminEmail() }}</span>
              didn't send.
              @if (inviteError()) {
                <span class="banner__reason">({{ inviteError() }})</span>
              }
              Retry from the admin's user profile or resend manually.
            </li>
          }
        </ul>

        <nav class="banner__next">
          <span class="banner__next-label">Next:</span>
          <a
            class="sot-btn sot-btn--ghost banner__btn"
            [routerLink]="['/platform-admin/tenants', tenantId(), 'edit']"
            queryParamsHandling="preserve"
          >Edit tenant</a>
          <a
            class="sot-btn sot-btn--ghost banner__btn"
            routerLink="/platform-admin/plans"
          >Manage plans &amp; modules</a>
          <a
            class="sot-btn sot-btn--ghost banner__btn"
            routerLink="/app/dashboard"
          >Open tenant app</a>
        </nav>
      </section>
    }
  `,
  styles: [
    `
      .banner {
        padding: var(--space-4) var(--space-5);
        margin-bottom: var(--space-5);
      }
      .banner[data-variant='success'] {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
      }
      .banner[data-variant='success'] .banner__title { color: #047857; }
      .banner[data-variant='warn'] {
        background: #fef3c7;
        border: 1px solid #fcd34d;
      }
      .banner[data-variant='warn'] .banner__title { color: #92400e; }

      .banner__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3);
      }
      .banner__title {
        font-size: var(--font-size-md);
        font-weight: 600;
      }
      .banner__dismiss {
        background: transparent;
        border: 0;
        font-size: 24px;
        line-height: 1;
        color: currentColor;
        opacity: 0.6;
        cursor: pointer;
      }
      .banner__dismiss:hover { opacity: 1; }

      .banner__list {
        list-style: disc;
        padding-left: var(--space-5);
        margin-bottom: var(--space-4);
        font-size: var(--font-size-sm);
        color: var(--color-text);
      }
      .banner__list li + li { margin-top: 2px; }
      .banner__list code {
        background: rgba(15, 23, 42, 0.08);
        padding: 1px 4px;
        border-radius: 4px;
      }

      .banner__email {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 13px;
      }
      .banner__warn     { color: #78350f; }
      .banner__reason   { color: #78350f; font-style: italic; }

      .banner__next {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .banner__next-label {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        font-weight: 500;
      }
      .banner__btn {
        height: 34px;
        font-size: var(--font-size-sm);
      }
    `,
  ],
})
export class ProvisioningSummaryBannerComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Tenant id for "Edit tenant" link — passed in because the parent
   *  component already resolves it from the route. */
  readonly tenantId = input.required<string>();

  protected readonly visible = computed(() => this.readParam('provisioned') === '1');
  protected readonly inviteSent = computed(
    () => this.readParam('invite_sent') === '1',
  );
  protected readonly adminEmail = computed(
    () => this.readParam('admin_email') ?? 'the admin',
  );
  protected readonly inviteError = computed(() => this.readParam('invite_error'));

  private readParam(key: string): string | null {
    // Use snapshot — the banner is driven by navigation events from
    // tenant-new, not by any in-page routing.
    return this.route.snapshot.queryParamMap.get(key);
  }

  protected dismiss(): void {
    void this.router.navigate([], {
      queryParams: {
        provisioned: null,
        invite_sent: null,
        admin_email: null,
        invite_error: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
