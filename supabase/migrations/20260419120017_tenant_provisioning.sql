-- ============================================================================
-- Soteria — Tenant provisioning layer (Phase 14)
--
-- Three new tables plus a transactional RPC that rolls up
-- "create a full tenant environment" into one call. Extends the
-- existing handle_new_user trigger to support invited users so the
-- admin-provisioning flow can land them in the right tenant on first
-- signin.
--
-- What this phase does NOT change
-- -------------------------------
-- * Billing: the tenants_create_subscription trigger still fires on
--   tenant insert. Subscription remains the source of truth.
-- * Self-signup path in handle_new_user: preserved as the fallback
--   branch. New invite branch sits above it.
-- * Module resolution: the new tables are orthogonal to it.
-- ============================================================================

-- Extensions (no-op if already installed) ---------------------------------
create extension if not exists pgcrypto;


-- Sites --------------------------------------------------------------------
-- A tenant's physical / logical place-of-work. Every tenant has at
-- least one default site so the mobile app always has somewhere to
-- land. Timezone is per-site (not per-tenant) because large customers
-- will span regions.

create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  slug        text not null,
  site_type   text,
  status      text not null default 'active',
  timezone    text not null default 'UTC',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, slug)
);

comment on table public.sites is
  'Per-tenant locations/workspaces. Every tenant has one is_default=true site.';

create index if not exists idx_sites_tenant_id on public.sites(tenant_id);

-- Exactly one default per tenant. Enforced by a partial unique index
-- rather than app code so a concurrent "set default" race can't land
-- us with two.
create unique index if not exists sites_one_default_per_tenant
  on public.sites(tenant_id)
  where is_default = true;

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.touch_updated_at();


-- User site memberships ---------------------------------------------------
-- Many-to-many: a user can belong to several sites inside their
-- tenant; each user has exactly one primary site (what the mobile app
-- lands on). `role_at_site` is nullable — null means "inherit the
-- tenant-level role from user_profiles.role"; a future per-site
-- override lands here without a schema change.

create table if not exists public.user_site_memberships (
  id               uuid primary key default gen_random_uuid(),
  user_profile_id  uuid not null references public.user_profiles(id) on delete cascade,
  site_id          uuid not null references public.sites(id) on delete cascade,
  is_primary       boolean not null default false,
  role_at_site     text,
  created_at       timestamptz not null default now(),
  unique (user_profile_id, site_id)
);

comment on table public.user_site_memberships is
  'User-to-site assignments. Exactly one is_primary=true per user.';

create index if not exists idx_usm_user on public.user_site_memberships(user_profile_id);
create index if not exists idx_usm_site on public.user_site_memberships(site_id);

create unique index if not exists usm_one_primary_per_user
  on public.user_site_memberships(user_profile_id)
  where is_primary = true;


-- Tenant settings ----------------------------------------------------------
-- Flexible per-tenant config split into three JSONB buckets so the
-- columns are self-documenting about intent.
--
--   branding: logos, colors, display name overrides
--   mobile_settings: mobile-app behavior flags
--   feature_settings: miscellaneous feature toggles (not per-module;
--                     module access is still governed by tenant_modules)

create table if not exists public.tenant_settings (
  tenant_id         uuid primary key references public.tenants(id) on delete cascade,
  branding          jsonb not null default '{}'::jsonb,
  mobile_settings   jsonb not null default '{}'::jsonb,
  feature_settings  jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.tenant_settings is
  'Per-tenant configuration in three JSONB buckets.';

create trigger tenant_settings_set_updated_at
  before update on public.tenant_settings
  for each row execute function public.touch_updated_at();


-- Default mobile settings helper ------------------------------------------
-- Centralizes the baseline so the auto-create trigger, the RPC, and
-- future migrations that change defaults stay in lockstep.

create or replace function public.default_mobile_settings()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'default_landing_module', 'inspections',
    'enable_camera_uploads',  true,
    'enable_qr_scanning',     true,
    'offline_drafts_enabled', true
  );
$$;


