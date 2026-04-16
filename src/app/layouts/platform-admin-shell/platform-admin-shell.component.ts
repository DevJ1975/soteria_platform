import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { IconComponent } from '@shared/components/icon/icon.component';

/**
 * Authenticated shell for `/platform-admin/**`.
 *
 * Deliberately separate from `AppShellComponent` so the operator
 * experience has its own navigation, its own set of concerns, and a
 * visible "you've crossed into admin territory" signal (the amber
 * accent on the brand mark and the topbar badge).
 *
 * The "← Back to app" link in the topbar drops operators back into
 * the tenant-facing app — most platform admins also have a home
 * tenant and need to pop back between contexts.
 */
@Component({
  selector: 'sot-platform-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <nav class="sidebar" aria-label="Platform admin">
        <div class="sidebar__brand">
          <span class="sidebar__brand-mark" aria-hidden="true">S</span>
          <div class="sidebar__brand-text">
            <span class="sidebar__brand-name">Soteria</span>
            <span class="sidebar__brand-badge">Platform Admin</span>
          </div>
        </div>

        <div class="sidebar__section">
          <a
            class="sidebar__item"
            routerLink="/platform-admin/dashboard"
            routerLinkActive="sidebar__item--active"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            <sot-icon name="grid" />
            <span>Dashboard</span>
          </a>
          <a
            class="sidebar__item"
            routerLink="/platform-admin/tenants"
            routerLinkActive="sidebar__item--active"
          >
            <sot-icon name="clipboard-check" />
            <span>Tenants</span>
          </a>
          <a
            class="sidebar__item"
            routerLink="/platform-admin/plans"
            routerLinkActive="sidebar__item--active"
          >
            <sot-icon name="check-circle" />
            <span>Plans</span>
          </a>
          <a
            class="sidebar__item"
            routerLink="/platform-admin/modules"
            routerLinkActive="sidebar__item--active"
          >
            <sot-icon name="wrench" />
            <span>Modules</span>
          </a>
        </div>

        <div class="sidebar__footer">
          <p class="sidebar__footer-label">v0.1 · Phase 11</p>
        </div>
      </nav>

      <div class="main">
        <header class="topbar">
          <div class="topbar__left">
            <span class="topbar__badge">Platform Admin</span>
          </div>
          <div class="topbar__right">
            <a class="sot-btn sot-btn--ghost topbar__back" routerLink="/app/dashboard">
              ← Back to app
            </a>
            <div class="user">
              <div class="user__avatar" aria-hidden="true">{{ initials() }}</div>
              <div class="user__text">
                <span class="user__name">{{ userName() }}</span>
                <span class="user__role">Platform admin</span>
              </div>
            </div>
            <button type="button" class="sot-btn sot-btn--ghost" (click)="signOut()">
              <sot-icon name="log-out" [size]="16" />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <main class="content">
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

      /* Sidebar ------------------------------------------------------- */

      .sidebar {
        display: flex;
        flex-direction: column;
        width: var(--sidebar-width);
        height: 100vh;
        background: #0b1220;    /* deeper than the tenant shell's #0f172a */
        color: var(--color-sidebar-text);
        padding: var(--space-4) 0;
        position: sticky;
        top: 0;
        border-right: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
      }

      .sidebar__brand {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) var(--space-5) var(--space-5);
      }

      .sidebar__brand-mark {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        /* Amber accent signals "operator tools", distinct from the
           blue/teal gradient on the tenant-facing mark. */
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #ffffff;
        font-weight: 700;
        font-size: 15px;
      }

      .sidebar__brand-text {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
      }

      .sidebar__brand-name {
        font-size: var(--font-size-lg);
        font-weight: 700;
        color: var(--color-sidebar-text-active);
        letter-spacing: -0.01em;
      }

      .sidebar__brand-badge {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #fbbf24;
        font-weight: 600;
      }

      .sidebar__section {
        padding: var(--space-2) var(--space-3);
      }

      .sidebar__item {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: 9px var(--space-3);
        border-radius: var(--radius-md);
        color: var(--color-sidebar-text);
        font-size: var(--font-size-base);
        font-weight: 500;
        text-decoration: none;
        transition: background-color 120ms ease, color 120ms ease;
      }
      .sidebar__item:hover {
        background: var(--color-sidebar-item-hover);
        color: var(--color-sidebar-text-active);
      }
      .sidebar__item--active {
        background: #b45309;   /* amber-700 — reinforces operator accent */
        color: #ffffff;
        box-shadow: 0 1px 2px rgba(180, 83, 9, 0.35);
      }

      .sidebar__footer {
        margin-top: auto;
        padding: var(--space-4) var(--space-5) var(--space-2);
      }

      .sidebar__footer-label {
        font-size: 11px;
        color: #475569;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin: 0;
      }

      /* Main column --------------------------------------------------- */

      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .topbar {
        height: var(--topbar-height);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--space-6);
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        position: sticky;
        top: 0;
        z-index: 10;
        gap: var(--space-4);
      }

      .topbar__badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 12px;
        border-radius: 999px;
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #fcd34d;
        font-size: var(--font-size-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .topbar__right {
        display: flex;
        align-items: center;
        gap: var(--space-4);
      }

      .topbar__back { height: 36px; }

      .user {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .user__avatar {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #ffffff;
        display: grid;
        place-items: center;
        font-weight: 600;
        font-size: 13px;
      }

      .user__text {
        display: flex;
        flex-direction: column;
        text-align: right;
        line-height: 1.2;
      }

      .user__name {
        font-weight: 600;
        color: var(--color-text);
        font-size: var(--font-size-sm);
      }

      .user__role {
        font-size: 11px;
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .content {
        flex: 1;
        padding: var(--space-6);
        background: var(--color-bg);
      }
    `,
  ],
})
export class PlatformAdminShellComponent {
  private readonly auth = inject(AuthService);

  protected readonly userName = computed(
    () => this.auth.fullName() || this.auth.session()?.user.email || '',
  );

  protected readonly initials = computed(() => {
    const profile = this.auth.profile();
    if (profile) {
      const a = profile.firstName[0] ?? '';
      const b = profile.lastName[0] ?? '';
      const letters = (a + b).toUpperCase();
      if (letters) return letters;
    }
    const email = this.auth.session()?.user.email ?? '';
    return email.slice(0, 2).toUpperCase() || '?';
  });

  signOut(): void {
    void this.auth.signOut();
  }
}
