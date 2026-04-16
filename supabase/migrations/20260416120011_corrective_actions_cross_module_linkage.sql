-- ============================================================================
-- Soteria — Cross-module linkage for corrective actions
--
-- Adds two optional FKs so a corrective action can be linked to the
-- source that triggered it, across every module that can produce a
-- finding:
--
--   inspection_id      (already present, migration 120003)
--   incident_report_id (new)
--   equipment_check_id (new)
--
-- All three are nullable — CAs can still be ad-hoc — and use
-- `on delete set null` so the remediation record survives deletion of
-- its source. A CA is typically linked to ONE source (a finding came
-- from one place), but nothing in the schema prevents multiple links;
-- we leave that call to the application layer.
--
-- Cross-tenant guard
-- ------------------
-- The previous trigger (migration 120004) only checked `inspection_id`.
-- This migration replaces it with a single function that checks all
-- three FKs in one pass — cheaper than three triggers, and the name
-- is updated to reflect the broader scope.
-- ============================================================================

-- 1. Add the new columns + indexes -------------------------------------------
alter table public.corrective_actions
  add column incident_report_id uuid references public.incident_reports (id) on delete set null,
  add column equipment_check_id uuid references public.equipment_checks (id) on delete set null;

create index corrective_actions_incident_report_id_idx
  on public.corrective_actions (incident_report_id)
  where incident_report_id is not null;

create index corrective_actions_equipment_check_id_idx
  on public.corrective_actions (equipment_check_id)
  where equipment_check_id is not null;


-- 2. Unified cross-tenant trigger --------------------------------------------
-- Rejects any insert/update where a non-null linkage FK points at a row
-- in a different tenant. FK constraints alone don't enforce this because
-- they run as superuser and bypass RLS.

create or replace function public.check_corrective_action_cross_tenant_linkage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inspection_id is not null then
    if not exists (
      select 1 from public.inspections
      where id = new.inspection_id and tenant_id = new.tenant_id
    ) then
      raise exception
        'Corrective action inspection_id % does not belong to tenant %',
        new.inspection_id, new.tenant_id
        using errcode = '22023';
    end if;
  end if;

  if new.incident_report_id is not null then
    if not exists (
      select 1 from public.incident_reports
      where id = new.incident_report_id and tenant_id = new.tenant_id
    ) then
      raise exception
        'Corrective action incident_report_id % does not belong to tenant %',
        new.incident_report_id, new.tenant_id
        using errcode = '22023';
    end if;
  end if;

  if new.equipment_check_id is not null then
    if not exists (
      select 1 from public.equipment_checks
      where id = new.equipment_check_id and tenant_id = new.tenant_id
    ) then
      raise exception
        'Corrective action equipment_check_id % does not belong to tenant %',
        new.equipment_check_id, new.tenant_id
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

-- Swap the trigger: drop the old inspection-only one, install the new
-- wider one. Done as drop-then-create rather than rename so the
-- column list in `before update of …` is explicit.
drop trigger if exists corrective_actions_check_inspection_tenant
  on public.corrective_actions;

create trigger corrective_actions_check_cross_tenant_linkage
  before insert or update of
    inspection_id, incident_report_id, equipment_check_id, tenant_id
  on public.corrective_actions
  for each row execute function public.check_corrective_action_cross_tenant_linkage();

-- Remove the now-orphan function from migration 120004. Safe because
-- no trigger references it anymore.
drop function if exists public.check_corrective_action_inspection_tenant();
