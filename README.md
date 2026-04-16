# Soteria Platform

Mobile-first safety operations SaaS for high-risk industries. This repo is
the web frontend + Supabase integration.

## Phase 1 — what's in here

- Angular 19 standalone app with signals, lazy-loaded routes, and strict TS
- Supabase JS client wrapped in a single DI service
- Auth: email/password sign-in + sign-up, session restore, sign-out
- Route guards: `authGuard`, `publicOnlyGuard`, `moduleGuard(key)`
- Multi-tenant core models: `Tenant`, `UserProfile`, `Module`, `TenantModule`
- Feature-flag-style module registry driven by `tenant_modules`
- Authenticated shell (sidebar + topbar) and auth layout (split pane)
- Dashboard + placeholder pages for Inspections, Equipment Checks,
  Corrective Actions
- Design tokens in CSS custom properties — easy to theme later

## Run it locally

### Prerequisites
- **Node.js 20 LTS** (or newer). Check with `node --version`.
- **npm 10+** (ships with Node 20). Check with `npm --version`.
- A **Supabase project** — free tier is fine. From the Supabase dashboard,
  grab **Project Settings → API → Project URL** and the **anon public key**.

### Steps

```bash
# 1. From the repo root, install the Angular CLI locally (optional — you can
#    also run it via npx) and install dependencies.
npm install

# 2. Open src/environments/environment.ts and paste in your Supabase values:
#       supabase: {
#         url:     'https://YOUR-PROJECT.supabase.co',
#         anonKey: 'YOUR-PUBLIC-ANON-KEY',
#       }
#    Leave `enableAllModulesForLocalDev: true` for now — it lights up every
#    module in the sidebar without requiring any seed data in the database.

# 3. Start the dev server.
npm start
# → http://localhost:4200 — redirects to /auth/login

# 4. Create an account at /auth/signup. Supabase will email a confirmation
#    link; click it, then sign in. (In a real deployment you'll want a
#    database trigger to provision tenants + user profiles on confirmation.
#    See "Next phases" below — for local-dev exploration the app shell
#    works with an empty backend because of the dev flag in step 2.)
```

### Common commands

| Command         | What it does                               |
| --------------- | ------------------------------------------ |
| `npm start`     | Dev server at http://localhost:4200        |
| `npm run build` | Production build → `dist/soteria`          |
| `npm run watch` | Development build with file watching      |
| `npm test`      | Karma/Jasmine unit tests                  |

### Supabase schema

The full schema, seed, provisioning trigger, and RLS policies live in
[`supabase/migrations/`](supabase/migrations/). Apply both files in order
(via the SQL editor or `supabase db push`) — see
[`supabase/README.md`](supabase/README.md) for step-by-step instructions.

Summary of what the migrations install:

| Table            | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `tenants`        | One row per customer organization                |
| `user_profiles`  | App-level user data, `id` = `auth.users.id`     |
| `modules`        | Platform catalogue of available modules          |
| `tenant_modules` | Per-tenant toggle + config for each module       |

The migrations also install:

- A `handle_new_user` trigger that provisions a tenant + profile + default
  modules on every sign-up.
- `public.current_tenant_id()` and `public.current_user_role()` SQL
  helpers for use in RLS policies.
- RLS policies that scope every tenant-owned row to the caller's tenant.

With RLS enabled you can drop `enableAllModulesForLocalDev` to `false`
in `environment.ts` — the sidebar will then reflect real `tenant_modules`
rows for the signed-in user.

## Project structure

```
src/
├── environments/              Dev / prod / example config
├── app/
│   ├── app.component.ts       Root shell (just <router-outlet>)
│   ├── app.config.ts          Providers (router, zone, etc.)
│   ├── app.routes.ts          Top-level routes + per-module guards
│   ├── core/                  Singletons — no UI, safe to import anywhere
│   │   ├── models/            Tenant, UserProfile, Module, TenantModule
│   │   ├── services/          SupabaseService, AuthService, TenantService,
│   │   │                      ModuleRegistryService
│   │   └── guards/            authGuard, publicOnlyGuard, moduleGuard(key)
│   ├── shared/                Dumb, reusable UI — no feature logic
│   │   └── components/        page-header, stat-tile, empty-state
│   ├── layouts/               Chrome
│   │   ├── auth-layout/       Two-pane layout for /auth/*
│   │   └── app-shell/         Sidebar + topbar + routed content
│   └── features/              One folder per product area
│       ├── auth/              Login, Signup, auth routes
│       ├── dashboard/         KPI tiles + getting-started panel
│       ├── inspections/       Placeholder
│       ├── equipment-checks/  Placeholder
│       └── corrective-actions/ Placeholder
```

Path aliases are configured in `tsconfig.json`:

| Alias         | Resolves to          |
| ------------- | -------------------- |
| `@core/*`     | `src/app/core/*`     |
| `@shared/*`   | `src/app/shared/*`   |
| `@features/*` | `src/app/features/*` |
| `@layouts/*`  | `src/app/layouts/*`  |
| `@env/*`      | `src/environments/*` |

## Conventions

- **Standalone components only.** No NgModules.
- **Signals for state.** RxJS is fine for one-off async flows; prefer
  signals for anything a template binds to.
- **Component selectors** are prefixed with `sot-`.
- **Schematics default to OnPush + SCSS** (see `angular.json`).
- **DB ↔ domain boundary:** Supabase speaks snake_case; the app speaks
  camelCase. Map in the service layer, never in components.

## Next phases (suggested)

1. **Tenant provisioning**
   - Database triggers to create a `tenants` row and a `user_profiles`
     row on first email confirmation.
   - Invite flow (tenant admin invites users by email → they join the
     existing tenant instead of creating a new one).
2. **Role-based UI**
   - A `RoleDirective` (`*sotRole="'supervisor'"`) that hides controls
     for roles that can't use them, backed by Supabase RLS on the server.
3. **First real module: Inspections**
   - Templates (JSON schema of questions)
   - Assignments
   - Field-friendly mobile-first submission flow with offline queue
4. **Corrective Actions MVP**
   - Created from inspection findings
   - SLAs, reminders, sign-off
5. **Native mobile app**
   - Share the Supabase models + auth flow; re-implement UI in the
     framework of choice (React Native, Ionic, or Flutter).
6. **Billing**
   - Stripe Customer per tenant; `planId` on the tenant row drives
     entitlements; module availability respects plan tier.
