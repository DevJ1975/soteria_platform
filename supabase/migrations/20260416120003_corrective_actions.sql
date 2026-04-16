-- ============================================================================
-- Soteria — Corrective Actions
--
-- A corrective action is a task or remediation item created in response to
-- something that needs fixing — an inspection finding, a hazard report, an
-- audit gap, a safety concern. Every action is tenant-scoped and may
-- optionally be linked to an inspection.
--
-- Design notes
-- ------------
-- * `inspection_id` is nullable. Many CAs come from inspections, but some
--   are ad-hoc hazard reports or audit gaps that aren't tied to one. When
--   an inspection is deleted, linked actions are kept (inspection_id set
--   to null) so the audit trail survives.
-- * `corrective_action_status` has a richer state machine than inspections:
--   `blocked` handles "waiting on parts/person", and `verified` captures
--   the distinct state where work is done *and* a supervisor has signed
--   off — a real-world requirement for audit compliance.
-- * RLS is identical in shape to inspections: tenant-scoped reads, staff-
--   or-owner updates, staff-only deletes. The helpers from phase 2
--   (`current_tenant_id`, `current_user_role`) are reused.
-- ============================================================================

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type public.corrective_action_status as enum (
    'open',
    'in_progress',
    'blocked',
    'completed',
    'verified',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.corrective_action_priority as enum (
    'low',
    'medium',
    'high',
    'critical'
  );
exception when duplicate_object then null; end $$;


-- Table -----------------------------------------------------------------------
create table public.corrective_actions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  inspection_id    uuid references public.inspections (id) on delete set null,
  title            text not null,
  description      text not null default '',
  status           public.corrective_action_status not null default 'open',
  priority         public.corrective_action_priority not null default 'medium',
  assigned_to      uuid references public.user_profiles (id) on delete set null,
  due_date         date,
  completed_at     timestamptz,
  created_by       uuid not null references public.user_profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexes matching the queries the list and panel actually run.
create index corrective_actions_tenant_id_idx
  on public.corrective_actions (tenant_id);
create index corrective_actions_tenant_status_idx
  on public.corrective_actions (tenant_id, status);
create index corrective_actions_tenant_due_date_idx
  on public.corrective_actions (tenant_id, due_date);
create index corrective_actions_inspection_id_idx
  on public.corrective_actions (inspection_id)
  where inspection_id is not null;
create index corrective_actions_assigned_to_idx
  on public.corrective_actions (assigned_to)
  where assigned_to is not null;
create index corrective_actions_created_by_idx
  on public.corrective_actions (created_by);

create trigger corrective_actions_touch_updated_at
  before update on public.corrective_actions
  for each row execute function public.touch_updated_at();


-- Row Level Security ----------------------------------------------------------
alter table public.corrective_actions enable row level security;

-- Read: everyone in the tenant can see every action in it.
create policy corrective_actions_select_same_tenant on public.corrective_actions
  for select
  using (tenant_id = public.current_tenant_id());

-- Insert: any authenticated tenant member can create, but `tenant_id` and
-- `created_by` must both match the caller — can't forge authorship or
-- cross tenants.
create policy corrective_actions_insert_self on public.corrective_actions
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
  );

-- Update: staff can update any row in the tenant; workers can only update
-- rows they created or are assigned to.
create policy corrective_actions_update on public.corrective_actions
  for update
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
      or created_by = auth.uid()
      or assigned_to = auth.uid()
    )
  )
  with check (tenant_id = public.current_tenant_id());

-- Delete: staff only. Workers should mark `cancelled` instead of deleting.
create policy corrective_actions_delete_by_staff on public.corrective_actions
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  );
