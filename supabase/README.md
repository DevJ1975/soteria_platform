# Supabase

SQL migrations for the Soteria backend.

## Files

- `migrations/20260416120000_initial_schema.sql` — tables, indexes, the
  module catalogue seed, and a `handle_new_user` trigger that provisions a
  tenant + profile + default modules on sign-up.
- `migrations/20260416120001_row_level_security.sql` — RLS policies scoping
  every tenant-owned row to `auth.uid()`'s tenant.

## Apply the migrations

### Option A — Supabase SQL editor (fastest)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste `20260416120000_initial_schema.sql` and run it.
3. Paste `20260416120001_row_level_security.sql` and run it.

### Option B — Supabase CLI (recommended for real projects)

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

The CLI tracks applied migrations in `supabase_migrations.schema_migrations`
so you can re-run safely.

## Verify

After applying, you should be able to:

```sql
-- Catalogue is seeded
select key, name, is_available from public.modules order by sort_order;

-- RLS is on
select relname, relrowsecurity
from pg_class
where relname in ('tenants', 'user_profiles', 'modules', 'tenant_modules');
```

Then sign up a new user from the app — you should see a fresh row in each
of `tenants`, `user_profiles`, and three rows in `tenant_modules`.

## What the provisioning trigger does

On every insert into `auth.users` (i.e. after email confirmation):

1. Creates a new `tenants` row named `"<first-name>'s Organization"`
   with a slug derived from the email local-part plus a random suffix.
2. Creates a `user_profiles` row with `role = 'admin'` pointing at that
   new tenant.
3. Enables the three phase-1 modules (`inspections`, `equipment_checks`,
   `corrective_actions`) in `tenant_modules`.

When invite flows are added in a later phase, the trigger will first look
for a pending invite for the user's email and attach them to that tenant
instead of creating a new one.
