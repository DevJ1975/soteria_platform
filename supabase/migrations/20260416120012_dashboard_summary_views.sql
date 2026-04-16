-- ============================================================================
-- Soteria — Dashboard summary views
--
-- Five small aggregate views, one per module, that power the KPI row on
-- the dashboard. Each view returns at most one row per tenant_id; the
-- frontend reads its own tenant's row (or none, if the tenant has no
-- data in that module yet).
--
-- Tenant isolation via `security_invoker = on`
-- --------------------------------------------
-- Postgres views by default run with the permissions of their OWNER
-- (for us, the superuser that ran the migration), which bypasses RLS on
-- underlying tables. That would be a cross-tenant leak waiting to happen.
--
-- `security_invoker = on` (PG15+) flips this so the view executes RLS
-- as the CALLER. Each select from the view transparently obeys the
-- underlying tables' existing `select` policies — which already scope
-- to `public.current_tenant_id()`. No `where tenant_id = …` filter in
-- the view itself, and no chance of the view accidentally exposing
-- rows from other tenants.
--
-- `group by tenant_id` is still present so a platform_admin (who can
-- see multiple tenants via their RLS role) gets one row per tenant.
-- For a regular admin the result is always one row (their tenant) or
-- zero rows (no data yet).
-- ============================================================================

-- Corrective actions ----------------------------------------------------------
create or replace view public.dashboard_corrective_action_summary
with (security_invoker = on) as
select
  tenant_id,
  count(*) filter (
    where status in ('open', 'in_progress', 'blocked')
  ) as open_count,
  count(*) filter (
    where status in ('open', 'in_progress', 'blocked')
      and due_date is not null
      and due_date < current_date
  ) as overdue_count,
  count(*) filter (
    where status in ('completed', 'verified')
  ) as completed_count
from public.corrective_actions
group by tenant_id;


-- Inspections -----------------------------------------------------------------
-- "Recent" windows throughout these views use 30 days. That's a pragmatic
-- default; when we add date-range filters on the dashboard (Phase 10+),
-- we'll replace these views with parameterized functions.
create or replace view public.dashboard_inspection_summary
with (security_invoker = on) as
select
  tenant_id,
  count(*) as total_count,
  count(*) filter (
    where status = 'completed'
      and completed_at is not null
      and completed_at >= now() - interval '30 days'
  ) as completed_recent_count,
  count(*) filter (
    where status in ('draft', 'scheduled', 'in_progress', 'overdue')
  ) as open_count
from public.inspections
group by tenant_id;


-- Incident reports ------------------------------------------------------------
create or replace view public.dashboard_incident_summary
with (security_invoker = on) as
select
  tenant_id,
  count(*) filter (
    where status in ('draft', 'submitted', 'investigating')
  ) as open_count,
  count(*) filter (
    where status = 'closed'
  ) as closed_count,
  count(*) filter (
    where status in ('draft', 'submitted', 'investigating')
      and severity in ('high', 'critical')
  ) as high_severity_open_count
from public.incident_reports
group by tenant_id;


-- Equipment checks ------------------------------------------------------------
create or replace view public.dashboard_equipment_check_summary
with (security_invoker = on) as
select
  tenant_id,
  count(*) filter (
    where status in ('fail', 'needs_attention')
  ) as failed_count,
  count(*) filter (
    where status = 'pass'
      and performed_at >= now() - interval '30 days'
  ) as passed_recent_count
from public.equipment_checks
group by tenant_id;


-- Training --------------------------------------------------------------------
-- "Total attendance" here means total attendance records for sessions in
-- the recent window — matches the supervisor's question "how many
-- person-sessions of training did we do this month?"
create or replace view public.dashboard_training_summary
with (security_invoker = on) as
select
  s.tenant_id,
  count(distinct s.id) filter (
    where s.session_date >= now() - interval '30 days'
  ) as recent_sessions_count,
  count(a.id) filter (
    where s.session_date >= now() - interval '30 days'
  ) as total_attendance_count
from public.training_sessions s
left join public.training_attendance a on a.session_id = s.id
group by s.tenant_id;


-- Sanity: grant select on each view to authenticated users. RLS on the
-- underlying tables is the authoritative check; this grant is just so
-- PostgREST can target the views from the anon/authenticated roles.
grant select on public.dashboard_corrective_action_summary  to authenticated;
grant select on public.dashboard_inspection_summary         to authenticated;
grant select on public.dashboard_incident_summary           to authenticated;
grant select on public.dashboard_equipment_check_summary    to authenticated;
grant select on public.dashboard_training_summary           to authenticated;
