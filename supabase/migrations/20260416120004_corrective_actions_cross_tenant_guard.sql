-- ============================================================================
-- Soteria — Cross-tenant guard for corrective_actions.inspection_id
--
-- Why this exists
-- ---------------
-- `corrective_actions.inspection_id` is a plain FK to `inspections(id)`.
-- Foreign-key checks run as superuser, bypassing RLS. That means a
-- malicious client with a stolen UUID could INSERT a corrective action
-- pointing at another tenant's inspection — the FK passes, and RLS's
-- insert policy only checks `tenant_id` and `created_by`.
--
-- The embedded `linked_inspection` join would silently return null for
-- the attacker (SELECT is RLS-scoped), but the orphan row would exist in
-- the table and could surface in direct queries by platform operators.
--
-- This trigger closes that gap: any INSERT or UPDATE that sets a
-- non-null `inspection_id` must reference an inspection in the SAME
-- tenant. Runs as SECURITY DEFINER so it can see across RLS for the
-- verification query.
-- ============================================================================

create or replace function public.check_corrective_action_inspection_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inspection_id is not null then
    if not exists (
      select 1
      from public.inspections
      where id = new.inspection_id
        and tenant_id = new.tenant_id
    ) then
      raise exception
        'Corrective action inspection_id % does not belong to tenant %',
        new.inspection_id, new.tenant_id
        using errcode = '22023';  -- invalid_parameter_value
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists corrective_actions_check_inspection_tenant
  on public.corrective_actions;

create trigger corrective_actions_check_inspection_tenant
  before insert or update of inspection_id, tenant_id
  on public.corrective_actions
  for each row execute function public.check_corrective_action_inspection_tenant();
