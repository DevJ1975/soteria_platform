-- ============================================================================
-- Soteria — Platform admin access policies
--
-- Opens the cross-tenant windows a platform admin needs to do their job
-- without introducing a second permission primitive. The existing
-- `user_profiles.role = 'platform_admin'` enum value is the single
-- source of truth; every new policy below is gated on
-- `public.current_user_role() = 'platform_admin'`.
--
-- Bootstrapping the first platform admin
-- --------------------------------------
-- Platform admins are not created automatically. To promote a signed-up
-- user to platform admin, run (once, manually):
--
--   update public.user_profiles
--   set    role = 'platform_admin'
--   where  email = 'you@example.com';
--
-- The user keeps their home tenant (they can still use the tenant app)
-- and gains access to /platform-admin via the RLS bypasses below.
--
-- Policy additivity
-- -----------------
-- Postgres combines multiple policies on the same (table, command)
-- pair with OR. That means adding "platform admin sees everything"
-- alongside the existing "tenant member sees their own tenant"
-- produces the right union: tenant members see their own rows, and
-- platform admins see every row.
-- ============================================================================

-- Tenants --------------------------------------------------------------------
-- Cross-tenant SELECT for platform admins. The existing
-- `tenants_select_own` still matches on their home tenant, so this
-- policy effectively extends it.
create policy tenants_select_by_platform_admin on public.tenants
  for select
  using (public.current_user_role() = 'platform_admin');

-- Cross-tenant write (insert/update/delete). Tenant admins update
-- their own row via `tenants_update_by_admin`; platform admins can
-- touch any row.
create policy tenants_insert_by_platform_admin on public.tenants
  for insert
  with check (public.current_user_role() = 'platform_admin');

create policy tenants_update_by_platform_admin on public.tenants
  for update
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');

create policy tenants_delete_by_platform_admin on public.tenants
  for delete
  using (public.current_user_role() = 'platform_admin');


-- User profiles --------------------------------------------------------------
-- Platform admins need to see (and occasionally update) user profiles
-- across tenants — for tenant detail screens that list "N users" and
-- for future role-change admin flows.
create policy user_profiles_select_by_platform_admin on public.user_profiles
  for select
  using (public.current_user_role() = 'platform_admin');

create policy user_profiles_update_by_platform_admin on public.user_profiles
  for update
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');


-- Modules (platform catalogue) ----------------------------------------------
-- Currently select-only for all authenticated users. Add write access
-- for platform admins so they can toggle `is_available` when a module
-- ships or gets pulled.
create policy modules_write_by_platform_admin on public.modules
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');


-- Subscription plans ---------------------------------------------------------
-- Read was already open to authenticated; add platform-admin write so
-- new plans (or edits to existing plans) can happen from the admin UI
-- without a migration round-trip.
create policy subscription_plans_write_by_platform_admin on public.subscription_plans
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');

create policy subscription_plan_modules_write_by_platform_admin
  on public.subscription_plan_modules
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');


-- Tenant module overrides ----------------------------------------------------
-- Tenant admins manage their own overrides via the existing
-- `tenant_modules_write_by_admin`. Platform admins may need to nudge
-- another tenant's overrides (support scenarios, emergency disables).
create policy tenant_modules_by_platform_admin on public.tenant_modules
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');
