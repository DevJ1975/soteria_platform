import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { environment } from '@env/environment';

/**
 * Two-pane layout for all unauthenticated screens (login, signup, reset).
 * Left pane is the form area; right pane is a branded panel communicating
 * what Soteria is.
 */
@Component({
  selector: 'sot-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="auth">
      <section class="auth__form">
        <div class="auth__brand">
          <span class="auth__brand-mark" aria-hidden="true">S</span>
          <span class="auth__brand-name">{{ appName }}</span>
        </div>

        <div class="auth__slot">
          <router-outlet />
        </div>

        <footer class="auth__footer">
          <span>© {{ year }} {{ appName }}</span>
          <span aria-hidden="true">·</span>
          <a href="#">Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="#">Terms</a>
        </footer>
      </section>

      <aside class="auth__pitch" aria-hidden="true">
        <div class="pitch">
          <p class="pitch__eyebrow">Soteria Platform</p>
          <h2 class="pitch__title">Safety operations,<br />built for the field.</h2>
          <p class="pitch__body">
            Inspections, equipment checks, corrective actions — unified in
            one mobile-first workspace your crews will actually use.
          </p>
          <ul class="pitch__list">
            <li>Multi-tenant by default</li>
            <li>Modular — enable only what you need</li>
            <li>Built for audit trails and compliance</li>
          </ul>
        </div>
      </aside>
    </main>
  `,
  styles: [
    `
      .auth {
        display: grid;
        grid-template-columns: minmax(340px, 520px) 1fr;
        min-height: 100vh;
      }

      .auth__form {
        display: flex;
        flex-direction: column;
        padding: var(--space-7) var(--space-7);
        background: var(--color-surface);
      }

      .auth__brand {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-8);
      }

      .auth__brand-mark {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: linear-gradient(135deg, #1f6feb, #0ea5a4);
        color: #ffffff;
        font-weight: 700;
        font-size: 16px;
      }

      .auth__brand-name {
        font-size: var(--font-size-lg);
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .auth__slot {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .auth__footer {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        font-size: var(--font-size-xs);
        color: var(--color-text-subtle);
        margin-top: var(--space-6);
      }

      .auth__footer a {
        color: var(--color-text-subtle);
      }

      .auth__pitch {
        position: relative;
        display: flex;
        align-items: center;
        padding: var(--space-8);
        color: #ffffff;
        overflow: hidden;
        background:
          radial-gradient(circle at 20% 10%, rgba(14, 165, 164, 0.35), transparent 50%),
          radial-gradient(circle at 80% 90%, rgba(31, 111, 235, 0.35), transparent 55%),
          linear-gradient(180deg, #0b1220 0%, #0f172a 55%, #0a111f 100%);
      }

      .auth__pitch::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        mask-image: radial-gradient(ellipse at center, #000 40%, transparent 80%);
        pointer-events: none;
      }

      .pitch {
        position: relative;
        max-width: 520px;
      }

      .pitch__eyebrow {
        color: #93c5fd;
        font-size: var(--font-size-xs);
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-weight: 600;
        margin-bottom: var(--space-4);
      }

      .pitch__title {
        font-size: 36px;
        line-height: 1.15;
        color: #ffffff;
        margin-bottom: var(--space-4);
        letter-spacing: -0.02em;
      }

      .pitch__body {
        color: #cbd5e1;
        font-size: var(--font-size-md);
        margin-bottom: var(--space-6);
        max-width: 440px;
      }

      .pitch__list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .pitch__list li {
        color: #e2e8f0;
        font-size: var(--font-size-sm);
        padding-left: var(--space-4);
        position: relative;
      }

      .pitch__list li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 8px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #0ea5a4;
      }

      @media (max-width: 960px) {
        .auth { grid-template-columns: 1fr; }
        .auth__pitch { display: none; }
      }
    `,
  ],
})
export class AuthLayoutComponent {
  protected readonly appName = environment.appName;
  protected readonly year = new Date().getFullYear();
}
