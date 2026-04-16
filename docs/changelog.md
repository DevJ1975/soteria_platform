# Soteria — Changelog

What's shipped, in reverse chronological order.

> **How this is maintained:** entries are added in the same session as
> the work they describe. If you spot code that isn't reflected here,
> the log is stale — please flag it and we'll patch it.

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

- **Open-actions badge on the inspections list** — surface
  `CorrectiveActionsService.getOpenCountByInspection` in the list page
  so users see "3 open" next to each inspection at a glance.
- **Equipment Checks v1** — first real implementation of the third
  module, completing the placeholder → real module transition.
- **Admin UI** — web forms for toggling modules and changing user roles
  (replaces the SQL-only workflow).
- **Invite flow** — admins add teammates by email; the trigger attaches
  them to the existing tenant instead of creating a new one.
- **Inspection detail view** — read-only page at `/app/inspections/:id`
  with activity timeline and quick-action buttons.
- **Role-based UI** — hide controls the current role can't use (delete
  buttons for workers, etc.), backed by the RLS policies already in
  place.
