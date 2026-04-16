-- ============================================================================
-- Soteria — Billing & subscription lifecycle foundation (Phase 12)
--
-- Introduces a dedicated `subscriptions` table as the source of truth for
-- "what plan is this tenant on, and in what lifecycle state", plus an
-- append-only `billing_events` log.
--
-- Why a separate table (and not columns on `tenants`)
-- ---------------------------------------------------
-- * Billing lifecycle changes independently of organizational identity.
-- * Accumulates provider-specific metadata (Stripe customer / subscription
--   ids, period markers, cancellation flags) that doesn't belong on the
--   tenant row.
-- * Needs its own RLS — writes are platform-admin only, reads are
--   tenant-scoped.
--
-- Relationship with `tenants.plan_id`
-- -----------------------------------
-- `subscriptions.plan_id` is the canonical plan pointer from now on.
-- `tenants.plan_id` stays as a *derived* column so the module-access
-- resolver keeps its one-row, one-column fast path. A trigger syncs the
-- derivation on every subscription insert/update.
--
-- Stripe readiness
-- ----------------
-- * `external_customer_id` / `external_subscription_id` are reserved for
--   Stripe ids (or any other provider). Null for now.
-- * `metadata` JSONB accepts whatever the provider's webhook payload
--   adds later without another migration.
-- * `billing_events` mirrors the Stripe event shape (type + metadata),
--   so webhook handlers can insert directly.
-- ============================================================================

-- Enums ----------------------------------------------------------------------

