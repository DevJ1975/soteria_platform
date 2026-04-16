import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '@env/environment';

/**
 * Thin wrapper around the Supabase JS client.
 *
 * Everything that talks to Supabase should go through this service (or a
 * feature service that depends on it) so we have a single place to configure
 * auth persistence, interceptors, schema pinning, and telemetry.
 *
 * We deliberately don't expose the client as a public field; instead feature
 * services call `client` and get back a ready-to-use instance. That lets us
 * swap the transport or add caching later without touching every call site.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly _client: SupabaseClient;

  constructor() {
    const { url, anonKey } = environment.supabase;

    if (!url || !anonKey) {
      // Fail loudly in dev rather than silently producing 401s at runtime.
      // eslint-disable-next-line no-console
      console.warn(
        '[Soteria] Supabase URL or anon key is missing. ' +
          'Set them in src/environments/environment.ts before signing in.',
      );
    }

    this._client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  get client(): SupabaseClient {
    return this._client;
  }
}
