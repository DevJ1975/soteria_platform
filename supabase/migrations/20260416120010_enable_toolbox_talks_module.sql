-- ============================================================================
-- Soteria — Enable the Toolbox Talks / Training module
--
-- Same three-step activation pattern used for the incidents module:
--   1. Flip platform-level `modules.is_available = true`.
--   2. Backfill `tenant_modules` for every existing tenant (idempotent).
--   3. Update `handle_new_user` so fresh signups get it by default.
--
-- The frontend `MODULE_CATALOGUE.toolbox_talks` entry is updated in the
-- same commit to flip `isAvailable: true` and set `route: 'training'`.
-- ============================================================================

update public.modules
set is_available = true
where key = 'toolbox_talks';


insert into public.tenant_modules (tenant_id, module_key, is_enabled)
select t.id, 'toolbox_talks', true
from public.tenants t
on conflict (tenant_id, module_key)
  do update set is_enabled = true;


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

  -- Default-enabled modules for a new tenant. Extend this list as more
  -- modules reach general availability.
  insert into public.tenant_modules (tenant_id, module_key, is_enabled)
  select v_tenant_id, key, true
  from public.modules
  where is_available = true
    and key in (
      'inspections',
      'equipment_checks',
      'corrective_actions',
      'incidents',
      'toolbox_talks'
    );

  return new;
end;
$$;
