# Soteria — User Guide

Welcome to Soteria, the mobile-first safety operations platform for high-risk industries.

> **About this guide**
> Last updated: **2026-04-16**. This guide is maintained in the same
> session as the code it describes. If something here doesn't match what
> you see in the app, the app is right — please report the mismatch so we
> can patch the guide.

## Table of contents

- [Getting started](#getting-started)
- [The dashboard](#the-dashboard)
- [Inspections](#inspections)
- [Corrective actions](#corrective-actions)
- [Equipment](#equipment)
- [Incident reports](#incident-reports)
- [Your role](#your-role)
- [What's next](#whats-next)

---

## Getting started

### Create your account

1. Open the Soteria sign-up page at `/auth/signup`.
2. Enter your full name, work email, and a password (8+ characters).
3. Check your email for a confirmation link and click it.
4. Return to the app and sign in at `/auth/login`.

On first sign-in, Soteria automatically creates a workspace for your
organization and makes you its admin. Teammates will be added later once
the invite flow ships — today, each new sign-up creates its own
organization.

### Sign in

Enter your email and password at `/auth/login`. Soteria keeps you signed
in across browser restarts; sign out from the top-right of the app shell
to end the session.

---

## The dashboard

The dashboard at `/app/dashboard` is your daily launchpad. It shows:

- **KPI tiles** — open inspections, equipment flags, actions due, and the
  count of modules enabled for your organization. These populate once
  data exists.
- **Getting started panel** — a checklist of setup tasks for new
  organizations.

Use the sidebar on the left to move between modules.

---

## Inspections

The Inspections module at `/app/inspections` lets you plan, assign, and
track safety inspections across your sites.

### Viewing inspections

The list page shows every inspection in your organization — anyone on
your team can see them. Each row includes:

| Column | What it shows |
| --- | --- |
| **Title** | The inspection name. Click to open the edit page. |
| **Type** | General, Safety walk, Equipment, Site, or Pre-task. |
| **Status** | Draft, Scheduled, In progress, Completed, Overdue, Cancelled. |
| **Priority** | Low, Medium, High, Critical. |
| **Assignee** | Who's responsible, or "Unassigned". |
| **Due date** | When it should be done by. |

The top strip tells you how many inspections match your current filters
and whether a refresh is in flight.

### Filtering and searching

The filter bar at the top supports:

- **Search title** — case-insensitive partial match. Typing is
  debounced, so results update ~250 ms after you stop typing.
- **Status** / **Priority** — narrow to one value or show all.
- **Assigned to** — *Everyone*, *Assigned to me*, or a specific teammate.

Any active filter reveals a **Clear filters** button.

If no inspections match your filters, you'll see a "No matches" panel
with a shortcut to clear them. That's distinct from the "No inspections
yet" empty state you see in a brand-new organization.

### Creating an inspection

1. Click **New inspection** on the list page (top right).
2. Fill in the fields:
   - **Title** (required, 3–200 characters)
   - **Type** (required, defaults to General)
   - **Priority** (required, defaults to Medium)
   - **Status** (defaults to Draft)
   - **Due date** (optional)
   - **Assigned to** (optional — pick from a teammate or leave unassigned)
   - **Description** (optional, up to 2,000 characters)
3. Click **Create inspection**.

Validation errors appear inline beneath the offending field. The submit
button is disabled until the form is valid.

### Editing an inspection

Click the title or the **Edit** button on any row to open the edit
page. Change whatever you need and click **Save changes**. Edits
persist immediately.

### Deleting an inspection

Only admins and supervisors can delete. Workers should set the status to
*Cancelled* instead — deletion is permanent and you lose the audit
trail. To delete, click the **Delete** button on a row or from the edit
page, then confirm.

### Status reference

| Status | Meaning |
| --- | --- |
| **Draft** | Created but not ready to go. |
| **Scheduled** | On the calendar, not yet started. |
| **In progress** | Being worked right now. |
| **Completed** | Done. Soteria stamps the completion time automatically. |
| **Overdue** | Past its due date and still open. |
| **Cancelled** | Not going ahead. Use instead of deletion. |

Changing status to *Completed* auto-populates the completion timestamp.
Flipping it back to any other status clears that stamp.

### Priority reference

From least to most urgent:

| Priority | When to use |
| --- | --- |
| **Low** | No immediate impact. |
| **Medium** | Default for routine work. |
| **High** | Needs attention this week. |
| **Critical** | Safety risk — act now. |

---

## Corrective actions

The Corrective Actions module at `/app/corrective-actions` tracks
remediation items — things that need fixing in response to inspections,
hazard reports, audit gaps, or any other safety concern.

Think of it as the action register that closes the loop: an inspection
surfaces a finding, a corrective action owns the fix.

### When to create an action

- **From an inspection finding** — click the **Add corrective action**
  button inside any inspection's **Corrective actions** panel (more on
  that below). The action will be pre-linked to the inspection.
- **Ad-hoc** — from the main **Corrective actions** page, click
  **New action**. Leave the linked inspection empty for hazard reports,
  audit gaps, or any issue that didn't come from a formal inspection.

### Fields

| Field | Notes |
| --- | --- |
| **Title** | Required, 3–200 characters. |
| **Priority** | Low · Medium · High · Critical (same scale as inspections). |
| **Status** | See status reference below. |
| **Due date** | Optional. |
| **Assigned to** | Pick a teammate or leave unassigned. |
| **Linked inspection** | Optional. Set when the action addresses a specific inspection finding. |
| **Description / notes** | Optional, up to 2,000 characters. Use for parts needed, constraints, or context. |

### Status reference

Corrective actions have a richer workflow than inspections because they
often need sign-off:

| Status | Meaning |
| --- | --- |
| **Open** | Created, not yet started. |
| **In progress** | Actively being worked. |
| **Blocked** | Can't proceed — waiting on parts, a person, or a decision. |
| **Completed** | Work is done, awaiting supervisor verification. |
| **Verified** | Completed and signed off. Terminal state. |
| **Cancelled** | No longer applicable. Preferred over deletion. |

Soteria stamps the completion time automatically when an action moves to
**Completed** or **Verified**, and clears it when the action moves back
out of those states.

### Inspection linkage

When you're editing an inspection, scroll past the inspection form to
the **Corrective actions** panel. It shows:

- Every action already linked to this inspection, with its status.
- An **Add corrective action** button that takes you straight to the
  new-action form with this inspection pre-linked.

Click any action in the panel to open its edit page.

The relationship is one inspection → many corrective actions. An action
can also exist without an inspection (ad-hoc report).

### Filtering and searching

Same shape as the inspections list — search by title, filter by status,
priority, and assignee. A **Linked inspection** column appears on the
list so you can see context at a glance; click the inspection title to
jump to it.

### Who can do what

- **Workers** can create actions and edit those they created or are
  assigned to. They can't delete — use *Cancelled* status instead.
- **Supervisors and admins** can edit and delete any action in the tenant.

---

## Equipment

The Equipment module at `/app/equipment` is the asset register plus a
log of safety checks performed against each asset.

### Register a piece of equipment

From the list page click **New equipment**. Required fields:

- **Name** (e.g. "Yard forklift #3")
- **Asset tag** — unique within your organization. Case-insensitive,
  so "FL-03" and "fl-03" are treated as the same tag.
- **Type** — Forklift, Scissor lift, Boom lift, Pallet jack, Truck,
  Trailer, or Other.

Optional: manufacturer, model, serial number. Only admins and
supervisors can register or edit equipment; workers record checks.

### Record a check

From an equipment's detail page, click **Record check**. The form
asks for:

- **Outcome** — Pass · Needs attention · Fail. This is the big
  decision on the form; on mobile it's a three-button segmented
  control.
- **Check type** — Pre-use, Daily, Weekly, Monthly, Walkaround,
  Condition, or Other.
- **Performed at** — defaults to now. You can backdate if you're
  logging a check retroactively; future times aren't allowed.
- **Notes** — anything worth recording.

After save, you return to the equipment's detail page and the new
check appears at the top of the history panel.

### Check history

The detail page shows every check ever recorded against this
equipment, newest first, with the performer's name and outcome. A
count like "3 actionable" appears in the panel header when any of
the loaded checks are Fail or Needs attention.

### Deleting equipment

Only admins can delete an equipment record. Deleting cascades the
check history — you're warned explicitly before it happens.

---

## Incident reports

The Incidents & Near Misses module at `/app/incident-reports` is where
you file structured records of safety events and observations.

### What counts as a report?

Six types, all logged through the same form:

| Type | When to use |
| --- | --- |
| **Incident** | An event that caused harm, damage, or a dangerous condition. |
| **Near miss** | An event that could have caused harm but didn't. |
| **Injury** | Any personal injury, however minor. |
| **Property damage** | Damage to equipment, vehicles, structures, or materials. |
| **Unsafe condition** | A hazardous state that hasn't yet caused an event. |
| **Observation** | A safety-relevant note — positive or negative — worth capturing. |

### Filing a report

Click **New report** on the list page. The form is grouped into
four sections so you can move through it logically:

1. **What happened** — title, type, severity, when it occurred,
   description.
2. **Where & who** — location, people involved (free-text for now;
   a structured witness list is planned).
3. **Response** — immediate actions taken on the spot; follow-up
   notes for what still needs to happen.
4. **Status** — where this report is in the investigation
   lifecycle.

You can save as **Draft** and come back later — the form won't
hold you up just because you haven't finished the narrative.

### Severity

Five levels, from least to most urgent:

| Level | When to use |
| --- | --- |
| **Informational** | Observations and notes with no immediate risk. |
| **Low** | Minor event, no injury or damage. |
| **Medium** | First-aid-level injury, near miss with real potential. |
| **High** | Lost-time injury, significant damage. |
| **Critical** | Serious injury, fatality, major property damage. |

### Status lifecycle

| Status | Meaning |
| --- | --- |
| **Draft** | Being written. Not yet a formal report. |
| **Submitted** | Filed and awaiting review. |
| **Investigating** | Being actively looked into. |
| **Closed** | Resolved. The closed date is stamped automatically; reverting to any other status clears it. |

### Report detail view

Clicking a report's title opens a read-mostly detail page with the
narrative laid out as a document — one card per section. This is
the view safety leads will use when they review or share a report
with management.

### Filtering and searching

The list page supports:

- **Search title** — partial match.
- **Status** — including an "Open" shortcut that matches anything
  not yet closed.
- **Type** · **Severity** · **Reported by**.
- **Clear filters** when any are active.

### Who can do what

- **Workers** can file reports and edit reports they filed. They
  can't delete (reports are an audit artifact).
- **Supervisors and admins** can edit and delete any report in
  the tenant.

---

## Your role

Soteria distinguishes four roles:

| Role | Who | What you can do |
| --- | --- | --- |
| **Platform admin** | Soteria staff | Cross-tenant access. |
| **Admin** | Tenant owner | Full CRUD on everything in your organization. |
| **Supervisor** | Team lead | Create, edit, and delete any inspection. |
| **Worker** | Field user | Create inspections; edit only your own created/assigned inspections; cannot delete. |

The first person to sign up becomes the admin of the new organization.

Role-based UI (hiding buttons you can't use) is coming in a later
release. Right now, the database enforces role-based writes — e.g., a
worker clicking Delete will see an error rather than the row
disappearing.

---

## What's next

These are on the roadmap but not yet in the product:

- Toolbox talks / training
- Heat compliance
- LOTO (lockout / tagout)

See the [changelog](changelog.md) for what shipped when.
