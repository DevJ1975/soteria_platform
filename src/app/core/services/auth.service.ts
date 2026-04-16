import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { fullNameOf, UserProfile } from '../models';
import { SupabaseService } from './supabase.service';

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials extends SignInCredentials {
  fullName: string;
}

/**
 * AuthService owns the "who is signed in" state for the whole app.
 *
 * State is exposed as signals so templates read it synchronously. One-time
 * initialization (restoring the session from storage) is exposed as a
 * promise via {@link whenInitialized} so guards can await it.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _initialized = signal(false);
  private readonly _initPromise: Promise<void>;

  readonly session = this._session.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly initialized = this._initialized.asReadonly();

  /** Session exists — the profile row may still be loading. */
  readonly isSignedIn = computed(() => this._session() !== null);

  /** Session + profile both resolved. */
  readonly isAuthenticated = computed(
    () => this._session() !== null && this._profile() !== null,
  );

  readonly tenantId = computed(() => this._profile()?.tenantId ?? null);

  /** Convenience: "First Last" for the signed-in user (or empty string). */
  readonly fullName = computed(() => {
    const p = this._profile();
    return p ? fullNameOf(p) : '';
  });

  constructor() {
    this._initPromise = this.restoreSession();
    this.supabase.client.auth.onAuthStateChange((event, session) => {
      void this.handleAuthChange(event, session);
    });
  }

  /**
   * Resolves once the initial session-restore completes. Route guards await
   * this before deciding whether to redirect, so a hard refresh with a
   * valid session doesn't bounce through /auth/login on the way back.
   */
  whenInitialized(): Promise<void> {
    return this._initPromise;
  }

  async signIn({ email, password }: SignInCredentials): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

  async signUp({ email, password, fullName }: SignUpCredentials): Promise<void> {
    // full_name flows into `raw_user_meta_data` and is split into first/last
    // by the `handle_new_user` trigger on the database side.
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this._session.set(null);
    this._profile.set(null);
    await this.router.navigateByUrl('/auth/login');
  }

  private async restoreSession(): Promise<void> {
    try {
      const { data } = await this.supabase.client.auth.getSession();
      this._session.set(data.session);
      if (data.session) {
        await this.loadProfile(data.session.user.id);
      }
    } finally {
      this._initialized.set(true);
    }
  }

  private async handleAuthChange(
    event: AuthChangeEvent,
    session: Session | null,
  ): Promise<void> {
    this._session.set(session);

    if (event === 'SIGNED_OUT' || !session) {
      this._profile.set(null);
      return;
    }

    await this.loadProfile(session.user.id);
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('id, tenant_id, email, first_name, last_name, role, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[Soteria] Failed to load user profile', error);
      this._profile.set(null);
      return;
    }

    this._profile.set(data ? mapProfileRow(data) : null);
  }
}

/** Supabase speaks snake_case; the rest of the app speaks camelCase. */
function mapProfileRow(row: Record<string, unknown>): UserProfile {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    email: row['email'] as string,
    firstName: (row['first_name'] as string) ?? '',
    lastName: (row['last_name'] as string) ?? '',
    role: (row['role'] as UserProfile['role']) ?? 'worker',
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
