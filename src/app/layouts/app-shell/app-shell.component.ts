import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SubscriptionService } from '@core/services/subscription.service';
import { TrialStatusBannerComponent } from '@shared/components/trial-status-banner/trial-status-banner.component';

import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';

/**
 * Authenticated application shell: sidebar + topbar + routed content.
 *
 * This is the layout all module routes render inside. Keeping it thin
 * means we can drop in things like a right-hand drawer, notification
 * panel, or command palette later without restructuring children.
 */
@Component({
  selector: 'sot-app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    SidebarComponent,
    TopbarComponent,
    TrialStatusBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <sot-sidebar class="shell__sidebar" />
      <div class="shell__main">
        <sot-topbar />
        <sot-trial-status-banner />
        <main class="shell__content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        min-height: 100vh;
      }

      .shell__sidebar {
        flex-shrink: 0;
      }

      .shell__main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .shell__content {
        flex: 1;
        padding: var(--space-6);
        background: var(--color-bg);
      }
    `,
  ],
})
export class AppShellComponent implements OnInit {
  private readonly subscription = inject(SubscriptionService);

  /**
   * Warm the subscription cache as soon as the authenticated shell
   * mounts. The `billingAccessGuard` also refreshes lazily when it
   * fires on a module route, but the dashboard and billing page don't
   * carry the guard — loading here means the trial-countdown banner,
   * status chips, and anything else that reads `SubscriptionService`
   * signals render with real state on first paint.
   */
  ngOnInit(): void {
    void this.subscription.refresh().catch(() => {
      /* Shell refresh failures are non-fatal; individual pages surface
         their own errors when they try to read. */
    });
  }
}
