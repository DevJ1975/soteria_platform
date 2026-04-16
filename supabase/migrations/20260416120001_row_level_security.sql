-- ============================================================================
-- Soteria — Row Level Security
--
-- The whole app assumes the database enforces tenant isolation — the client
-- code does NOT add `tenant_id` filters defensively. That means RLS must be
-- correct before any real data lands in the database.
--
-- Strategy
-- --------
-- * Every tenant-scoped table gates access by the caller's tenant, derived
--   via `public.current_tenant_id()` which reads `user_profiles`.
-- * `modules` is a platform-wide catalogue — any authenticated user can
--   read it; only the platform owner mutates it (no public write policy).
-- * Admins of a tenant can toggle modules and update the tenant row;
--   workers/supervisors are read-only on those tables.
-- ============================================================================

-- Helper: tenant_id of the calling user --------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.user_profiles where id = auth.uid();
$$;

-- Helper: role of the calling user -------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid();
$$;


-- Enable RLS on every table ---------------------------------------------------
alter table public.tenants         enable row level security;
alter table public.user_profiles   enable row level security;
alter table public.modules         enable row level security;
alter table public.tenant_modules  enable row level security;


-- tenants ---------------------------------------------------------------------
-- Everyone in the tenant can see their own tenant row.
create policy tenants_select_own on public.tenants
  for select
  using (id = public.current_tenant_id());

-- Only admins can update the tenant row (rename, change status, etc.).
create policy tenants_update_by_admin on public.tenants
  for update
  using (
    id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  );

-- Tenants are created by the `handle_new_user` trigger which runs as
-- SECURITY DEFINER — no insert/delete policy needed for regular users.


-- user_profiles ---------------------------------------------------------------
-- See the roster of your own tenant.
create policy user_profiles_select_same_tenant on public.user_profiles
  for select
  using (tenant_id = public.current_tenant_id());

-- Update your own profile (name, avatar, etc.).
create policy user_profiles_update_self on public.user_profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and tenant_id = public.current_tenant_id());

-- Admins can update anyone in their tenant (e.g. role changes).
create policy user_profiles_update_by_admin on public.user_profiles
  for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  );


-- modules ---------------------------------------------------------------------
-- Read-only for every authenticated user; platform owners manage the
-- catalogue via the Supabase dashboard or a superuser migration.
create policy modules_select_authenticated on public.modules
  for select
  using (auth.uid() is not null);


-- tenant_modules --------------------------------------------------------------
-- Every user in a tenant can see which modules are enabled.
create policy tenant_modules_select on public.tenant_modules
  for select
  using (tenant_id = public.current_tenant_id());

-- Only admins can toggle modules. `for all` covers insert/update/delete so
-- we don't repeat the check three times.
create policy tenant_modules_write_by_admin on public.tenant_modules
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('admin', 'platform_admin')
  );
