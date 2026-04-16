-- ============================================================================
-- Soteria — Stripe integration (Phase 13)
--
-- Adds the bridge between our internal catalogue and Stripe:
--   * `subscription_plans.stripe_price_id` maps a plan to a Stripe Price.
--   * `subscriptions.billing_provider` names which provider owns the row.
--   * `billing_events.external_event_id` gives the webhook handler a
--     cheap idempotency check (Stripe retries failed webhooks, and we
--     must not double-log).
--
-- None of this requires changing existing data. Plan rows default to
-- `stripe_price_id = null` until an operator populates them via the
-- platform-admin plan editor. New-tenant trials keep working without
-- Stripe — the auto-provisioning trigger doesn't touch these columns.
-- ============================================================================

-- Provider enum on subscriptions -------------------------------------------
-- Even though Stripe is the only integration shipping now, naming the
-- provider explicitly (rather than implying it by the `external_*`
-- fields) makes the row self-documenting and leaves room for Paddle /
-- manual / future-provider without another enum migration.

do $$ begin
  create type public.billing_provider as enum (
    'manual',
    'stripe'
  );
exception when duplicate_object then null; end $$;

alter table public.subscriptions
  add column if not exists billing_provider public.billing_provider
  not null default 'manual';

-- Backfill: any row that already carries a Stripe subscription id must
-- be a stripe row. Mostly a no-op for fresh installs; protects upgrades
-- that land after Phase 13 is partially in use.
update public.subscriptions
   set billing_provider = 'stripe'
 where external_subscription_id is not null
   and billing_provider = 'manual';


-- Stripe price mapping on plans -------------------------------------------
-- One Stripe Price id per plan for Phase 13. Promote to a
-- `stripe_prices` join table later if we need multiple prices per plan
-- (monthly/annual, tiered, enterprise).

alter table public.subscription_plans
  add column if not exists stripe_price_id text;

comment on column public.subscription_plans.stripe_price_id is
  'Stripe Price id (price_XXX). Null until mapped by an operator. The '
  'checkout-session edge function refuses to run against a plan with '
  'no price id.';

-- Partial index — used when a webhook arrives carrying a price id and
-- we need the matching plan.
create index if not exists idx_subscription_plans_stripe_price_id
  on public.subscription_plans(stripe_price_id)
  where stripe_price_id is not null;


-- Webhook idempotency on billing_events -----------------------------------
-- Stripe retries webhook deliveries on non-2xx responses. Recording the
-- provider's event id on every ingested event lets us short-circuit
-- duplicates in O(log n) via the unique index.
--
-- Column is deliberately generic (`external_event_id`, not
-- `stripe_event_id`) so non-Stripe future providers can reuse the same
-- mechanism.

alter table public.billing_events
  add column if not exists external_event_id text;

create unique index if not exists idx_billing_events_external_event_id
  on public.billing_events(external_event_id)
  where external_event_id is not null;
