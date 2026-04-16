import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'sot-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="signup">
      <h1 class="signup__title">Create your account</h1>
      <p class="signup__subtitle">
        We'll send a confirmation email. Your organization will be provisioned
        on first sign-in.
      </p>

      @if (errorMessage()) {
        <div class="sot-alert sot-alert--error" role="alert">{{ errorMessage() }}</div>
      }
      @if (successMessage()) {
        <div class="sot-alert sot-alert--info" role="status">{{ successMessage() }}</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="sot-form-field">
          <label class="sot-label" for="fullName">Full name</label>
          <input
            id="fullName"
            type="text"
            autocomplete="name"
            class="sot-input"
            formControlName="fullName"
          />
        </div>

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
            autocomplete="new-password"
            class="sot-input"
            formControlName="password"
          />
        </div>

        <button
          type="submit"
          class="sot-btn sot-btn--primary signup__submit"
          [disabled]="form.invalid || submitting()"
        >
          {{ submitting() ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="signup__footer">
        Already have an account?
        <a routerLink="/auth/login">Sign in</a>
      </p>
    </div>
  `,
  styles: [
    `
      .signup {
        max-width: 380px;
        width: 100%;
      }

      .signup__title {
        font-size: var(--font-size-xl);
        margin-bottom: var(--space-1);
      }

      .signup__subtitle {
        color: var(--color-text-muted);
        margin-bottom: var(--space-5);
      }

      .signup__submit {
        width: 100%;
        height: 44px;
      }

      .signup__footer {
        margin-top: var(--space-5);
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        text-align: center;
      }
    `,
  ],
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      await this.auth.signUp(this.form.getRawValue());
      this.successMessage.set(
        'Check your email for a confirmation link to finish setting up your account.',
      );
      this.form.reset();
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
