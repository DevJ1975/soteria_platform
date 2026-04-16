# Soteria — Changelog

What's shipped, in reverse chronological order.

> **How this is maintained:** entries are added in the same session as
> the work they describe. If you spot code that isn't reflected here,
> the log is stale — please flag it and we'll patch it.

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

- **Report → corrective-action linkage** — add an optional
  `incident_report_id` FK on `corrective_actions` (mirror of
  `inspection_id`), a "Create corrective action" button on the incident
  detail page with query-param deep-link, and a linked-actions panel on
  the detail page to close the loop visually.
- **Failed-check → corrective-action flow** — same cross-module linkage
  for equipment checks (`equipment_check_id` FK on corrective_actions).
- **Open-issues badges on list pages** — surface the count service
  methods that already exist (`getOpenCountByInspection`,
  `getActionableCountByEquipment`, and the new
  `OPEN_INCIDENT_STATUSES` set) on their respective list pages.
- **Admin UI** — web forms for toggling modules and changing user roles
  (replaces the SQL-only workflow).
- **Invite flow** — admins add teammates by email; the trigger attaches
  them to the existing tenant instead of creating a new one.
- **Inspection detail view** — read-only page at `/app/inspections/:id`
  mirroring the equipment + incident detail page pattern.
- **Role-based UI** — hide controls the current role can't use (delete
  buttons for workers, etc.), backed by the RLS policies already in
  place.
