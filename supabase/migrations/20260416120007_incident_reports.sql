-- ============================================================================
-- Soteria — Incident Reports
--
-- Structured records of safety events and observations: incidents, near
-- misses, injuries, property damage, unsafe conditions, and safety
-- observations. All rows are tenant-scoped and enforced via RLS.
--
-- Design notes
-- ------------
-- * `incident_report_type`, `incident_report_severity`, and
--   `incident_report_status` are DB enums — same pattern as inspections
--   and corrective actions. The categories are stable; adding new values
--   is a cheap `alter type … add value` migration. If tenant-custom
--   types become a real need we can migrate to a lookup table.
-- * `event_occurred_at` is separate from `created_at` because incidents
--   are often reported after the fact. The event date is the
--   operationally important one; `created_at` is the audit trail.
-- * `closed_at` is maintained by the service layer (same pattern as
--   inspections.completed_at): stamped when status moves to 'closed',
--   cleared when status moves away. No DB trigger — client controls it.
-- * Free-text fields (`involved_people_notes`,
--   `immediate_actions_taken`, `follow_up_notes`) are `text null`. In v2
--   we'll likely replace `involved_people_notes` with a structured
--   people-involved table, and split `immediate_actions_taken` /
--   `follow_up_notes` into a timeline of actions — but for the MVP the
--   free text lets operators capture what they need without a rigid
--   schema getting in the way.
-- ============================================================================

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type public.incident_report_type as enum (
    'incident',
    'near_miss',
    'injury',
    'property_damage',
    'unsafe_condition',
    'observation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.incident_report_severity as enum (
    'informational',
    'low',
    'medium',
    'high',
    'critical'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.incident_report_status as enum (
    'draft',
    'submitted',
    'investigating',
    'closed'
  );
exception when duplicate_object then null; end $$;


-- Table -----------------------------------------------------------------------
create table public.incident_reports (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  site_id                   uuid,
  report_type               public.incident_report_type not null,
  title                     text not null,
  description               text not null default '',
  severity                  public.incident_report_severity not null default 'low',
  status                    public.incident_report_status not null default 'draft',
  event_occurred_at         timestamptz not null,
  location_text             text,
  involved_people_notes     text,
  immediate_actions_taken   text,
  follow_up_notes           text,
  reported_by               uuid not null references public.user_profiles (id) on delete restrict,
  closed_at                 timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Indexes shaped to the queries the list page actually runs: tenant-
-- scoped filters on status, severity, type, and event date.
create index incident_reports_tenant_id_idx
  on public.incident_reports (tenant_id);
create index incident_reports_tenant_status_idx
  on public.incident_reports (tenant_id, status);
create index incident_reports_tenant_severity_idx
  on public.incident_reports (tenant_id, severity);
create index incident_reports_tenant_type_idx
  on public.incident_reports (tenant_id, report_type);
create index incident_reports_tenant_event_at_idx
  on public.incident_reports (tenant_id, event_occurred_at desc);
create index incident_reports_reported_by_idx
  on public.incident_reports (reported_by);

create trigger incident_reports_touch_updated_at
  before update on public.incident_reports
  for each row execute function public.touch_updated_at();


-- Row Level Security ----------------------------------------------------------
alter table public.incident_reports enable row level security;

-- Read: every tenant member sees every report in the tenant.
-- Incident visibility is usually broad so crews can learn from events.
create policy incident_reports_select_same_tenant on public.incident_reports
  for select
  using (tenant_id = public.current_tenant_id());

-- Insert: any authenticated tenant member can file a report, but
-- `tenant_id` and `reported_by` must both match the caller — can't
-- attribute a report to someone else.
create policy incident_reports_insert_self on public.incident_reports
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and reported_by = auth.uid()
  );

-- Update: staff can amend any report in the tenant; workers can update
-- only reports they filed (to add details, correct typos, etc.).
create policy incident_reports_update on public.incident_reports
  for update
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
      or reported_by = auth.uid()
    )
  )
  with check (tenant_id = public.current_tenant_id());

-- Delete: staff only. Incident reports are an audit artifact — workers
-- shouldn't be able to erase a report after filing, even if they made a
-- mistake. They can change the status to 'closed' and add a follow-up
-- note instead.
create policy incident_reports_delete_by_staff on public.incident_reports
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  );
