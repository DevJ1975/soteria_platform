import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { formatActivityDate } from '@shared/utils/date.util';
import { extractErrorMessage } from '@shared/utils/errors.util';

import { TenantSummary } from '../../models/platform-admin.model';
import { PlatformAdminTenantsService } from '../../services/platform-admin-tenants.service';

@Component({
  selector: 'sot-platform-admin-tenants-list',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sot-page-header
      title="Tenants"
      subtitle="Every customer organization on Soteria."
    >
      <a class="sot-btn sot-btn--primary" routerLink="new">
        New tenant
      </a>
    </sot-page-header>

    @if (errorMessage()) {
      <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
    }

    @if (loading() && tenants().length === 0) {
      <div class="sot-state">Loading tenants…</div>
    } @else if (tenants().length === 0) {
      <sot-empty-state
        title="No tenants yet"
        body="Tenants are created via sign-up. Use the button above to add one manually."
      >
        <a class="sot-btn sot-btn--primary" routerLink="new">New tenant</a>
      </sot-empty-state>
    } @else {
      <div class="sot-card table-card">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Slug</th>
              <th scope="col">Plan</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col" class="table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (t of tenants(); track t.id) {
              <tr>
                <td>
                  <a class="table__title-link" [routerLink]="[t.id, 'edit']">{{ t.name }}</a>
                </td>
                <td class="table__mono">{{ t.slug }}</td>
                <td>
                  @if (t.planName) {
                    <span class="plan-chip">{{ t.planName }}</span>
                  } @else {
                    <span class="table__muted">—</span>
                  }
                </td>
                <td>
                  <span class="status-chip" [attr.data-status]="t.status">
                    {{ t.status }}
                  </span>
                </td>
                <td>{{ formatDate(t.createdAt) }}</td>
                <td class="table__actions">
                  <a
                    class="sot-btn sot-btn--ghost table__btn"
                    [routerLink]="[t.id, 'edit']"
                  >Edit</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--font-size-base);
      }

      .table thead th {
        text-align: left;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-muted);
        color: var(--color-text-muted);
        font-weight: 600;
        font-size: var(--font-size-xs);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--color-border);
      }

      .table tbody td {
        padding: var(--space-3) var(--space-4);
        border-bottom: 1px solid var(--color-border);
        vertical-align: middle;
      }
      .table tbody tr:last-child td { border-bottom: none; }
      .table tbody tr:hover { background: var(--color-surface-muted); }

      .table__title-link { font-weight: 600; color: var(--color-text); }
      .table__title-link:hover { color: var(--color-primary); text-decoration: underline; }

      .table__mono {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: var(--font-size-sm);
      }

      .table__muted { color: var(--color-text-subtle); }

      .table__actions-col { width: 1%; white-space: nowrap; text-align: right; }
      .table__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
      .table__btn { height: 32px; padding: 0 10px; font-size: var(--font-size-sm); }

      .plan-chip {
        display: inline-flex;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        background: var(--color-primary-soft);
        color: var(--color-primary-hover);
        border: 1px solid #bfdbfe;
      }

      .status-chip {
        display: inline-flex;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
        border: 1px solid transparent;
      }
      .status-chip[data-status='active']    { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
      .status-chip[data-status='trial']     { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
      .status-chip[data-status='suspended'] { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
      .status-chip[data-status='cancelled'] { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
    `,
  ],
})
export class PlatformAdminTenantsListComponent implements OnInit {
  private readonly service = inject(PlatformAdminTenantsService);

  protected readonly tenants = signal<TenantSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly formatDate = formatActivityDate;

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.tenants.set(await this.service.getTenants());
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Could not load tenants.'));
    } finally {
      this.loading.set(false);
    }
  }
}
