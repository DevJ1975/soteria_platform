import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { ModuleRegistryService } from '@core/services/module-registry.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { StatTileComponent } from '@shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'sot-dashboard',
  standalone: true,
  imports: [PageHeaderComponent, StatTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      [title]="greeting()"
      subtitle="Here's what's happening across your organization today."
    />

    <section class="stats">
      <sot-stat-tile label="Open inspections" value="—" helper="Connect data to populate" />
      <sot-stat-tile label="Equipment flags" value="—" helper="Connect data to populate" />
      <sot-stat-tile label="Actions due" value="—" helper="Connect data to populate" />
      <sot-stat-tile
        label="Modules enabled"
        [value]="moduleCount()"
        helper="For this organization"
      />
    </section>

    <section class="panel sot-card">
      <div class="panel__text">
        <h2 class="panel__title">Getting started</h2>
        <p class="panel__body">
          Phase 1 is focused on the foundation. Use the sidebar to explore
          the module placeholders — each will be built out in subsequent
          phases.
        </p>
      </div>
      <ul class="panel__checklist">
        <li><span class="panel__dot"></span> Supabase URL + anon key configured</li>
        <li><span class="panel__dot"></span> Tenants, user profiles, and module flags in the database</li>
        <li><span class="panel__dot"></span> RLS policies enforcing tenant isolation</li>
      </ul>
    </section>
  `,
  styles: [
    `
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-6);
      }

      .panel {
        display: grid;
        grid-template-columns: 1fr minmax(260px, 360px);
        gap: var(--space-6);
        align-items: center;
      }

      .panel__title {
        font-size: var(--font-size-lg);
        margin-bottom: var(--space-2);
      }

      .panel__checklist {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .panel__checklist li {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
      }

      .panel__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-border-strong);
        flex-shrink: 0;
      }

      @media (max-width: 720px) {
        .panel { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly registry = inject(ModuleRegistryService);

  protected readonly greeting = computed(() => {
    const first = this.auth.profile()?.firstName?.trim();
    return first ? `Welcome back, ${first}` : 'Welcome back';
  });

  protected readonly moduleCount = computed(() => this.registry.modules().length);
}
