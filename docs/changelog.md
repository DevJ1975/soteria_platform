# Soteria — Changelog

What's shipped, in reverse chronological order.

> **How this is maintained:** entries are added in the same session as
> the work they describe. If you spot code that isn't reflected here,
> the log is stale — please flag it and we'll patch it.

---

## 2026-04-16 — Phase 10: Module toggles + tenant plan management

Not committed yet at time of writing.

Turns the modules system into a proper SaaS control surface: plans
determine default module access, per-tenant overrides force a module
on or off regardless of plan, and an admin-only settings page gives
tenant owners direct control.

### Architecture

The spec asked for a new `platform_modules` table. We already had
`modules` serving that role — same shape, same purpose. Kept
`modules` as the platform catalogue; added `is_core` for always-on
modules. Reinterpreted `tenant_modules` as the overrides table.
New: `subscription_plans`, `subscription_plan_modules`,
`tenants.plan_id`.

### Access resolution (three-layer rule)

Implemented in `ModuleRegistryService.resolveAccess()`:

  1. `modules.is_core = true`       → always enabled
  2. override exists                → use override's is_enabled
  3. module is in tenant's plan     → enabled
  4. otherwise                      → disabled

One resolve call = three parallel queries (modules · plan_id ·
overrides). The resolved enabled-set is a signal; sidebar and module
guard react automatically. Settings-page mutations call
`ModuleRegistryService.refresh()` to re-resolve without a reload.

### Schema — migration 20260416120013

- `modules.is_core` column added.
- `subscription_plans` + 3 seeded plans (Starter · Growth · Pro).
- `subscription_plan_modules` + seeded mappings:
  - Starter: inspections + corrective_actions
  - Growth: Starter + equipment_checks + incidents
  - Pro: Growth + toolbox_talks
- `tenants.plan_id` (nullable FK). Existing tenants → Pro
  (preserves current behaviour). `handle_new_user` updated to
  assign Starter to new signups and drop hardcoded `tenant_modules`
  inserts.
- RLS on new tables: authenticated read; no write policies (plans
  are platform catalog, changed via migration).

### Angular

- Models: `SubscriptionPlan`, `SubscriptionPlanModule`,
  `TenantModuleOverride`, `TenantModuleAccess`, `TenantPlanSummary`.
  `Tenant` gains `planId`.
- `SubscriptionPlansService` — read-only plan catalog.
- `TenantPlanService` — `getTenantPlanId`,
  `updateTenantPlan(id, planId | null)`, `getTenantModuleOverrides`,
  `setTenantModuleOverride(key, null | true | false)` where `null`
  removes the override.
- `ModuleRegistryService` refactored: new resolver + public
  `refresh()` + `access` signal exposed as `ReadonlyMap<ModuleKey,
  TenantModuleAccess>` for the settings table.
- New `roleGuard(...roles)` — higher-order guard; `platform_admin`
  implicitly allowed on every role gate.
- New `/app/settings/modules` admin-only page with plan selector +
  module access table (plan default / override control / effective).
- Sidebar gets an **Admin** section with a Modules & Plan link,
  rendered only for `admin` / `platform_admin` roles.

### Not changing

- **Dashboard not in `modules`.** Dashboard is the landing page, not
  a toggleable feature. It lives outside the catalog.
- **Plan tier validation on overrides.** Nothing stops a Starter
  admin from force-enabling all modules via override. When billing
  ships, override writes will check plan tier limits; today it's
  trusted because there's no cost differential.

---

## 2026-04-16 — Phase 9 review 2: Dashboard state correctness

Not committed yet at time of writing.

Second review pass — found two real gaps the first pass missed.
Both were about distinguishing "no data yet" from "still loading"
from "failed to load".

### Loading vs. empty ambiguity

Before: `RecentActivityCardComponent` rendered the empty state
("No recent incident reports.") as soon as `count === 0`, which
is the state the page is in *before* any fetch completes. Users
saw "no data" flash during the initial paint, then the real data
slide in a beat later — a false-negative first impression.

After: card has a `loading` input. When true it renders a
"Loading…" placeholder; when false and `count === 0`, the empty
state. Dashboard starts every section in `loading = true` and
flips it off in the `finally` of each fetch.

### Silent per-card failures hid real data

Before: individual recent-list fetches caught errors silently. A
user whose incidents list failed saw "No recent incident reports"
— identical to an empty tenant. Data-integrity issue.

After: card has an `errorLabel` input. On fetch failure, the
dashboard sets `state.error` to "Could not load. Refresh to try
again." which renders as a subtle red in-card panel (not a
page-level alert — one failed list shouldn't black out the
dashboard).

### State precedence

The card now picks exactly one of four render modes:

  1. `errorLabel` set → in-card error message
  2. `loading` true → "Loading…" placeholder
  3. `count === 0` → empty state
  4. default → projected `<ng-content>`

### Implementation

- `SectionState` helper groups each card's loading + error signals
  into one object, so the template reads `incidents.loading()`
  and the load method takes `SectionState` + `WritableSignal<T[]>`
  + `() => Promise<T[]>`.
- One `loadSection()` method replaces the four nearly-identical
  try/catch blocks.
