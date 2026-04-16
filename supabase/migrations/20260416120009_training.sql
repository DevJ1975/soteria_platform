-- ============================================================================
-- Soteria — Toolbox Talks / Training Records
--
-- Two tables, parent + child:
--
--   training_sessions   — one row per toolbox talk / training event
--   training_attendance — one row per attendee (member or external)
--
-- Design notes
-- ------------
-- * `training_attendance.tenant_id` is denormalized alongside
--   `session_id`. Same pattern as `equipment_checks.tenant_id`: RLS gets
--   to filter directly without joining through the parent, matches the
--   platform convention, and a cross-tenant alignment trigger enforces
--   that attendance.tenant_id equals session.tenant_id on every insert
--   or update — so the denormalization can't drift.
-- * `conducted_by` is an FK to `user_profiles` with `on delete set null`.
--   When a supervisor leaves the tenant, their past training records
--   survive with the attribution cleared rather than cascaded away.
-- * `attendee_id` mirrors that pattern: nullable FK. An attendee who's
--   in the tenant gets `attendee_id` populated; external attendees
--   (visitors, new hires not yet in the system) leave it null and carry
--   their name in `attendee_name`.
-- * `signed` + `signed_at` today are set by the supervisor via the
--   attendance panel. The shape is deliberately compatible with a
--   future QR-sign-in flow where the attendee sets `signed=true` at
--   scan time and `signed_at` stamps.
-- * No session-level status column. "Scheduled" vs "completed" is
--   derivable from `session_date < now()`; storing it would invite
--   drift.
-- ============================================================================

-- Training sessions -----------------------------------------------------------
create table public.training_sessions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  site_id        uuid,
  title          text not null,
  description    text not null default '',
  topic          text not null,
  conducted_by   uuid references public.user_profiles (id) on delete set null,
  session_date   timestamptz not null,
  location_text  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index training_sessions_tenant_id_idx
  on public.training_sessions (tenant_id);
create index training_sessions_tenant_session_date_idx
  on public.training_sessions (tenant_id, session_date desc);
create index training_sessions_conducted_by_idx
  on public.training_sessions (conducted_by)
  where conducted_by is not null;

create trigger training_sessions_touch_updated_at
  before update on public.training_sessions
  for each row execute function public.touch_updated_at();


-- Training attendance ---------------------------------------------------------
create table public.training_attendance (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  session_id     uuid not null references public.training_sessions (id) on delete cascade,
  attendee_name  text not null,
  attendee_id    uuid references public.user_profiles (id) on delete set null,
  signed         boolean not null default false,
  signed_at      timestamptz,
  notes          text,
  created_at     timestamptz not null default now()
);

create index training_attendance_tenant_id_idx
  on public.training_attendance (tenant_id);
create index training_attendance_session_id_idx
  on public.training_attendance (session_id, created_at);
create index training_attendance_attendee_id_idx
  on public.training_attendance (attendee_id)
  where attendee_id is not null;


-- Cross-tenant alignment ------------------------------------------------------
-- Parent/child table pairs where the child's tenant must match the parent's
-- get a trigger because plain FKs run as superuser and bypass RLS. Same
-- shape as equipment_checks → equipment and corrective_actions → inspections.

create or replace function public.check_training_attendance_tenant_alignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_tenant uuid;
begin
  select tenant_id into session_tenant
  from public.training_sessions
  where id = new.session_id;

  if session_tenant is null then
    raise exception 'Training session % not found', new.session_id
      using errcode = '23503';
  end if;

  if session_tenant <> new.tenant_id then
    raise exception
      'Attendance tenant (%) does not match session tenant (%)',
      new.tenant_id, session_tenant
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists training_attendance_check_tenant_alignment
  on public.training_attendance;

create trigger training_attendance_check_tenant_alignment
  before insert or update of session_id, tenant_id
  on public.training_attendance
  for each row execute function public.check_training_attendance_tenant_alignment();


-- Row Level Security ----------------------------------------------------------
alter table public.training_sessions   enable row level security;
alter table public.training_attendance enable row level security;

-- Sessions
-- Read: every tenant member sees the training calendar.
create policy training_sessions_select_same_tenant on public.training_sessions
  for select
  using (tenant_id = public.current_tenant_id());

-- Insert / update: staff only. Supervisors and admins run training;
-- workers attend but don't schedule.
create policy training_sessions_insert_by_staff on public.training_sessions
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  );

create policy training_sessions_update_by_staff on public.training_sessions
  for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  )
  with check (tenant_id = public.current_tenant_id());

-- Delete: admins only. A supervisor shouldn't be able to erase a
-- training record that's part of the compliance trail.
create policy training_sessions_delete_by_admin on public.training_sessions
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin')
  );


-- Attendance
-- Read: every tenant member (workers should be able to see their own
-- training history as part of future reporting).
create policy training_attendance_select_same_tenant on public.training_attendance
  for select
  using (tenant_id = public.current_tenant_id());

-- Insert / update / delete: staff only. When QR self-sign-in ships,
-- we'll add a separate INSERT policy gated on
-- `attendee_id = auth.uid()`.
create policy training_attendance_write_by_staff on public.training_attendance
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  );
