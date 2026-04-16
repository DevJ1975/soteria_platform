# Soteria — Admin & Operator Guide

For tenant admins and the people running the Soteria platform.

> **About this guide**
> Last updated: **2026-04-16**. Updated in the same session as the code.
> When code and guide disagree, the code is authoritative — please flag
> the drift.

## Audiences

- **Tenant admins** — the person who signed up and owns an organization.
  Today, tenant admins mostly work through the app itself; dedicated
  admin UIs are coming.
- **Platform operators** — the team running Soteria (deploying the code,
  running migrations, maintaining the Supabase project). Most of this
  guide is for you.

## Table of contents

- [Architecture at a glance](#architecture-at-a-glance)
- [Tenant provisioning](#tenant-provisioning)
- [User roles](#user-roles)
- [Modules and toggling](#modules-and-toggling)
- [Database](#database)
- [Local dev setup](#local-dev-setup)
- [Supabase CLI](#supabase-cli)
- [Operations & rotation](#operations--rotation)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)

---

## Architecture at a glance

- **Frontend** — Angular 19 standalone app. Signals for state. Lazy-loaded
  feature routes under `/app/*`. The unauthenticated area lives at `/auth/*`.
- **Backend** — Supabase (Postgres + auth + storage + Row Level Security).
- **Tenancy** — every business row carries a `tenant_id`. RLS scopes reads
  and writes to the caller's tenant via `public.current_tenant_id()`.
- **Modularity** — feature modules (Inspections, Equipment Checks, etc.)
  can be turned on or off per tenant via the `tenant_modules` table. The
  sidebar and route guards read from that table.

Project layout summary:

```
src/app/
├── core/           singletons (services, models, guards)
├── shared/         dumb UI + utilities
├── layouts/        app shell + auth layout
└── features/       one folder per product area
    ├── auth/
    ├── dashboard/
    ├── inspections/        ← real module
    ├── equipment-checks/   ← placeholder
    └── corrective-actions/ ← placeholder

supabase/migrations/  timestamped SQL migrations (apply via Supabase CLI)
docs/                 these guides
```

---

## Tenant provisioning

When a user confirms their email, the trigger `public.handle_new_user`
fires `after insert on auth.users` and:

1. Creates a new row in `tenants` named `"<first-name>'s Organization"`
   with a slug derived from the email local-part plus a random suffix.
2. Creates a `user_profiles` row (id = `auth.users.id`) with
   `role = 'admin'` and `tenant_id` pointing at the new tenant.
3. Enables the three phase-1 modules (`inspections`, `equipment_checks`,
   `corrective_actions`) in `tenant_modules`.

This means **every new signup creates a new organization today**. Invite
flows — where an existing admin adds teammates who join the existing
tenant — will ship in a later phase.

Source: [supabase/migrations/20260416120000_initial_schema.sql](../supabase/migrations/20260416120000_initial_schema.sql).

---

## User roles

| Role | Can read | Inspections write | Inspections delete | CA write | CA delete | Tenant |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| `platform_admin` | all tenants | yes | yes | yes | yes | yes |
| `admin` | own tenant | yes | yes | yes | yes | yes |
| `supervisor` | own tenant | yes | yes | yes | yes | no |
| `worker` | own tenant | own/assigned only | no | own/assigned only | no | no |

CA = corrective actions. "own/assigned only" means workers can edit a
row only if they created it or are the current assignee.

Roles are enforced at the database level via RLS policies. Frontend
role-based UI (hiding buttons) is not yet implemented — a worker
clicking **Delete** today gets a server error rather than a disabled
button.

Changing someone's role is an SQL update against `user_profiles.role`
(e.g., from `worker` → `supervisor`). An admin UI for this is on the
roadmap.

---

## Modules and toggling

### Catalogue

The master list of modules lives in `public.modules`. `is_available`
gates at the platform level — when `false`, no tenant can enable the
module even if they try.

| Key | Name | Available today |
| --- | --- | :---: |
| `inspections` | Inspections | ✅ full UI |
| `equipment_checks` | Equipment | ✅ full UI (asset register + check history) |
| `corrective_actions` | Corrective Actions | ✅ full UI |
| `incidents` | Incidents & Near Misses | ✅ full UI |
| `toolbox_talks` | Toolbox Talks | ✅ full UI (sessions + attendance) |
| `heat_compliance` | Heat Compliance | not yet |
| `loto` | LOTO | not yet |

### Enabling or disabling for a tenant

No admin UI yet — toggle with SQL:

```sql
-- Disable inspections for a specific tenant
update public.tenant_modules
set is_enabled = false
where tenant_id = '<tenant-uuid>'
  and module_key = 'inspections';

-- Enable a module that isn't currently in tenant_modules
insert into public.tenant_modules (tenant_id, module_key, is_enabled)
values ('<tenant-uuid>', 'inspections', true);
```

Flipping `is_enabled` takes effect the next time the user loads the app
(or signs in). The sidebar hides the module and the per-module route
guard rejects direct URLs.

The frontend also holds a catalogue of icon + route metadata in
[core/services/module-registry.service.ts](../src/app/core/services/module-registry.service.ts).
To surface a **new** module, all three of these must be true:

1. A row in `public.modules` with `is_available = true`.
2. A row in `public.tenant_modules` with `is_enabled = true` for the tenant.
3. A matching entry in `MODULE_CATALOGUE` in the frontend.

---

## Database

### Tables

| Table | Purpose |
| --- | --- |
| `tenants` | One row per customer organization. |
| `user_profiles` | App-level user data. `id` matches `auth.users.id`. |
| `modules` | Platform catalogue of available modules. |
| `tenant_modules` | Per-tenant toggle + config for each module. |
| `inspections` | First business table — tenant-scoped inspection records. |
| `corrective_actions` | Remediation items. Optional FK to `inspections`. |
| `equipment` | Asset register. Unique asset tag per tenant. |
| `equipment_checks` | Check history against equipment. Denormalized tenant_id with alignment trigger. |
| `incident_reports` | Incidents, near misses, injuries, observations. |
| `training_sessions` | Toolbox talks / training events. |
| `training_attendance` | Per-attendee records. Denormalized tenant_id with alignment trigger. |

### RLS surface

Every tenant-scoped table has RLS enabled. Policies key off the helper
functions `public.current_tenant_id()` and `public.current_user_role()`
— reuse these in policies for new tables so the pattern stays uniform.

### Migrations

All migrations live in [supabase/migrations/](../supabase/migrations/)
and are applied in timestamp order. The Supabase CLI tracks applied
migrations in `supabase_migrations.schema_migrations`.

Current migrations:

| File | What it installs |
| --- | --- |
| `20260416120000_initial_schema.sql` | Core tables, indexes, `updated_at` triggers, module catalogue seed, `handle_new_user` provisioning trigger. |
| `20260416120001_row_level_security.sql` | `current_tenant_id()`, `current_user_role()`, and RLS policies for the four core tables. |
| `20260416120002_inspections.sql` | `inspections` table, enums, indexes, four RLS policies. |
| `20260416120003_corrective_actions.sql` | `corrective_actions` table, enums, indexes, four RLS policies. Nullable FK to `inspections` (`on delete set null`) so the audit trail survives inspection deletion. |
| `20260416120004_corrective_actions_cross_tenant_guard.sql` | Trigger rejecting cross-tenant `inspection_id` on corrective_actions. |
| `20260416120005_equipment.sql` | `equipment` table, enum, indexes, four RLS policies, per-tenant case-insensitive unique asset_tag. |
| `20260416120006_equipment_checks.sql` | `equipment_checks` table, enum, indexes, four RLS policies, cross-tenant alignment trigger. |
| `20260416120007_incident_reports.sql` | `incident_reports` table, three enums, indexes, four RLS policies. |
| `20260416120008_enable_incidents_module.sql` | Flips `modules.is_available = true` for `incidents`, backfills `tenant_modules` for existing tenants, updates `handle_new_user` to enable the module for new signups. |
| `20260416120009_training.sql` | `training_sessions` + `training_attendance` tables, indexes, cross-tenant alignment trigger, RLS (select tenant, write staff, delete admin on sessions; write staff on attendance). |
| `20260416120010_enable_toolbox_talks_module.sql` | Same three-step activation as incidents: flip `is_available`, backfill, extend trigger. |
| `20260416120011_corrective_actions_cross_module_linkage.sql` | Adds `incident_report_id` and `equipment_check_id` FKs on `corrective_actions`. Replaces the inspection-only cross-tenant trigger with a unified one that validates all three linkage FKs. |
| `20260416120012_dashboard_summary_views.sql` | Five aggregate views (one per module) powering the dashboard KPI row. Declared with `security_invoker = on` so they inherit the underlying tables' RLS. |

---

## Local dev setup

### Prerequisites

- Node.js 20 LTS (`node --version`)
- npm 10+ (`npm --version`)
- A Supabase project (free tier is fine)

If you don't have Node, install via nvm (user-scoped, no sudo):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# open a new terminal so nvm loads
nvm install 20 && nvm use 20
```

### Install dependencies

```bash
cd ~/Documents/soteria_platform-1
npm install
```

### Configure Supabase credentials

Edit [src/environments/environment.ts](../src/environments/environment.ts):

```ts
supabase: {
  url:     'https://YOUR-PROJECT.supabase.co',
  anonKey: 'YOUR-PUBLIC-ANON-KEY',
},
enableAllModulesForLocalDev: false,
```

Get the values from **Supabase → Project Settings → API**. Only paste
the **anon public** key, never the `service_role` key.

Set `enableAllModulesForLocalDev: true` only when the DB has no seed
data — it bypasses the `tenant_modules` lookup and lights up every
available module so you can explore.

### Run

```bash
npm start
# → http://localhost:4200
```

Common commands:

| Command | What it does |
| --- | --- |
| `npm start` | Dev server |
| `npm run build` | Production build → `dist/soteria` |
| `npm run watch` | Dev build with file watching |
| `npm test` | Karma/Jasmine tests |

---

## Supabase CLI

### Install (no sudo)

```bash
mkdir -p ~/.local/bin
cd /tmp
curl -fsSL -o supabase.tar.gz \
  "https://github.com/supabase/cli/releases/latest/download/supabase_darwin_arm64.tar.gz"
tar -xzf supabase.tar.gz
mv supabase ~/.local/bin/supabase
chmod +x ~/.local/bin/supabase
```

Substitute `darwin_amd64` on Intel Macs or `linux_amd64` on Linux. To put
`supabase` on your PATH: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`.

### Authenticate

Either:

- Run `~/.local/bin/supabase login` (opens browser for OAuth), or
- Export a personal access token before each command:
  ```bash
  export SUPABASE_ACCESS_TOKEN=sbp_xxx
  ```

Tokens live at https://supabase.com/dashboard/account/tokens. Rotate
when no longer needed.

### Link and apply migrations

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx ~/.local/bin/supabase link \
  --project-ref jfrtkntiafvczduyrwed

SUPABASE_ACCESS_TOKEN=sbp_xxx ~/.local/bin/supabase db push --linked
```

### Verify state

```bash
# Which migrations are applied
~/.local/bin/supabase migration list --linked

# Ad-hoc queries
~/.local/bin/supabase db query --linked \
  "select key, name, is_available from public.modules order by sort_order;"
```

---

## Operations & rotation

- **Access tokens** rotate at https://supabase.com/dashboard/account/tokens.
  If you've shared one with a collaborator or pasted it into a log,
  treat it as compromised and mint a new one.
- **Anon keys** can be rotated from Project Settings → API. Rotating
  invalidates existing sessions — all users will need to sign in again.
- **Supabase/.temp/** in the repo is machine-local CLI state and is
  gitignored. Safe to delete; the next `supabase link` rebuilds it.

---

## Troubleshooting

**"Signed up but the sidebar is empty."**
The `handle_new_user` trigger didn't fire. Check
`select * from public.user_profiles where id = auth.uid();` — if no row
exists, the trigger errored. Postgres logs in the Supabase dashboard
have the details.

**"Module should be visible but isn't showing."**
Three things must all be true:
1. `modules.is_available = true` for that key.
2. `tenant_modules.is_enabled = true` for the current tenant + module.
3. `MODULE_CATALOGUE` (in
   [core/services/module-registry.service.ts](../src/app/core/services/module-registry.service.ts))
   has `isAvailable: true` for that key.

Missing any one hides the module. In dev, you can bypass #2 by setting
`enableAllModulesForLocalDev: true` temporarily.

**"Got a PostgREST error about RLS."**
Either the RLS policy is too strict, or the caller doesn't have the
expected role / tenant. Check `public.user_profiles` for the signed-in
user and confirm `tenant_id` matches the row they're trying to access.

**"`supabase db push` changes don't show up in the app."**
You're probably linked to a different project. `supabase/config.toml`
pins `project_id` — confirm it matches the Supabase project you're
looking at.

**"Access token rotated, what now?"**
Run `supabase link` again with the new token in env. The cached state
in `supabase/.temp/` is regenerated automatically.

**"Login redirects me to /app/dashboard but the page is blank."**
Usually a profile-loading issue. Open DevTools → Network and look for
the `user_profiles` request. If it 404s, the trigger didn't fire (see
above). If it succeeds but returns `null`, the signed-in user's id
isn't in `user_profiles` — re-run the trigger manually or delete the
auth.users row and sign up again.

---

## Deployment

Not yet. Target is Cloudflare Pages for the Angular build plus the
existing Supabase project. Full deploy instructions — including
environment injection for the anon key and setting up preview
deployments on pull requests — will land in this guide when we ship the
first production release.

Until then, the app runs locally via `npm start`. The live Supabase
project (`jfrtkntiafvczduyrwed`) is the source of truth for schema and
data.