- Stats loading is still handled as a single critical-path load
  whose failure surfaces in the page-level alert (the KPI row is
  the primary content and "KPIs all show zero" is more confusing
  than "couldn't load").

---

## 2026-04-16 — Phase 9 review: Dashboard polish

Not committed yet at time of writing.

### Refactor: RecentActivityCardComponent

The four "recent activity" cards (incidents / CAs / inspections /
training) were ~80 lines of repeated template — identical card shells
with different row content. Extracted the shell to
[`components/recent-activity-card`](../src/app/features/dashboard/components/recent-activity-card/recent-activity-card.component.ts):

- Inputs: `title`, `viewAllLink`, `count`, `emptyLabel`.
- Renders the card chrome (title, "View all →" link, empty state).
- Host passes rows via `<ng-content>`; content only renders when
  `count > 0`.

Dashboard template drops ~80 lines and gets one place to style every
activity card consistently.

### UX: relative dates on recent rows

Raw timestamps ("Apr 16, 2026, 2:30 PM") don't scan well on a recent-
activity list. Added two helpers to [`shared/utils/date.util.ts`](../src/app/shared/utils/date.util.ts):

- `formatRelativeTime(iso)` — "2h ago", "in 3d", "just now", handles
  past and future.
- `formatActivityDate(iso)` — hybrid: relative for <7 days, compact
  absolute ("Apr 16") for older. Matches the GitHub/Slack pattern.

Dashboard activity rows now use `formatActivityDate` instead of
`formatDateTime`.

### KPI reordering

KPI row now reads urgency-first: Overdue actions → Open incidents →
Failed checks → Open CAs → Recent inspections → Training. The user's
eye lands on the scariest number first. `StatTile`'s existing trend
indicator (red helper text on down) continues to color only the
needs-attention metrics.

### Style polish

- `.row` in activity lists gets a `background-color` hover in addition
  to the border change — better clickability affordance.
- `.row__date` uses `tabular-nums` so "2h ago" / "12h ago" align in
  the column.
- `.kpi-link` gets a proper `:focus-visible` outline so keyboard
  navigation is visible.

### Not changed

- **9 parallel queries on load** — still fine at this data shape;
  HTTP/2 multiplexes, total latency <200ms. RPC is a future
  optimization when we hit 20+ metrics.
- **No caching / real-time refresh** — dashboard data is fine at
  seconds-stale; users hit it infrequently enough.
- **No trend charts** — current data is count-oriented snapshots;
  trends need a rollup table with daily snapshots. Out of scope.
- **No loading spinner** — zero values render for <200ms before data
  arrives; not worth the spinner complexity.

---

## 2026-04-16 — Phase 9: Dashboard + analytics

Not committed yet at time of writing.

The first page every user sees on sign-in now actually does something.
Six KPI cards pulling aggregate data from five module-specific SQL
views, plus four "recent activity" cards showing the latest items per
module. No charts, no bar graphs — operational snapshot, not
dashboard-porn.

### Data strategy

- **SQL views** for the KPIs. One view per module with a handful of
  `count(*) filter (where …)` aggregates grouped by `tenant_id`.
  Security-scoped via `security_invoker = on` (PG15+) so the views
  obey the underlying tables' RLS policies.
- **Existing-style table queries** with `.order().limit()` for the
  "recent activity" lists. Narrow projections (just the fields the
  cards show) keep payloads small.
- **Not an RPC** — tempting for the one-round-trip win, but 5 small
  views in parallel is already fast and views compose better as we
  evolve. RPC makes sense when we're 20+ metrics deep.

### Schema

SQL migration [`20260416120012_dashboard_summary_views.sql`](../supabase/migrations/20260416120012_dashboard_summary_views.sql):

- `dashboard_corrective_action_summary` — open / overdue / completed
- `dashboard_inspection_summary` — total / completed_recent (last 30d) / open
- `dashboard_incident_summary` — open / closed / high-severity open
- `dashboard_equipment_check_summary` — failed / passed_recent
- `dashboard_training_summary` — recent_sessions / total_attendance (left-joins attendance for the person-session count)

All five declared with `with (security_invoker = on)`. `grant select …
to authenticated` so PostgREST can target them from the app role;
actual authorization is the RLS policies on the underlying tables.

### Angular

- `dashboard.model.ts` — `DashboardStats` with a nested shape per
  module, slim `Recent*` projections for the activity cards,
  `EMPTY_DASHBOARD_STATS` initial value for brand-new tenants.
- `DashboardService` — `getStats()` runs the five view queries in
  parallel; `getRecentX()` helpers hit each module table with
  `.order().limit()`. Fails soft on missing tenant context so the
  dashboard never hard-errors during session init.
- `DashboardComponent` rewritten: KPI row driven by real data, four
  recent-activity cards (incidents / CAs / inspections / training),
  each with its own chip and a "View all →" link. All six KPI cards
  are clickable and deep-link to the relevant list. Every query runs
  in parallel in `ngOnInit` — perceived load time is the longest
  single query, not the sum.

### Known gaps / future work

- No date-range filter yet. Views use a 30-day "recent" window; when
  we add a picker we'll parameterize via SQL functions.
- No per-site filtering. Views group only by tenant; adding `site_id`
  is a one-line change per view.
