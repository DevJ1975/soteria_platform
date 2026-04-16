import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { ModuleRegistryService } from '@core/services/module-registry.service';
import { IconComponent } from '@shared/components/icon/icon.component';

/**
 * Primary navigation for the authenticated shell.
 * Module items come from `ModuleRegistryService.modules()`, so the sidebar
 * automatically reflects what each tenant has enabled.
 */
@Component({
  selector: 'sot-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="sidebar" aria-label="Primary">
      <div class="sidebar__brand">
        <span class="sidebar__brand-mark" aria-hidden="true">S</span>
        <span class="sidebar__brand-name">Soteria</span>
      </div>

      <div class="sidebar__section">
        <a
          class="sidebar__item"
          routerLink="/app/dashboard"
          routerLinkActive="sidebar__item--active"
          [routerLinkActiveOptions]="{ exact: true }"
        >
          <sot-icon name="grid" />
          <span>Dashboard</span>
        </a>
      </div>

      <div class="sidebar__section">
        <p class="sidebar__heading">Modules</p>
        @for (mod of modules(); track mod.key) {
          <a
            class="sidebar__item"
            [routerLink]="['/app', mod.route]"
            routerLinkActive="sidebar__item--active"
          >
            <sot-icon [name]="mod.icon" />
            <span>{{ mod.name }}</span>
          </a>
        }
        @empty {
          <p class="sidebar__empty">No modules enabled.</p>
        }
      </div>

      @if (isAdmin()) {
        <div class="sidebar__section">
          <p class="sidebar__heading">Admin</p>
          <a
            class="sidebar__item"
            routerLink="/app/settings/modules"
            routerLinkActive="sidebar__item--active"
          >
            <sot-icon name="lock" />
            <span>Modules &amp; Plan</span>
          </a>
          <a
            class="sidebar__item"
            routerLink="/app/billing"
            routerLinkActive="sidebar__item--active"
          >
            <sot-icon name="credit-card" />
            <span>Billing</span>
          </a>
        </div>
      }

      <div class="sidebar__footer">
        <p class="sidebar__footer-label">v0.1 · Phase 12</p>
      </div>
    </nav>
  `,
  styles: [
    `
      .sidebar {
        display: flex;
        flex-direction: column;
        width: var(--sidebar-width);
        height: 100vh;
        background: var(--color-sidebar-bg);
        color: var(--color-sidebar-text);
        padding: var(--space-4) 0;
        position: sticky;
        top: 0;
        border-right: 1px solid rgba(255, 255, 255, 0.06);
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
        background: linear-gradient(135deg, #1f6feb, #0ea5a4);
        color: #ffffff;
        font-weight: 700;
        font-size: 15px;
      }

      .sidebar__brand-name {
        font-size: var(--font-size-lg);
        font-weight: 700;
        color: var(--color-sidebar-text-active);
        letter-spacing: -0.01em;
      }

      .sidebar__section {
        padding: var(--space-2) var(--space-3);
      }

      .sidebar__heading {
        padding: var(--space-2) var(--space-3) var(--space-1);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin: 0;
        font-weight: 600;
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
        background: var(--color-sidebar-item-active);
        color: var(--color-sidebar-text-active);
        box-shadow: 0 1px 2px rgba(31, 111, 235, 0.3);
      }

      .sidebar__empty {
        padding: var(--space-2) var(--space-3);
        color: #64748b;
        font-size: var(--font-size-sm);
        margin: 0;
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
    `,
  ],
})
export class SidebarComponent {
  private readonly registry = inject(ModuleRegistryService);
  private readonly auth = inject(AuthService);

  protected readonly modules = this.registry.modules;

  /** Admin section only shows to tenant admins and platform admins. */
  protected readonly isAdmin = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'admin' || role === 'platform_admin';
  });
}
