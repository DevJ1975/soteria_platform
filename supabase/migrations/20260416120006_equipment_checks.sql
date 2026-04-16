-- ============================================================================
-- Soteria — Equipment Checks
--
-- A record of one check performed on one piece of equipment. The table is
-- append-mostly (checks are history, not mutable state).
--
-- Design notes
-- ------------
-- * `tenant_id` is denormalized here (in addition to being reachable via
--   `equipment.tenant_id`). Reasons:
--     1. RLS policies get to filter directly without joining through
--        equipment on every query.
--     2. Matches the pattern inspections and corrective_actions already
--        use across the codebase.
--     3. tenant_id never changes for a row, so there's no consistency
--        maintenance cost — a cross-tenant-alignment trigger below
--        enforces it at write time.
-- * `performed_by` is immutable after insert (caller is the performer —
--   we don't allow retroactive attribution). Enforced at the service layer
--   by never including it in update payloads.
-- * ON DELETE CASCADE from equipment: when an asset is removed the check
--   history goes with it. For long-term audit, add an archive table later.
-- ============================================================================

-- Enum ------------------------------------------------------------------------
do $$ begin
  create type public.equipment_check_status as enum (
    'pass',
    'fail',
    'needs_attention'
  );
exception when duplicate_object then null; end $$;


-- Table -----------------------------------------------------------------------
create table public.equipment_checks (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  equipment_id   uuid not null references public.equipment (id) on delete cascade,
  check_type     text not null default 'pre_use',
  status         public.equipment_check_status not null default 'pass',
  notes          text,
  performed_by   uuid not null references public.user_profiles (id) on delete restrict,
  performed_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Indexes matching the list/panel query shapes.
create index equipment_checks_tenant_id_idx
  on public.equipment_checks (tenant_id);
create index equipment_checks_equipment_id_idx
  on public.equipment_checks (equipment_id, performed_at desc);
create index equipment_checks_tenant_status_idx
  on public.equipment_checks (tenant_id, status);
create index equipment_checks_performed_by_idx
  on public.equipment_checks (performed_by);

create trigger equipment_checks_touch_updated_at
  before update on public.equipment_checks
  for each row execute function public.touch_updated_at();


-- Cross-tenant guard ---------------------------------------------------------
-- Same shape as the corrective-actions→inspection guard in migration 120004.
-- Prevents a malicious client from linking a check to an equipment row in
-- another tenant (FK checks bypass RLS). Also enforces that the
-- denormalized `tenant_id` matches the parent equipment's tenant.

create or replace function public.check_equipment_check_tenant_alignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eq_tenant uuid;
begin
  select tenant_id into eq_tenant
  from public.equipment
  where id = new.equipment_id;

  if eq_tenant is null then
    raise exception 'Equipment % not found', new.equipment_id
      using errcode = '23503';  -- foreign_key_violation
  end if;

  if eq_tenant <> new.tenant_id then
    raise exception
      'Equipment check tenant (%) does not match equipment tenant (%)',
      new.tenant_id, eq_tenant
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_checks_check_tenant_alignment
  on public.equipment_checks;

create trigger equipment_checks_check_tenant_alignment
  before insert or update of equipment_id, tenant_id
  on public.equipment_checks
  for each row execute function public.check_equipment_check_tenant_alignment();


-- Row Level Security ----------------------------------------------------------
alter table public.equipment_checks enable row level security;

-- Read: every tenant member sees every check in the tenant.
create policy equipment_checks_select_same_tenant on public.equipment_checks
  for select
  using (tenant_id = public.current_tenant_id());

-- Insert: any authenticated tenant member can record a check, but
-- `performed_by` must match the caller — no ghost-recording for someone
-- else.
create policy equipment_checks_insert_self on public.equipment_checks
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and performed_by = auth.uid()
  );

-- Update: staff can amend any check in the tenant (e.g. attach notes
-- after the fact). Workers can update only checks they performed.
create policy equipment_checks_update on public.equipment_checks
  for update
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
      or performed_by = auth.uid()
    )
  )
  with check (tenant_id = public.current_tenant_id());

-- Delete: staff only. Audit records shouldn't be removable by the person
-- who performed the check.
create policy equipment_checks_delete_by_staff on public.equipment_checks
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  );