- No trend widgets (line charts etc.). Current data surface is
  count-oriented — charts would be overfitting for what we have.

---

## 2026-04-16 — Open-issues badges on list pages

Not committed yet at time of writing.

### New shared component

- [`src/app/shared/components/count-badge/count-badge.component.ts`](../src/app/shared/components/count-badge/count-badge.component.ts) —
  small amber chip that renders **nothing** when count is 0, a compact
  "N label" indicator when > 0. Inputs: `count`, `label`, `tooltip`.
  The renders-nothing-on-zero behavior is intentional — a sea of "0
  open" chips would be noise.

### Batch count service methods

Every per-row count was already available via `getOpenCountByX(id)`,
but calling that per-row would N+1 the page. Added batch counterparts
that return a `ReadonlyMap<id, count>` from one round-trip, groupable
client-side into O(1) lookups in the template:

- `CorrectiveActionsService.getOpenCountsByInspection()`
- `CorrectiveActionsService.getOpenCountsByIncidentReport()`
- `EquipmentChecksService.getActionableCountsByEquipment()`

Behind both CA methods sits one small private helper
(`openCountsByLink(column)`) that keeps the grouping logic DRY.

### Badges on three list pages

- **Inspections list** — "N open" chip next to the title when the
  inspection has at least one open corrective action.
- **Incident reports list** — same treatment next to the report title.
- **Equipment list** — "N actionable" chip next to the equipment name
  when the asset has at least one failed or needs-attention check.

Each list fires the count query in parallel with its main refresh in
`ngOnInit`. Counts refresh on page re-init (standard Angular route
re-init covers the "user added an action then came back" case).
Errors on the count query are swallowed — the badges are a
nice-to-have; they must never fail the page load.

---

## 2026-04-16 — Phase 8: Cross-module corrective-action linkage