do $$ begin
  create type public.subscription_status as enum (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'inactive'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.billing_event_type as enum (
    'subscription_created',
    'trial_started',
    'trial_ended',
    'plan_upgraded',
    'plan_downgraded',
    'plan_changed',
    'subscription_canceled',
    'subscription_reactivated',
    'status_changed',
    'external_sync'
  );
exception when duplicate_object then null; end $$;


-- Subscriptions --------------------------------------------------------------
-- One row per tenant. Plan changes and lifecycle transitions happen
-- in-place on this row; history is captured in `billing_events`.

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null unique references public.tenants(id) on delete cascade,
  plan_id                   uuid references public.subscription_plans(id) on delete restrict,
  status                    public.subscription_status not null default 'trialing',

  trial_start_date          timestamptz,
  trial_end_date            timestamptz,
  current_period_start      timestamptz,
  current_period_end        timestamptz,

  -- cancel_at: future timestamp when the cancellation takes effect.
  -- canceled_at: when the cancellation request was *made* (audit only).
  -- Both are nullable; only set when the tenant is on the cancellation
  -- path.
  cancel_at                 timestamptz,
  canceled_at               timestamptz,

  -- Provider placeholders. Stripe webhooks will populate these.
  external_customer_id      text,
  external_subscription_id  text,
  metadata                  jsonb not null default '{}'::jsonb,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.subscriptions is
  'Per-tenant billing lifecycle record. Source of truth for plan assignment.';

-- Indexes — support the common query shapes:
--   * "all subscriptions currently in trial" (for trial-expiry sweeps)
--   * "all past_due subscriptions" (for dunning dashboards)
--   * "lookup by external provider id" (for webhook reconciliation)
create index idx_subscriptions_status
  on public.subscriptions(status);

create index idx_subscriptions_trial_end
  on public.subscriptions(trial_end_date)
  where status = 'trialing';

create index idx_subscriptions_external_subscription_id
  on public.subscriptions(external_subscription_id)
  where external_subscription_id is not null;

-- updated_at trigger (reuses the shared helper defined in 120000).
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();


-- Billing events -------------------------------------------------------------
-- Append-only audit log. Every subscription mutation should produce one
-- or more events so we can tell "what happened and when" without
-- diffing history-less tables.

create table public.billing_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  event_type      public.billing_event_type not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.billing_events is
  'Append-only billing audit log. No updates, no deletes.';

create index idx_billing_events_tenant_created
  on public.billing_events(tenant_id, created_at desc);

create index idx_billing_events_event_type
  on public.billing_events(event_type);


-- Sync subscription → tenant.plan_id ---------------------------------------
-- Keeps the existing module-access fast path working. Access-granting
-- statuses push the plan to tenants.plan_id; terminal statuses null it
-- out so the tenant loses plan-default module access.

create or replace function public.sync_tenant_plan_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grants_access boolean;
begin
  grants_access := new.status in ('trialing', 'active', 'past_due')
    or (new.status = 'canceled' and (new.cancel_at is null or new.cancel_at > now()));

  if grants_access then
    update public.tenants
       set plan_id = new.plan_id
     where id = new.tenant_id
       and plan_id is distinct from new.plan_id;
  else
    update public.tenants
       set plan_id = null
     where id = new.tenant_id
       and plan_id is not null;
  end if;

  return new;
end;
$$;

create trigger subscriptions_sync_tenant_plan
  after insert or update of plan_id, status, cancel_at
  on public.subscriptions
  for each row execute function public.sync_tenant_plan_from_subscription();


-- Auto-create trial subscription on tenant insert --------------------------
-- When a brand-new tenant appears (signup → handle_new_user inserts a
-- tenant row), give them a 14-day trial on whatever plan handle_new_user
-- picked. For operator-created tenants we still default to trial so
-- platform admins don't have to remember a separate step.

create or replace function public.handle_new_tenant_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid := new.plan_id;
  v_now     timestamptz := now();
  v_trial_end timestamptz;
  v_sub_id  uuid;
begin
  -- Fall back to the cheapest active plan if the tenant was created
  -- without one (shouldn't happen given handle_new_user, but belt-and-
  -- suspenders for manual inserts).
  if v_plan_id is null then
    select id into v_plan_id
      from public.subscription_plans
     where is_active = true
     order by sort_order asc
     limit 1;
  end if;

  v_trial_end := v_now + interval '14 days';

  insert into public.subscriptions (
    tenant_id, plan_id, status,
    trial_start_date, trial_end_date
  ) values (
    new.id, v_plan_id, 'trialing',
    v_now, v_trial_end
  )
  returning id into v_sub_id;

  insert into public.billing_events (tenant_id, subscription_id, event_type, metadata)
  values (
    new.id, v_sub_id, 'subscription_created',
    jsonb_build_object(
      'plan_id', v_plan_id,
      'initial_status', 'trialing'
    )
  );

  insert into public.billing_events (tenant_id, subscription_id, event_type, metadata)
  values (
    new.id, v_sub_id, 'trial_started',
    jsonb_build_object(
      'trial_end_date', v_trial_end,
      'trial_days', 14
    )
  );

  return new;
end;
$$;

create trigger tenants_create_subscription
  after insert on public.tenants
  for each row execute function public.handle_new_tenant_subscription();


-- Backfill subscriptions for existing tenants ------------------------------
-- Existing tenants (before this migration) skip the trial and land
-- directly in `active` — they've been using the product already.
-- If their tenant.plan_id is null they go straight to `inactive`.

insert into public.subscriptions (
  tenant_id, plan_id, status,
  current_period_start, current_period_end
)
select
  t.id,
  t.plan_id,
  case when t.plan_id is null then 'inactive'::public.subscription_status
       else 'active'::public.subscription_status
  end,
  now(),
  now() + interval '30 days'
from public.tenants t
where not exists (
  select 1 from public.subscriptions s where s.tenant_id = t.id
);

insert into public.billing_events (tenant_id, subscription_id, event_type, metadata)
select s.tenant_id, s.id, 'subscription_created',
       jsonb_build_object('backfilled', true, 'initial_status', s.status)
  from public.subscriptions s
 where not exists (
   select 1 from public.billing_events e
    where e.tenant_id = s.tenant_id
      and e.event_type = 'subscription_created'
 );


-- Row Level Security -------------------------------------------------------

alter table public.subscriptions  enable row level security;
alter table public.billing_events enable row level security;

-- Subscriptions: tenant members read their own; platform admins see all
-- and mutate freely. Tenant admins *cannot* write — plan changes flow
-- through controlled service methods until self-serve billing ships.

create policy subscriptions_select_own
  on public.subscriptions
  for select
  using (tenant_id = public.current_tenant_id());

create policy subscriptions_select_by_platform_admin
  on public.subscriptions
  for select
  using (public.current_user_role() = 'platform_admin');

create policy subscriptions_write_by_platform_admin
  on public.subscriptions
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');


-- Billing events: same read scopes; writes only from platform admins
-- or from security-definer trigger functions (which bypass RLS).

create policy billing_events_select_own
  on public.billing_events
  for select
  using (tenant_id = public.current_tenant_id());

create policy billing_events_select_by_platform_admin
  on public.billing_events
  for select
  using (public.current_user_role() = 'platform_admin');

create policy billing_events_write_by_platform_admin
  on public.billing_events
  for all
  using (public.current_user_role() = 'platform_admin')
  with check (public.current_user_role() = 'platform_admin');
