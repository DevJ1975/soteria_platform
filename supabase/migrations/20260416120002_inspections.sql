-- ============================================================================
-- Soteria — Inspections
--
-- The first real business table. Every row is tenant-scoped; RLS ensures
-- the frontend can't accidentally see or mutate another tenant's data even
-- if someone forgets a `.eq('tenant_id', …)` in a query.
--
-- Design notes
-- ------------
-- * `inspection_status` and `inspection_priority` are DB enums so the
--   application never has to guess-and-coerce magic strings. Adding a new
--   value later means `alter type … add value`, which is a cheap migration.
-- * `site_id` is deliberately an unconstrained UUID for now. When the
--   `sites` table lands we'll add the FK without touching application code.
-- * `assigned_to` and `created_by` both point at `user_profiles`. Deleting
--   a user SETs NULL on `assigned_to` (task becomes unassigned) but
--   RESTRICTs the delete when they own the `created_by` — we don't want
--   to silently lose authorship history.
-- ============================================================================

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type public.inspection_status as enum (
    'draft',
    'scheduled',
    'in_progress',
    'completed',
    'overdue',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_priority as enum (
    'low',
    'medium',
    'high',
    'critical'
  );
exception when duplicate_object then null; end $$;


-- Table -----------------------------------------------------------------------
create table public.inspections (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  site_id          uuid,
  title            text not null,
  description      text not null default '',
  inspection_type  text not null default 'general',
  status           public.inspection_status not null default 'draft',
  priority         public.inspection_priority not null default 'medium',
  assigned_to      uuid references public.user_profiles (id) on delete set null,
  due_date         date,
  completed_at     timestamptz,
  created_by       uuid not null references public.user_profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexes that match the queries the list page actually runs.
create index inspections_tenant_id_idx        on public.inspections (tenant_id);
create index inspections_tenant_status_idx    on public.inspections (tenant_id, status);
create index inspections_tenant_due_date_idx  on public.inspections (tenant_id, due_date);
create index inspections_assigned_to_idx      on public.inspections (assigned_to)
  where assigned_to is not null;
create index inspections_created_by_idx       on public.inspections (created_by);

create trigger inspections_touch_updated_at
  before update on public.inspections
  for each row execute function public.touch_updated_at();


-- Row Level Security ----------------------------------------------------------
alter table public.inspections enable row level security;

-- Read: everyone in the tenant can see every inspection in it.
create policy inspections_select_same_tenant on public.inspections
  for select
  using (tenant_id = public.current_tenant_id());

-- Insert: any authenticated tenant member can create, but `tenant_id` and
-- `created_by` must both match the caller. This makes it impossible to
-- forge a row into another tenant or attribute authorship to someone else.
create policy inspections_insert_self on public.inspections
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
  );

-- Update: admins and supervisors can update any row in their tenant;
-- workers can only update rows they created or are assigned to.
create policy inspections_update on public.inspections
  for update
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
      or created_by = auth.uid()
      or assigned_to = auth.uid()
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Delete: admins and supervisors only. Workers shouldn't be able to
-- erase a record — if they made a mistake they can mark it 'cancelled'.
create policy inspections_delete_by_staff on public.inspections
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  );
