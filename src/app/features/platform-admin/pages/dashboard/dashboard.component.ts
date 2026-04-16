import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { StatTileComponent } from '@shared/components/stat-tile/stat-tile.component';
import { formatActivityDate } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { TenantSummary } from '../../models/platform-admin.model';
import { PlatformAdminModulesService } from '../../services/platform-admin-modules.service';
import { PlatformAdminPlansService } from '../../services/platform-admin-plans.service';
import { PlatformAdminTenantsService } from '../../services/platform-admin-tenants.service';

/**
 * Platform-admin landing page. Three counts + a recent-tenants list.
 * Deliberately small — the point is an at-a-glance health check
 * before diving into the tenant/plan/module lists.
 */
@Component({
  selector: 'sot-platform-admin-dashboard',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, StatTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Platform overview"
      subtitle="Soteria-wide operator snapshot."
    />

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    <section class="kpis">
      <a class="kpi-link" routerLink="/platform-admin/tenants">
        <sot-stat-tile
          label="Tenants"
          [value]="tenantCount()"
          helper="Active customer organizations"
        />
      </a>
      <a class="kpi-link" routerLink="/platform-admin/plans">
        <sot-stat-tile
          label="Subscription plans"
          [value]="planCount()"
          helper="Defined in the platform catalog"
        />
      </a>
      <a class="kpi-link" routerLink="/platform-admin/modules">
        <sot-stat-tile
          label="Platform modules"
          [value]="moduleCount()"
          helper="Modules in the product"
        />
      </a>
    </section>

    <section class="recent sot-card">
      <header class="recent__header">
        <h2 class="recent__title">Recent tenants</h2>
        <a class="recent__view-all" routerLink="/platform-admin/tenants">
          View all →
        </a>
      </header>

      @if (recentError()) {
        <p class="recent__state recent__state--error" role="alert">
          {{ recentError() }}
        </p>
      } @else if (loadingRecent()) {
        <p class="recent__state">Loading…</p>
      } @else if (recentTenants().length === 0) {
        <p class="recent__state">No tenants yet.</p>
      } @else {
        <ul class="recent__list">
          @for (t of recentTenants(); track t.id) {
            <li class="row">
              <a class="row__title" [routerLink]="['/platform-admin/tenants', t.id, 'edit']">
                {{ t.name }}
              </a>
              <div class="row__meta">
                <span class="row__slug">{{ t.slug }}</span>
                @if (t.planName) {
                  <span class="row__plan">{{ t.planName }}</span>
                }
                <span class="row__date">{{ formatDate(t.createdAt) }}</span>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-6);
      }

      .kpi-link {
        display: block;
        text-decoration: none;
        color: inherit;
        border-radius: var(--radius-lg);
        transition: transform 120ms var(--ease-out);
      }
      .kpi-link:hover { transform: translateY(-1px); }
      .kpi-link:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      .recent__header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: var(--space-4);
      }
      .recent__title { font-size: var(--font-size-md); font-weight: 600; }
      .recent__view-all {
        font-size: var(--font-size-sm);
        color: var(--color-primary);
        font-weight: 500;
      }
      .recent__state {
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
        padding: var(--space-4);
        text-align: center;
        background: var(--color-surface-muted);
        border-radius: var(--radius-md);
      }
      .recent__state--error {
        color: #991b1b;
        background: #fef2f2;
        border: 1px solid #fecaca;
      }

      .recent__list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
      }
      .row:hover { background: var(--color-surface-muted); }

      .row__title { font-weight: 600; color: var(--color-text); }
      .row__title:hover { color: var(--color-primary); text-decoration: underline; }

      .row__meta {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        color: var(--color-text-subtle);
        font-size: var(--font-size-sm);
      }

      .row__slug {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      }

      .row__plan {
        color: var(--color-primary-hover);
        font-weight: 500;
      }

      .row__date { font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class PlatformAdminDashboardComponent implements OnInit {
  private readonly tenantsService = inject(PlatformAdminTenantsService);
  private readonly plansService = inject(PlatformAdminPlansService);
  private readonly modulesService = inject(PlatformAdminModulesService);

  protected readonly tenantCount = signal(0);
  protected readonly planCount = signal(0);
  protected readonly moduleCount = signal(0);
  protected readonly recentTenants = signal<TenantSummary[]>([]);
  protected readonly loadingRecent = signal(true);
  protected readonly recentError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly formatDate = formatActivityDate;

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadCounts(),
      this.loadRecentTenants(),
    ]);
  }

  private async loadCounts(): Promise<void> {
    try {
      const [tenants, plans, modules] = await Promise.all([
        this.tenantsService.getCount(),
        this.plansService.getCount(),
        this.modulesService.getCount(),
      ]);
      this.tenantCount.set(tenants);
      this.planCount.set(plans);
      this.moduleCount.set(modules);
    } catch (err) {
      this.errorMessage.set(
        extractErrorMessage(err, 'Could not load platform counts.'),
      );
    }
  }

  private async loadRecentTenants(): Promise<void> {
    try {
      this.recentTenants.set(await this.tenantsService.getRecent());
    } catch (err) {
      // A failing recent-list shouldn't black out the KPIs, so it gets
      // its own scoped error slot rendered inside the card rather than
      // bubbling to the page-level alert.
      this.recentError.set(
        extractErrorMessage(err, 'Could not load recent tenants.'),
      );
    } finally {
      this.loadingRecent.set(false);
    }
  }
}
