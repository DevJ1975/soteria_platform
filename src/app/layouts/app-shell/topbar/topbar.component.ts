import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { TenantService } from '@core/services/tenant.service';
import { IconComponent } from '@shared/components/icon/icon.component';

/**
 * Top bar of the authenticated shell. Shows the current tenant on the left
 * and the signed-in user + sign-out on the right.
 */
@Component({
  selector: 'sot-topbar',
  standalone: true,
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topbar">
      <div class="topbar__left">
        @if (tenantName()) {
          <span class="topbar__tenant-label">Organization</span>
          <span class="topbar__tenant-name">{{ tenantName() }}</span>
        }
      </div>

      <div class="topbar__right">
        @if (isPlatformAdmin()) {
          <a
            class="sot-btn sot-btn--ghost topbar__admin"
            routerLink="/platform-admin/dashboard"
            title="Go to the platform admin area"
          >
            <sot-icon name="wrench" [size]="16" />
            <span>Platform Admin</span>
          </a>
        }
        <div class="user" role="group" aria-label="Current user">
          <div class="user__avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="user__text">
            <span class="user__name">{{ userName() }}</span>
            @if (userRole()) {
              <span class="user__role">{{ userRole() }}</span>
            }
          </div>
        </div>
        <button
          type="button"
          class="sot-btn sot-btn--ghost topbar__signout"
          (click)="signOut()"
        >
          <sot-icon name="log-out" [size]="16" />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  `,
  styles: [
    `
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
      }

      .topbar__left {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .topbar__tenant-label {
        font-size: 11px;
        color: var(--color-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      .topbar__tenant-name {
        font-size: var(--font-size-md);
        font-weight: 600;
        color: var(--color-text);
      }

      .topbar__right {
        display: flex;
        align-items: center;
        gap: var(--space-4);
      }

      .user {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .user__avatar {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1f6feb, #0ea5a4);
        color: #ffffff;
        display: grid;
        place-items: center;
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.02em;
      }

      .user__text {
        display: flex;
        flex-direction: column;
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

      .topbar__signout {
        height: 36px;
      }

      .topbar__admin {
        height: 36px;
        color: #92400e;
        background: #fef3c7;
        border: 1px solid #fcd34d;
        font-weight: 600;
      }
      .topbar__admin:hover {
        background: #fde68a;
        color: #78350f;
      }
    `,
  ],
})
export class TopbarComponent {
  private readonly auth = inject(AuthService);
  private readonly tenants = inject(TenantService);

  protected readonly tenantName = this.tenants.tenantName;

  protected readonly userName = computed(
    () => this.auth.fullName() || this.auth.session()?.user.email || '',
  );

  protected readonly userRole = computed(() => this.auth.profile()?.role ?? '');

  protected readonly isPlatformAdmin = computed(
    () => this.auth.profile()?.role === 'platform_admin',
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
