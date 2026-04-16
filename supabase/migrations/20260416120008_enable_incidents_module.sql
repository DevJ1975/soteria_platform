-- ============================================================================
-- Soteria — Enable the Incidents module
--
-- This migration flips three switches that together make the incidents
-- module appear in the sidebar and be routable:
--
--   1. `modules.is_available` — platform-level "this module is ready".
--   2. Backfill `tenant_modules` for existing tenants — so users who
--      already signed up can see the module on their next page load,
--      not just users who sign up after this migration runs.
--   3. Update the `handle_new_user` trigger — so new signups from this
--      point forward get Incidents enabled by default alongside the
--      existing three (Inspections, Equipment Checks, Corrective Actions).
--
-- The frontend catalogue must ALSO be updated (isAvailable: true on the
-- `incidents` entry in MODULE_CATALOGUE). That's a code change, shipped
-- in the same commit as this migration.
-- ============================================================================

-- 1. Mark the module as available ---------------------------------------------
update public.modules
set is_available = true
where key = 'incidents';


-- 2. Backfill tenant_modules for existing tenants -----------------------------
-- Idempotent: if a row already exists for (tenant, 'incidents') we flip
-- is_enabled to true rather than inserting a duplicate.
insert into public.tenant_modules (tenant_id, module_key, is_enabled)
select t.id, 'incidents', true
from public.tenants t
on conflict (tenant_id, module_key)
  do update set is_enabled = true;


-- 3. Update the provisioning trigger ------------------------------------------
-- Replaces the function body from migration 120000 — adds 'incidents'
-- to the list of modules enabled for each new tenant.
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
    'admin'
  );

  -- Default-enabled modules for a new tenant. Add to this list as more
  -- modules reach general availability.
  insert into public.tenant_modules (tenant_id, module_key, is_enabled)
  select v_tenant_id, key, true
  from public.modules
  where is_available = true
    and key in (
      'inspections',
      'equipment_checks',
      'corrective_actions',
      'incidents'
    );

  return new;
end;
$$;
