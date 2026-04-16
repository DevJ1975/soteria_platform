import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

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
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <sot-sidebar class="shell__sidebar" />
      <div class="shell__main">
        <sot-topbar />
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
export class AppShellComponent {}
