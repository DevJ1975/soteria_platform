/**
 * Development environment config.
 *
 * Fill in the Supabase values below from your Supabase project dashboard:
 *   Project Settings → API → Project URL / anon public key.
 *
 * This file is intentionally committed (Angular needs it to build).
 * Do NOT place service_role keys or other secrets here — only the public
 * anon key is safe for a browser bundle.
 */
export const environment = {
  production: false,
  appName: 'Soteria',
  supabase: {
    url: '',
    anonKey: '',
  },
  /**
   * When true, the ModuleRegistry will ignore the database tenant_modules
   * table and enable every module. Useful while the backend is still empty.
   */
  enableAllModulesForLocalDev: true,
} as const;

export type AppEnvironment = typeof environment;
