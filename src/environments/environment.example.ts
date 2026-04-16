/**
 * Copy this file to `environment.ts` (and `environment.prod.ts` for builds)
 * and fill in the Supabase values from your Supabase project dashboard.
 */
export const environment = {
  production: false,
  appName: 'Soteria',
  supabase: {
    url: 'https://YOUR-PROJECT.supabase.co',
    anonKey: 'YOUR-PUBLIC-ANON-KEY',
  },
  enableAllModulesForLocalDev: true,
} as const;

export type AppEnvironment = typeof environment;