-- Ensure every tenant has a site + settings -------------------------------
-- Runs AFTER INSERT on tenants. Intentionally idempotent (ON CONFLICT
-- DO NOTHING) so the RPC can UPDATE the default site with operator-
-- provided values after the trigger fires — no duplicate row, no lost
-- writes.

create or replace function public.ensure_tenant_environment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sites (tenant_id, name, slug, timezone, is_default)
  values (new.id, 'Default site', 'default', 'UTC', true)
  on conflict do nothing;

  insert into public.tenant_settings (tenant_id, mobile_settings)
  values (new.id, public.default_mobile_settings())
  on conflict (tenant_id) do nothing;

  return new;
end;
$$;

create trigger tenants_ensure_environment
  after insert on public.tenants
  for each row execute function public.ensure_tenant_environment();


-- Ensure every user_profile has a primary site membership ----------------
-- Links the user to their tenant's default site on insert. Idempotent
-- for the (user, site) pair.

create or replace function public.ensure_user_primary_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_site uuid;
begin
  select id into v_default_site
    from public.sites
   where tenant_id = new.tenant_id
     and is_default = true
   limit 1;

  if v_default_site is not null then
    insert into public.user_site_memberships (user_profile_id, site_id, is_primary)
    values (new.id, v_default_site, true)
    on conflict (user_profile_id, site_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger user_profiles_ensure_membership
  after insert on public.user_profiles
  for each row execute function public.ensure_user_primary_membership();


-- Backfill existing tenants ------------------------------------------------
-- Fires the same logic as the AFTER INSERT triggers would have —
-- guarantees the new invariants hold for rows that existed before
-- this migration.

insert into public.sites (tenant_id, name, slug, timezone, is_default)
select t.id, 'Default site', 'default', 'UTC', true
  from public.tenants t
 where not exists (
   select 1 from public.sites s where s.tenant_id = t.id and s.is_default = true
 )
on conflict do nothing;

insert into public.tenant_settings (tenant_id, mobile_settings)
select t.id, public.default_mobile_settings()
  from public.tenants t
 where not exists (
   select 1 from public.tenant_settings ts where ts.tenant_id = t.id
 );

insert into public.user_site_memberships (user_profile_id, site_id, is_primary)
select up.id, s.id, true
  from public.user_profiles up
  join public.sites s on s.tenant_id = up.tenant_id and s.is_default = true
 where not exists (
   select 1 from public.user_site_memberships m where m.user_profile_id = up.id
 );


-- handle_new_user: invite-aware branch ------------------------------------
-- When an Edge Function invites a user via auth.admin.inviteUserByEmail
-- with `soteria_tenant_id` in the invite metadata, this trigger sees
-- that marker and links the new user to the existing tenant rather
-- than self-signing them up.
--
-- Self-signup (no metadata marker) behavior is preserved below.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_tenant_id uuid;
  v_invite_role      public.user_role;
  v_full_name        text;
  v_first            text;
  v_last             text;
  v_tenant_id        uuid;
  v_plan_id          uuid;
  v_slug             text;
begin
  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_first := nullif(split_part(v_full_name, ' ', 1), '');
  v_last  := nullif(
    case when position(' ' in v_full_name) > 0
         then substring(v_full_name from position(' ' in v_full_name) + 1)
         else ''
    end, ''
  );

  -- Invite path ---------------------------------------------------------
  v_invite_tenant_id := nullif(
    new.raw_user_meta_data ->> 'soteria_tenant_id', ''
  )::uuid;

  if v_invite_tenant_id is not null then
    v_invite_role := coalesce(
      nullif(new.raw_user_meta_data ->> 'soteria_role', '')::public.user_role,
      'admin'::public.user_role
    );

    insert into public.user_profiles (id, tenant_id, email, first_name, last_name, role)
    values (
      new.id,
      v_invite_tenant_id,
      new.email,
      coalesce(v_first, ''),
      coalesce(v_last, ''),
      v_invite_role
    );

    -- The user_profiles AFTER INSERT trigger creates the primary
    -- site membership automatically.
    return new;
  end if;

  -- Self-signup path (unchanged) ---------------------------------------
  v_slug := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g')
            || '-' || substring(gen_random_uuid()::text, 1, 8);

  select id into v_plan_id
    from public.subscription_plans
   where key = 'starter';

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

  return new;
end;
$$;


-- RPC: provision_tenant_environment ---------------------------------------
-- Transactional "create tenant + customize default site + return ids".
-- Used by the provision-tenant Edge Function. EXECUTE is revoked from
-- `public` / `authenticated` and granted only to `service_role` so
-- the function can't be invoked directly from a tenant-side JWT.

create or replace function public.provision_tenant_environment(
  p_name          text,
  p_slug          text,
  p_plan_id       uuid  default null,
  p_site_name     text  default 'Default site',
  p_site_timezone text  default 'UTC',
  p_site_type     text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_site_id   uuid;
  v_site_slug text;
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'tenant name is required';
  end if;
  if trim(coalesce(p_slug, '')) = '' then
    raise exception 'tenant slug is required';
  end if;

  -- 1. Tenant.
  --    tenants_create_subscription (from migration 120015) fires on
  --    insert and provisions the trialing subscription.
  --    tenants_ensure_environment creates the boring-default site +
  --    tenant_settings row in the same transaction.
  insert into public.tenants (name, slug, plan_id, status)
  values (p_name, p_slug, p_plan_id, 'trial')
  returning id into v_tenant_id;

  -- 2. Customize the just-created default site with operator params.
  v_site_slug := nullif(regexp_replace(lower(p_site_name), '[^a-z0-9]+', '-', 'g'), '');
  if v_site_slug is null then v_site_slug := 'default'; end if;

  update public.sites
     set name      = p_site_name,
         slug      = v_site_slug,
         site_type = p_site_type,
         timezone  = p_site_timezone
   where tenant_id = v_tenant_id
     and is_default = true
  returning id into v_site_id;

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'site_id',   v_site_id
  );
end;
$$;

revoke all on function public.provision_tenant_environment(text, text, uuid, text, text, text)
  from public, authenticated, anon;
grant execute on function public.provision_tenant_environment(text, text, uuid, text, text, text)
  to service_role;


-- RLS ---------------------------------------------------------------------

alter table public.sites                 enable row level security;
alter table public.user_site_memberships enable row level security;
alter table public.tenant_settings       enable row level security;

-- sites: tenant members read; tenant admins write; platform admin all.
create policy sites_select_own on public.sites
  for select using (tenant_id = public.current_tenant_id());

create policy sites_select_by_platform_admin on public.sites
  for select using (public.current_user_role() = 'platform_admin');

create policy sites_write_by_admin on public.sites
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  );

