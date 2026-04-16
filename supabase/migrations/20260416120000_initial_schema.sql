-- ============================================================================
-- Soteria — Initial schema
-- Tables: tenants, user_profiles, modules, tenant_modules
--
-- Design notes
-- ------------
-- * `user_profiles.id` is the same UUID as `auth.users.id` — one-to-one. This
--   lets RLS policies key off `auth.uid()` directly without a join.
-- * `tenant_modules.module_key` is the natural key (string) rather than the
--   module's uuid. Code and routes reference the key, so joining on it keeps
--   queries readable. The FK on `modules(key)` still enforces integrity.
-- * The `handle_new_user` trigger provisions a brand-new tenant for every
--   confirmed sign-up. When invite flows land (phase 3) the trigger will
--   first check for a pending invite and attach the user to that tenant
--   instead of creating a new one.
-- ============================================================================

-- Required extensions ---------------------------------------------------------
create extension if not exists pgcrypto;

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum (
    'platform_admin',
    'admin',
    'supervisor',
    'worker'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tenant_status as enum (
    'trial',
    'active',
    'suspended',
    'cancelled'
  );
exception when duplicate_object then null; end $$;


-- Shared updated_at trigger function -----------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Tenants ---------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  status      public.tenant_status not null default 'trial',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tenants_slug_idx on public.tenants (slug);

create trigger tenants_touch_updated_at
  before update on public.tenants
  for each row execute function public.touch_updated_at();


-- User profiles ---------------------------------------------------------------
create table public.user_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  email       text not null,
  first_name  text not null default '',
  last_name   text not null default '',
  role        public.user_role not null default 'worker',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index user_profiles_tenant_id_idx on public.user_profiles (tenant_id);
create index user_profiles_email_idx     on public.user_profiles (email);

create trigger user_profiles_touch_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();


-- Modules (platform catalogue) ------------------------------------------------
create table public.modules (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  description   text not null default '',
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);


-- Tenant <-> module toggle ----------------------------------------------------
create table public.tenant_modules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  module_key  text not null references public.modules (key) on update cascade,
  is_enabled  boolean not null default true,
  config      jsonb  not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, module_key)
);

create index tenant_modules_tenant_id_idx on public.tenant_modules (tenant_id);
create index tenant_modules_module_key_idx on public.tenant_modules (module_key);

create trigger tenant_modules_touch_updated_at
  before update on public.tenant_modules
  for each row execute function public.touch_updated_at();


-- Seed the module catalogue ---------------------------------------------------
insert into public.modules (key, name, description, sort_order, is_available)
values
  ('inspections',         'Inspections',             'Schedule and complete safety inspections.',        10, true),
  ('equipment_checks',    'Equipment Checks',        'Pre-use checks for vehicles, tools, and PPE.',     20, true),
  ('corrective_actions',  'Corrective Actions',      'Track findings through to resolution.',            30, true),
  ('incidents',           'Incidents & Near Misses', 'Report and investigate safety events.',            40, false),
  ('toolbox_talks',       'Toolbox Talks',           'Deliver and acknowledge safety briefings.',        50, false),
  ('heat_compliance',     'Heat Compliance',         'Monitor heat exposure and enforce policy.',        60, false),
  ('loto',                'LOTO',                    'Lockout/tagout procedures and sign-offs.',         70, false)
on conflict (key) do nothing;


-- Provisioning trigger: new auth.users → tenant + profile + default modules ---
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
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

  -- Slug from the email local-part plus a random tail so it's unique.
  v_slug := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g')
            || '-' || substring(gen_random_uuid()::text, 1, 8);

  insert into public.tenants (name, slug)
  values (
    coalesce(v_first, split_part(new.email, '@', 1)) || '''s Organization',
    v_slug
  )
  returning id into v_tenant_id;

  insert into public.user_profiles (id, tenant_id, email, first_name, last_name, role)
  values (
    new.id,
    v_tenant_id,
    new.email,
    coalesce(v_first, ''),
    coalesce(v_last, ''),
    'admin' -- the user who provisions the tenant owns it
  );

  -- Enable the three phase-1 modules by default.
  insert into public.tenant_modules (tenant_id, module_key, is_enabled)
  select v_tenant_id, key, true
  from public.modules
  where is_available = true
    and key in ('inspections', 'equipment_checks', 'corrective_actions');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