Shipped in commit [`9e7e90b`](https://github.com/DevJ1975/soteria_platform/commit/9e7e90b).

The long-promised cross-module story: any finding — from an inspection,
an incident report, or an equipment check — can now spawn a tracked
corrective action with one click, and every source context shows its
follow-ups inline.

### Schema

- SQL migration [`20260416120011_corrective_actions_cross_module_linkage.sql`](../supabase/migrations/20260416120011_corrective_actions_cross_module_linkage.sql):
  - Adds `incident_report_id` and `equipment_check_id` nullable FKs on
    `corrective_actions`, both with `on delete set null` so the
    remediation record survives deletion of its source.
  - Partial indexes on both new columns (where not null) to keep the
    panel queries cheap.
  - Replaces the existing inspection-only cross-tenant trigger with a
    unified `check_corrective_action_cross_tenant_linkage` function
    that validates all three FKs in one pass. Old function dropped.

### Service

- Three parallel read methods via a small `findByLink(column, id)`
  helper: `getCorrectiveActionsByInspection/IncidentReport/EquipmentCheck`.
- Three parallel count methods: `getOpenCountBy…` for each source.
- Embedded-select string now pulls all three linked records in a single
  round-trip. The DB trigger guarantees at most one is populated; the
  mapper handles any shape.
- Create and update accept `incidentReportId` and `equipmentCheckId` in
  payloads (sparse PATCH preserved).

### UI

- `CorrectiveActionsPanelComponent` refactored to accept any one of
  `[inspectionId]`, `[incidentReportId]`, `[equipmentCheckId]`. Computes
  the right service method, subtitle, empty message, and deep-link
  query param from whichever is set. Inspection edit page usage
  unchanged.
- Dropped the panel into the **incident report detail page** so follow-up
  actions live alongside the narrative cards.
- Added an inline **"Create corrective action →"** link on every failed
  or needs-attention row in the `EquipmentChecksPanel`. Deep-links to
  `/app/corrective-actions/new?equipmentCheckId=…`.
- `CorrectiveActionFormComponent`:
  - Two new inputs (`initialIncidentReportId`, `initialEquipmentCheckId`)
    matching the existing inspection preset pattern.
  - New "Linked incident report" dropdown sourced from
    `IncidentReportsService.getIncidentReports()`.
  - Equipment-check linkage renders as a read-only info card when set
    (set via query param only; not manually picked from a dropdown of
    potentially thousands of checks).
  - Hydration effect now covers all three link fields; the
    `lastPatchedId` guard still prevents re-hydration wipe.
- `CorrectiveActionNewComponent`:
  - Reads three query params (`inspectionId`, `incidentReportId`,
    `equipmentCheckId`), passes each as a preset to the form.
  - After save, returns the user to whichever context they came from
    (inspection edit / incident detail / CA list for equipment checks,
    since those don't have a dedicated detail page).

### End-to-end flow

```
  Failed equipment check          Incident finding
          │                              │
          │ click "Create corrective     │ click "Add corrective
          │ action →" on the row         │ action" on detail panel
          ▼                              ▼
  /app/corrective-actions/new?equipmentCheckId=…   /?incidentReportId=…
          │                              │
          │  form pre-linked, user       │
          │  fills title/priority        │
          ▼                              ▼
             createCorrectiveAction(payload)
             ├── incident_report_id or equipment_check_id set
             ├── cross-tenant trigger validates the linkage
             └── RLS enforces tenant isolation
                            │
                            ▼
          return to source context; new action appears in its panel
```

---

## 2026-04-16 — Phase 7 review: Training polish

Not committed yet at time of writing.

### Attendance panel correctness

- **Toggle-signed error path fixed.** The checkbox binding
  (`[checked]="a.signed"`) is one-way — when `updateAttendance` failed,
  the user's click had already flipped the DOM state but our signal
  hadn't changed, so the UI showed "checked" while the data was
  `false`. Explicit `checkbox.checked = a.signed` on error forces the
  visual back to the saved value.
- **Stale errors now clear** at the start of `toggleSigned` and
  `remove`, same as `addAttendee`. A failed action followed by a
  successful one no longer leaves the old error hanging.

### UX

- **Signed count in the attendance panel header.** "Attendees · 12 · 11
  signed" is the metric supervisors actually want — simple attendee
  count doesn't tell them whether sign-off is complete. Computed
  client-side from the loaded rows; no extra query.

### Form

- **Granular topic error message.** Title field had `required` /
  `minlength` / `maxlength` specific errors; topic just silently
  refused submit. Now shows "A topic is required" / "Topic is too long
  …" in the same shape as title.

### Known limitations (not changing this pass)

- **Duplicate member names on the datalist.** If two tenant members
  share a first + last name, the resolver picks the first match.
  Rare-to-hypothetical edge; cleanest fix is appending email to the
  datalist option, but that visibly doubles line length in the picker.
  Leaving until it surfaces as a real complaint.
- **List-page boilerplate duplication across 5 modules** is genuinely
  repetitive but extracting a generic `<sot-data-table>` is a
  cross-module refactor that deserves its own pass; not scoped to this
  review.

---

## 2026-04-16 — Phase 7: Toolbox Talks / Training Records

Not committed yet at time of writing.

### Schema

- SQL migration [`20260416120009_training.sql`](../supabase/migrations/20260416120009_training.sql):
  - `training_sessions` — one row per toolbox talk. Indexed on `(tenant_id, session_date desc)` for the calendar query; FK to `user_profiles(conducted_by)` with `on delete set null` so historical attribution survives supervisor departures.
  - `training_attendance` — one row per attendee. Denormalized `tenant_id` alongside `session_id`, enforced by a cross-tenant alignment trigger (same pattern as equipment_checks and corrective_actions). `attendee_id` FK is nullable so external attendees (visitors, new hires) can be recorded by name.
  - No session-level status column — scheduled/completed is derivable from `session_date < now()`; storing it would invite drift.
  - RLS: sessions are read-tenant / write-staff / delete-admin; attendance is read-tenant / write-staff.
- SQL migration [`20260416120010_enable_toolbox_talks_module.sql`](../supabase/migrations/20260416120010_enable_toolbox_talks_module.sql):
  - Flips `modules.is_available = true` for key `toolbox_talks`.
  - Backfills `tenant_modules` for every existing tenant (idempotent).
  - Replaces `handle_new_user` to include `toolbox_talks` in the default-enabled set for new signups.

### Angular

- Models and services split by concern: `TrainingSession` + `TrainingSessionsService` for the sessions CRUD, `TrainingAttendance` + `TrainingAttendanceService` for the per-attendee work. Attendance service has `signed_at` derived from `signed` transitions (same pattern as closed_at on incidents, completed_at on inspections).
- `TrainingSessionFormComponent` — two-section reactive form (session details + description/location). Reuses the shared `localNow` / `toDatetimeLocal` date helpers and the shared `TenantMemberLookupService` for the conductor dropdown.
- `TrainingAttendancePanelComponent` — the centerpiece of the module. Single input with a datalist sourced from the tenant roster; type/pick/Enter/repeat. Matches typed names against members (case-insensitive full-name); sets `attendee_id` when it matches, leaves it null for externals. Prevents duplicates (by id when available, by name for externals). Auto-focuses the input after every add so supervisors can fly through a room.
- Pages: list (search + date-range + conductor filter), new, `:id` (detail with attendance panel), `:id/edit`.

### Wiring

- `/app/training/{,new,:id,:id/edit}` mounted under `moduleGuard('toolbox_talks')`.
- `MODULE_CATALOGUE.toolbox_talks` flipped to `isAvailable: true` with `route: 'training'` (DB key stays `toolbox_talks`). Sidebar label remains "Toolbox Talks" — industry-standard term.

### Docs

- User guide: new Toolbox Talks section covering session creation, member-vs-external attendee flow, date-range filtering, role permissions.
- Admin guide: two new migration rows, two new table rows, module catalogue updated.

---

## 2026-04-16 — Phase 6 review: Incident Reports polish

Not committed yet at time of writing.

### Refactor: shared date helpers

- `localNow()` and `toDatetimeLocal()` had been copy-pasted into both
  forms with datetime-local inputs (equipment-check-form,
  incident-report-form).
- `new Date(iso).toLocaleString({ dateStyle: 'medium', timeStyle: 'short' })`
  had been copy-pasted into three places (equipment-checks-panel,
  incident-reports-list, incident-report-detail).
- New [src/app/shared/utils/date.util.ts](../src/app/shared/utils/date.util.ts)
  exports `localNow()`, `toDatetimeLocal(iso)`, and `formatDateTime(iso)`.
  Five consumers now share one implementation and one behavior to update
  when i18n / timezone handling lands.

### Feature parity

- New `IncidentReportsService.getOpenCount()` — symmetric with
  `CorrectiveActionsService.getOpenCountByInspection()` and
  `EquipmentChecksService.getActionableCountByEquipment()`. Cheap via
  the `(tenant_id, status)` index. Ready for the dashboard KPI tile and
  the upcoming sidebar-badge story.

### UX polish

- Incident list's `.table__sub` ("Reported by …" under each title) now
  has the same ellipsis treatment as other list pages; long names no
  longer push column width.

### Not changed

- Severity color scale — green-for-low looks slightly odd in a pure
  safety context but matches the app-wide color language and keeps the
  5 levels visually distinct.
- Status lockdown after `submitted` — a workflow decision that depends
  on tenant culture; not adding without a requirement.
- Description required — stays optional; consistent with other modules.

---

## 2026-04-16 — Phase 6: Incident / Near Miss Reporting

Shipped in commit [`06e1628`](https://github.com/DevJ1975/soteria_platform/commit/06e1628).

### Schema

- SQL migration [`20260416120007_incident_reports.sql`](../supabase/migrations/20260416120007_incident_reports.sql):
  - Three enums — `incident_report_type` (6 values), `incident_report_severity` (5 levels), `incident_report_status` (4-stage lifecycle).
  - `incident_reports` table with separate `event_occurred_at` (operational) and `created_at` (audit) timestamps; free-text fields for involved people, immediate actions, and follow-up notes while waiting on richer structure in v2.
  - Indexes for the six query shapes the list page uses (tenant, status, severity, type, event_date, reporter).
  - Four RLS policies — read tenant, insert self (reported_by must equal auth.uid()), update staff-or-reporter, delete staff-only.
  - No DB trigger for `closed_at`; the service layer handles the one-terminal-state rule.
- SQL migration [`20260416120008_enable_incidents_module.sql`](../supabase/migrations/20260416120008_enable_incidents_module.sql):
  - Flips `modules.is_available = true` for key `incidents`.
  - Backfills `tenant_modules` for every existing tenant (idempotent via `on conflict do update`).
  - Replaces `handle_new_user` to include `incidents` among the default-enabled modules for new signups.

### Angular

- Models, labels, filter shape, and `OPEN_INCIDENT_STATUSES` constant exported from a single source file.
- `IncidentReportsService` with CRUD + `getOpenIncidentReports()` + `getReportsByType()` + `closed_at` rule (stamp on transition to `closed`, clear on transition away).
- Severity and status chips (colour scale on severity — informational → critical — matches the urgency).
- `IncidentReportFormComponent` laid out in four sections (What happened · Where & who · Response · Status) because the form is wider than other modules and sectioning makes it less of a wall.
- `max` attribute on the event datetime input so future events can't be filed.
- Re-hydration guard + `lastPatchedId` — same pattern as every other form.
- Pages: list · new · `:id` (detail, document-like narrative) · `:id/edit`. Detail page is the first incident-related page designed as a host for the future corrective-action-from-incident panel.

### Module activation

- `MODULE_CATALOGUE.incidents` flipped to `isAvailable: true` with `route: 'incident-reports'` (DB key stays `incidents` for stability).
- `app.routes.ts` mounts `/app/incident-reports` under `moduleGuard('incidents')`.

### Docs

- User guide: new Incidents section + previously-missing Equipment section, roadmap trimmed.
- Admin guide: module catalogue and migration ledger updated, three new table rows, two new migrations listed.

---

## 2026-04-16 — Phase 5 review: Equipment hardening

Not committed yet at time of writing.

### Correctness fixes

- **PostgREST `.or()` comma bug** in `EquipmentService.getEquipment` —
  search term interpolated directly into a `name.ilike.…,asset_tag.ilike.…`
  filter, so a comma in user input would create a phantom third filter.
  New `sanitizeOrFilterTerm()` util strips commas and double quotes (the
  two delimiters PostgREST uses in filter lists) before
  `escapeIlikePattern()` handles SQL wildcards.
- **`performed_at` accepted future dates** — the datetime-local input now
  has a `max` attribute set to now-at-render, so the browser picker
  refuses future selections. (Still bypassable via devtools, but the
  visible affordance matters for honest users; the server has no
  equivalent check yet — add a CHECK constraint if abuse surfaces.)
- **Duplicate asset_tag surfaced a raw Postgres error.** New
  `isUniqueViolation()` helper in errors.util detects code `23505` and
  (optionally) matches on constraint name. Equipment new/edit pages now
  return "An asset with this tag already exists" instead of the wire-
  level message.

### Refactor: TenantMemberLookupService

- The "resolve user id → name" + "members signal for dropdowns" pattern
  was duplicated in five places (inspections list, inspections form,
  corrective actions list, corrective actions form, equipment checks
  panel). Each called `TenantService.getTenantMembers()` separately, so
  opening the CA list + editing an inspection + viewing an equipment
  item fetched the roster three times.
- New `@core/services/tenant-member-lookup.service.ts` exposes a
  cached, reactive member map:
  - `ensureLoaded()` — single-flight loader, shared across consumers.
  - `members` — sorted signal for dropdowns.
  - `formatName(id, fallback?)` — safe to call before the cache loads
    (returns 'Unassigned' / 'Unknown'); updates reactively when data
    arrives.
  - `reset()` — cache invalidator for a future tenant-switch flow.
- All five call sites refactored. Net: one fetch per session, one
  formatter to update, one behavior to test.

### UX polish

- **Equipment list** — removed the redundant "View" action button; the
  title column already links to the detail page.
- **Equipment checks panel** — header now shows an "N actionable" count
  (in the warning color) computed client-side from loaded rows. No
  extra query. Invisible when count is 0 so the quiet path stays quiet.

---

## 2026-04-16 — Phase 5: Equipment + Equipment Checks

Not committed yet at time of writing.

### Equipment module (third real feature)

- SQL migration [`20260416120005_equipment.sql`](../supabase/migrations/20260416120005_equipment.sql):
  - `equipment_status` enum (`active | maintenance | out_of_service | retired`).
  - `equipment` table with per-tenant case-insensitive unique `asset_tag`
    index (operators often scan tags — "FL-01" and "fl-01" should be the
    same asset).
  - RLS scopes reads to tenant members; create / update / delete restricted
    to staff (admin/supervisor), with delete additionally gated to admins
    only so workers can't remove assets from the register.
- SQL migration [`20260416120006_equipment_checks.sql`](../supabase/migrations/20260416120006_equipment_checks.sql):
  - `equipment_check_status` enum (`pass | fail | needs_attention`).
  - `equipment_checks` table with `tenant_id` denormalized alongside
    `equipment_id`. A `before insert or update` trigger enforces that
    `equipment_checks.tenant_id` equals `equipment.tenant_id` so the
    denormalization can't drift and cross-tenant linkage is blocked
    even if FK checks (which bypass RLS) would otherwise allow it.
  - Insert policy forces `performed_by = auth.uid()` — no ghost-recording
    on behalf of another user.
  - `performed_by` is intentionally absent from the service update
    shape so the original performer is immutable.
- Reusable components:
  - `EquipmentFormComponent` — typed reactive form with required markers
    and max-length caps, last-patched-id guard against re-hydration wipe.
  - `EquipmentStatusChipComponent` / `EquipmentCheckStatusChipComponent`.
  - `EquipmentCheckFormComponent` — mobile-first segmented status control
    (Pass / Needs attention / Fail), datetime-local for backdated checks.
  - `EquipmentChecksPanelComponent` — reusable panel that loads check
    history for one equipment and deep-links "Record check".
- Pages: `/app/equipment` (list) · `new` · `:id` (detail with check panel)
  · `:id/edit` · `:id/checks/new` (record a check).
- Service shapes a `getActionableCountByEquipment()` query for the future
  "N open issues" badge on the equipment list.

### Routing / module naming refactor

- Feature folder renamed `features/equipment-checks/` → `features/equipment/`
  because the module now owns both assets and their check history; the old
  name was only half the story.
- Route changed from `/app/equipment-checks` → `/app/equipment` (with
  nested `/:id/checks/new`).
- Sidebar label updated from "Equipment Checks" → "Equipment".
- **DB module key unchanged** — `tenant_modules.module_key` stays
  `equipment_checks`. Renaming the key would be a breaking DB migration
  for zero functional benefit. Only user-visible and developer-visible
  names changed.

### Carryover from previous review pass

- `.table-card` utility class moved to global styles with `overflow-x: auto`
  so tables scroll horizontally on narrow viewports instead of overflowing
  the page. Per-component duplicates removed from all three list pages.

---

## 2026-04-16 — Phase 4 review: CA hardening

Not committed yet at time of writing. Ships alongside Phase 5.

### Cross-tenant guard on corrective_actions.inspection_id

- Migration [`20260416120004_corrective_actions_cross_tenant_guard.sql`](../supabase/migrations/20260416120004_corrective_actions_cross_tenant_guard.sql).
- Problem: FK checks run as superuser and bypass RLS. A client with a
  stolen UUID could theoretically insert a CA pointing at another tenant's
  inspection; the join on read would hide it but the orphan row would
  exist.
- Fix: `security definer` trigger that rejects any insert/update where
  the linked inspection's tenant differs from the CA's tenant.

### Completed_at logic fix

- Previous logic stamped `now()` on any terminal status transition. Going
  Completed → Verified therefore overwrote the original completion time
  with the verification time — information loss.
- New rule: TO `completed` stamps now; TO `verified` preserves existing
  completed_at (returns `undefined` sentinel so the sparse PATCH omits the
  key entirely rather than letting JSON coerce to null); any other status
  clears it.
- Documented the known limitation: a direct in_progress→verified jump
  leaves completed_at null. A dedicated `verified_at` column plus a DB
  trigger will resolve this properly in a later pass.

### Re-hydration guard on reactive forms

- `InspectionFormComponent` and `CorrectiveActionFormComponent` both
  patched from `initialValue` every time the signal changed — including
  after a successful save, which would wipe any edits the user had
  started in the meantime.
- Fix: a `lastPatchedId` signal records the id of the last entity
  hydrated. The effect only patches when the incoming id differs.

### Shared async utilities

- New [src/app/shared/utils/async-guards.util.ts](../src/app/shared/utils/async-guards.util.ts)
  with `createGenerationGuard()` and `createDebouncer()` factories.
- Generation-counter pattern was duplicated across inspections list,
  corrective actions list, and the corrective actions panel. Now one
  implementation, three callers.
- Debounce pattern was duplicated across both list pages. Same.

### Minor

- Dropped an `OPEN_CORRECTIVE_ACTION_STATUSES as unknown as string[]`
  cast in favor of `[...OPEN_CORRECTIVE_ACTION_STATUSES]`.

---

## 2026-04-16 — Phase 4: Corrective Actions + inspection linkage

Not committed yet at time of writing.

### Corrective Actions module (second real feature)

- SQL migration [`20260416120003_corrective_actions.sql`](../supabase/migrations/20260416120003_corrective_actions.sql).
  - Enums: `corrective_action_status` (`open | in_progress | blocked | completed | verified | cancelled`) and `corrective_action_priority` (`low | medium | high | critical`).
  - Nullable `inspection_id` FK (`on delete set null`) — audit trail survives inspection deletion.
  - Indexes matching list-page and panel queries, including a partial index on `inspection_id where not null`.
  - Four RLS policies mirroring inspections (select / insert / update / delete with staff-or-owner semantics).
- `CorrectiveActionsService` with CRUD, a `byInspection` loader, and a
  `getOpenCountByInspection()` count-query shaped for a future badge.
- Reusable `CorrectiveActionFormComponent` with:
  - Typed reactive form with required-marker visuals and max-length caps.
  - Inspection dropdown fed by `InspectionsService.getInspections()`.
  - Two pre-fill modes: full `initialValue` (edit) and `initialInspectionId` (new-from-inspection-context).
- Status and priority chip components.
- List / new / edit pages parallel to inspections — generation-counter
  refresh, assignee lookup, empty-vs-no-results distinction, clear-filters.
- Pages: `/app/corrective-actions`, `/app/corrective-actions/new` (accepts `?inspectionId=…` query param), `/app/corrective-actions/:id/edit`.

### Inspection linkage

- New `CorrectiveActionsPanelComponent` — a reusable, inspection-aware
  panel that lists linked actions, refreshes when the inspection id
  changes (via `effect()` with a generation counter), and deep-links
  **Add corrective action** with the current inspection pre-selected.
- Panel dropped into the inspection edit page. One-way dependency:
  inspections imports from corrective-actions, never the reverse.
- Query-param binding on the new-action page lands via
  `withComponentInputBinding()` — `?inspectionId=` flows straight into
  an `input()` on the component.
- Return-to-context UX: creating an action from an inspection context
  returns the user to that inspection's edit page so they see the new
  row appear in the panel; creating from the main list returns to the
  main list.

### Docs

- `docs/user-guide.md` — added a "Corrective actions" section covering
  creation (ad-hoc vs. from inspection), fields, status reference,
  inspection linkage UX, and who can do what.
- `docs/admin-guide.md` — module catalogue updated, `corrective_actions`
  added to the tables list, migration row added, role matrix expanded
  with CA columns.

---

## 2026-04-16 — Phase 3 hardening

Not committed yet at time of writing.

### Inspections — production pass

- `InspectionsService`: every query now includes an explicit
  `.eq('tenant_id', …)` in addition to RLS. Defense in depth plus
  self-documenting intent at the call site.
- User search is escaped so PostgreSQL wildcards (`%`, `_`) can't leak
  through. Typing `50%` now matches a literal `50%` instead of
  everything starting with `50`.
- Business rule: `completed_at` is derived from status transitions.
  Moving TO `completed` stamps `now()`; moving AWAY clears the stamp.
  Callers can still override by setting `completedAt` explicitly.
- `InspectionsListComponent`:
  - Generation counter guards against stale filter responses overwriting
    newer data when the user changes filters faster than the network.
  - Assignee names surface via an in-memory tenant-roster lookup; the
    assignee filter also offers a per-person dropdown.
  - Distinct empty states for "no inspections yet" vs. "no matches for
    the current filters".
  - **Clear filters** button appears when any filter is active.
  - Row count + refreshing indicator in a `list-meta` strip.
  - `DestroyRef.onDestroy()` clears the debounce timeout on teardown.
- `InspectionFormComponent`:
  - Fully typed reactive form (dropped the redundant `FormGroup`
    annotation so Angular infers the shape from the controls).
  - Required markers (`*`) on Title, Type, Priority labels.
  - `maxLength` validators and attributes on title (200) and
    description (2000).
  - Granular title error messages (required vs. min-length vs. too long).
  - `role="alert"` on inline errors for screen readers.
  - All `<option>` elements now use `[ngValue]` uniformly.
- Shared `extractErrorMessage()` replaces three duplicated local helpers
  (inspections list, new, edit) and two more in the auth pages (login,
  signup).
- Shared `.sot-state` utility class in `styles.scss` for inline
  "Loading…" / "Not found" states; replaces the duplicated per-component
  CSS block.
- New file: [src/app/shared/utils/errors.util.ts](../src/app/shared/utils/errors.util.ts).

---

## 2026-04-16 — Phase 3: Inspections CRUD + /app routing

Commit [`abb046c`](https://github.com/DevJ1975/soteria_platform/commit/abb046c).

### Inspections module (first real feature)

- SQL migration [`20260416120002_inspections.sql`](../supabase/migrations/20260416120002_inspections.sql) applied to remote.
  - Table with `inspection_status` and `inspection_priority` enums.
  - Indexes matching the list-page query shapes.
  - `updated_at` trigger reusing `public.touch_updated_at()`.
  - Four RLS policies — select (tenant), insert (tenant + self), update
    (staff any, workers own/assigned), delete (staff only).
- Angular models (`Inspection`, `CreateInspectionPayload`,
  `UpdateInspectionPayload`, filter types) with display-label maps used
  across chips, form, and list.
- `InspectionsService` with tenant-aware CRUD and sparse PATCH semantics.
- `TenantService.getTenantMembers()` added for the assignee dropdown.
- Reusable `InspectionFormComponent` powering both new and edit pages.
- `InspectionStatusChip` and `InspectionPriorityChip` for the list view.
- Pages: list (search + filters + table), new, edit (with delete).

### Routing refactor

- Everything authenticated now lives under `/app/*` — clean separation
  from the public `/auth/*` area and room for future marketing pages
  at `/`.
- `/` redirects to `/app`; `/app` redirects to `/app/dashboard`.
- Sidebar links, login default redirect, `publicOnlyGuard` redirect,
  and `moduleGuard` fallback all updated.
- Removed the obsolete `features/inspections/inspections.component.ts`
  placeholder.

---

## 2026-04-16 — Phase 2: Schema + RLS

Shipped in commit [`54ebd83`](https://github.com/DevJ1975/soteria_platform/commit/54ebd83).

- Migration [`20260416120000_initial_schema.sql`](../supabase/migrations/20260416120000_initial_schema.sql) applied to remote.
  - Tables: `tenants`, `user_profiles`, `modules`, `tenant_modules`.
  - Indexes on all tenant-keyed columns.
  - Shared `touch_updated_at()` trigger function, attached to
    mutable tables.
  - Module catalogue seeded with all seven modules (three available,
    four behind the availability flag).
  - `handle_new_user` trigger provisions a tenant + profile + default
    modules on every `auth.users` insert.
- Migration [`20260416120001_row_level_security.sql`](../supabase/migrations/20260416120001_row_level_security.sql) applied to remote.
  - Helper functions: `current_tenant_id()`, `current_user_role()`.
  - RLS enabled on all four core tables.
  - Policies scope reads and writes by tenant; admins gate module
    toggles and tenant updates.

### Angular side

- Models re-aligned with the SQL: `UserProfile` uses
  `firstName`/`lastName`; `TenantModule` uses `isEnabled`.
- `AuthService.loadProfile()` selects explicit columns and maps
  snake_case to camelCase; a `fullName` computed signal replaces
  scattered string concatenation.
- `ModuleRegistryService` queries `is_enabled` and merges results
  with the static `MODULE_CATALOGUE` for icon + route metadata.
- Sidebar binds to `ModuleRegistryService.modules()` — toggling
  `tenant_modules.is_enabled` in the DB hides the module everywhere
  with zero frontend changes.

---

## 2026-04-16 — Phase 1: Angular + Supabase foundation

Shipped in commit [`54ebd83`](https://github.com/DevJ1975/soteria_platform/commit/54ebd83).

- Angular 19 standalone app with signals, strict TS, lazy-loaded routes.
- Supabase JS client wrapped in a single DI service.
- Email/password sign-in and sign-up with session restore, promise-based
  initializer, and three route guards (`authGuard`, `publicOnlyGuard`,
  `moduleGuard(key)`).
- Multi-tenant core models: `Tenant`, `UserProfile`, `Module`,
  `TenantModule`.
- Feature-flag module registry driven by `tenant_modules`.
- Authenticated shell (sidebar + topbar) with inline-SVG icons and a
  gradient initials avatar.
- Two-pane auth layout for the unauthenticated area.
- Placeholder pages for Equipment Checks and Corrective Actions using a
  shared empty-state component.
- Design tokens in CSS custom properties (`--color-*`, `--space-*`,
  `--radius-*`, `--shadow-*`) for consistent theming.

---

## Upcoming

Nothing dated yet. Likely next increments:

- **Heat compliance** or **LOTO** — the two remaining modules in the
  catalogue.
- **Open-issues badges on list pages** — the count methods now exist
  for all three sources (`getOpenCountByInspection`,
  `getOpenCountByIncidentReport`, `getOpenCountByEquipmentCheck`).
  Surface them on the inspection, incident, and equipment list pages
  as small chips next to each row.
- **Admin UI** — web forms for toggling modules and changing user roles
  (replaces the SQL-only workflow).
- **Invite flow** — admins add teammates by email; the trigger attaches
  them to the existing tenant instead of creating a new one.
- **Inspection detail view** — read-only page at `/app/inspections/:id`
  mirroring the equipment + incident detail page pattern. The last
  module that still puts its panel on the edit page instead of a
  dedicated detail view.
- **Role-based UI** — hide controls the current role can't use (delete
  buttons for workers, etc.), backed by the RLS policies already in
  place.