create policy sites_write_by_platform_admin on public.sites
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');


-- user_site_memberships: user reads own; tenant admins manage within
-- their tenant; platform admins cross-tenant.
create policy usm_select_own_or_admin on public.user_site_memberships
  for select using (
    user_profile_id = auth.uid()
    or public.current_user_role() in ('admin', 'platform_admin')
  );

create policy usm_write_by_admin on public.user_site_memberships
  for all
  using (
    public.current_user_role() in ('admin', 'platform_admin')
    and exists (
      select 1 from public.user_profiles up
       where up.id = user_profile_id
         and up.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.current_user_role() in ('admin', 'platform_admin')
    and exists (
      select 1 from public.user_profiles up
       where up.id = user_profile_id
         and up.tenant_id = public.current_tenant_id()
    )
  );

create policy usm_write_by_platform_admin on public.user_site_memberships
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');


-- tenant_settings: tenant members read; tenant admins write; platform
-- admin cross-tenant.
create policy tenant_settings_select_own on public.tenant_settings
  for select using (tenant_id = public.current_tenant_id());

create policy tenant_settings_select_by_platform_admin on public.tenant_settings
  for select using (public.current_user_role() = 'platform_admin');

create policy tenant_settings_write_by_admin on public.tenant_settings
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  );

create policy tenant_settings_write_by_platform_admin on public.tenant_settings
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');
