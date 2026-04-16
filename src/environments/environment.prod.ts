/**
 * Production environment config.
 *
 * In a real deployment these values should be injected at build time by CI
 * (GitHub Actions, Vercel, etc.) rather than committed to git.
 */
export const environment = {
  production: true,
  appName: 'Soteria',
  supabase: {
    url: '',
    anonKey: '',
  },
  enableAllModulesForLocalDev: false,
} as const;

export type AppEnvironment = typeof environment;
