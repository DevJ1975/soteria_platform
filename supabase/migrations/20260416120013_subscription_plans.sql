-- ============================================================================
-- Soteria — Subscription plans + module override semantics
--
-- Turns the modules system from a flat per-tenant `is_enabled` flag into
-- a proper two-layer access model:
--
--   1. Plan defaults — the tenant's subscription plan determines which
--      modules are enabled by default.
--   2. Per-tenant overrides — `tenant_modules` rows now represent
--      explicit overrides on top of the plan default. No row = plan
--      default applies. Row present = override wins.
--
-- A third layer, `modules.is_core`, marks modules that are always on
-- regardless of plan (none yet; the column exists so future modules
-- like "Dashboard" or "Notifications" can opt into always-enabled
-- without forcing them into every plan).
--
-- Why reuse the existing `modules` table instead of creating
-- `platform_modules`
-- ------------------------------------------------------------------------
-- The existing `modules` table (migration 120000) already is the
-- platform module catalogue — same shape, same purpose. Renaming would
-- cascade through eight migrations, the provisioning trigger, the
-- frontend `MODULE_CATALOGUE`, every existing `tenant_modules` FK, and
-- the `ModuleKey` type union. Zero functional benefit. We add an
-- `is_core` column to match the requested spec and move on.
-- ============================================================================

-- 1. Add is_core to the existing modules table ------------------------------
alter table public.modules
  add column if not exists is_core boolean not null default false;


-- 2. Subscription plans -----------------------------------------------------
create table public.subscription_plans (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  description   text not null default '',
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index subscription_plans_key_idx on public.subscription_plans (key);


-- 3. Plan → module mapping --------------------------------------------------
-- Keyed by the plan's uuid and the module's string key (modules.key is
-- unique and what the rest of the app speaks in). Unique per pair — a
-- module is either in a plan or it isn't.
create table public.subscription_plan_modules (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.subscription_plans (id) on delete cascade,
  module_key  text not null references public.modules (key) on update cascade,
  created_at  timestamptz not null default now(),
  unique (plan_id, module_key)
);

create index subscription_plan_modules_plan_id_idx
  on public.subscription_plan_modules (plan_id);


-- 4. Add plan_id to tenants --------------------------------------------------
-- Nullable so existing tenants can be assigned programmatically below
-- before we enforce a not-null constraint (which we don't — keep it
-- nullable to support edge cases like a tenant between plans).
alter table public.tenants
  add column if not exists plan_id uuid references public.subscription_plans (id) on delete set null;

create index tenants_plan_id_idx on public.tenants (plan_id);


-- 5. Seed plans --------------------------------------------------------------
insert into public.subscription_plans (key, name, description, sort_order)
values
  ('starter', 'Starter',
    'Essentials for small teams: inspections and corrective actions.', 10),
  ('growth',  'Growth',
    'Adds equipment checks and incident reporting.',                   20),
  ('pro',     'Pro',
    'Everything Soteria offers, including training records.',          30)
on conflict (key) do nothing;


-- 6. Seed plan ↔ module mapping ---------------------------------------------
-- Starter: inspections + corrective_actions
-- Growth:  Starter + equipment_checks + incidents
-- Pro:     Growth + toolbox_talks
insert into public.subscription_plan_modules (plan_id, module_key)
select p.id, m.module_key
from public.subscription_plans p
cross join lateral (values
  ('inspections'),
  ('corrective_actions')
) as m (module_key)
where p.key = 'starter'
on conflict (plan_id, module_key) do nothing;

insert into public.subscription_plan_modules (plan_id, module_key)
select p.id, m.module_key
from public.subscription_plans p
cross join lateral (values
  ('inspections'),
  ('corrective_actions'),
  ('equipment_checks'),
  ('incidents')
) as m (module_key)
where p.key = 'growth'
on conflict (plan_id, module_key) do nothing;

insert into public.subscription_plan_modules (plan_id, module_key)
select p.id, m.module_key
from public.subscription_plans p
cross join lateral (values
  ('inspections'),
  ('corrective_actions'),
  ('equipment_checks'),
  ('incidents'),
  ('toolbox_talks')
) as m (module_key)
where p.key = 'pro'
on conflict (plan_id, module_key) do nothing;


-- 7. Assign existing tenants to Pro ----------------------------------------
-- Preserves their current "everything enabled" behaviour. New signups
-- default to Starter via the updated handle_new_user trigger below.
update public.tenants
set plan_id = (select id from public.subscription_plans where key = 'pro')
where plan_id is null;


-- 8. Update handle_new_user to assign the Starter plan ---------------------
-- Drops the hardcoded tenant_modules inserts. Plan defaults now govern
-- module access; tenant_modules is reserved for explicit overrides.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_plan_id   uuid;
  v_slug      text;
  v_full_name text;
  v_first     text;
  v_last      text;
begin
  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_first := nullif(split_part(v_full_name, ' ', 1), '');
  v_last  := nullif(
    case when position(' ' in v_full_name) > 0
         then substring(v_full_name from position(' ' in v_full_name) + 1)
         else ''
    end, ''
  );

  v_slug := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g')
            || '-' || substring(gen_random_uuid()::text, 1, 8);

  -- Default new signups to the Starter plan. Billing layer will drive
  -- this via upgrade flows when it lands.
  select id into v_plan_id from public.subscription_plans where key = 'starter';

  insert into public.tenants (name, slug, plan_id)
  values (
    coalesce(v_first, split_part(new.email, '@', 1)) || '''s Organization',
    v_slug,
    v_plan_id
  )
  returning id into v_tenant_id;

  insert into public.user_profiles (id, tenant_id, email, first_name, last_name, role)
  values (
    new.id,
    v_tenant_id,
    new.email,
    coalesce(v_first, ''),
    coalesce(v_last, ''),
    'admin'
  );

  -- No more hardcoded tenant_modules inserts. Plan defaults take care
  -- of initial module access; tenant_modules rows are now overrides.

  return new;
end;
$$;


-- 9. Row Level Security -----------------------------------------------------
-- Plans and plan-module mappings are platform-wide catalogues (same
-- shape as `modules`). Anyone authenticated can read them; only
-- platform superusers can modify them (no insert/update/delete policy —
-- changes happen via migration).

alter table public.subscription_plans         enable row level security;
alter table public.subscription_plan_modules  enable row level security;

create policy subscription_plans_select_authenticated
  on public.subscription_plans
  for select
  using (auth.uid() is not null);

create policy subscription_plan_modules_select_authenticated
  on public.subscription_plan_modules
  for select
  using (auth.uid() is not null);

-- The tenants table already has RLS from migration 120001; the new
-- plan_id column inherits those policies automatically. Admins can
-- update their own tenant's plan via the existing tenants_update_by_admin
-- policy — no change needed here.
