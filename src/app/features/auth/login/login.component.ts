import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'sot-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login">
      <h1 class="login__title">Sign in</h1>
      <p class="login__subtitle">Welcome back — enter your credentials to continue.</p>

      @if (errorMessage()) {
        <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="sot-form-field">
          <label class="sot-label" for="email">Work email</label>
          <input
            id="email"
            type="email"
            autocomplete="email"
            class="sot-input"
            formControlName="email"
          />
        </div>

        <div class="sot-form-field">
          <label class="sot-label" for="password">Password</label>
          <input
            id="password"
            type="password"
            autocomplete="current-password"
            class="sot-input"
            formControlName="password"
          />
        </div>

        <button
          type="submit"
          class="sot-btn sot-btn--primary login__submit"
          [disabled]="form.invalid || submitting()"
        >
          {{ submitting() ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p class="login__footer">
        Don't have an account?
        <a routerLink="/auth/signup">Create one</a>
      </p>
    </div>
  `,
  styles: [
    `
      .login {
        max-width: 360px;
        width: 100%;
      }

      .login__title {
        font-size: var(--font-size-xl);
        margin-bottom: var(--space-1);
      }

      .login__subtitle {
        color: var(--color-text-muted);
        margin-bottom: var(--space-5);
      }

      .login__submit {
        width: 100%;
        height: 44px;
      }

      .login__footer {
        margin-top: var(--space-5);
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        text-align: center;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      await this.auth.signIn(this.form.getRawValue());
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/app';
      await this.router.navigateByUrl(returnUrl);
    } catch (err) {
      this.errorMessage.set(extractMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
