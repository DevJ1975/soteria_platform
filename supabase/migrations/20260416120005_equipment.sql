-- ============================================================================
-- Soteria — Equipment
--
-- An equipment row represents a physical asset (forklift, lift, truck, etc.)
-- that gets checked periodically. Every asset belongs to one tenant and
-- optionally to one site (sites table doesn't exist yet — `site_id` is a
-- plain uuid for now; the FK will be added when we build the sites module).
--
-- Design notes
-- ------------
-- * `asset_tag` is unique per tenant, case-insensitive. Operators often
--   read tags off a sticker ("FL-01") and we don't want "fl-01" to create
--   a duplicate. The unique index includes `lower(asset_tag)` for that.
-- * `equipment_type` is plain text so tenants can add their own types
--   later without a migration. The frontend pins a common set via a
--   TypeScript union.
-- * `equipment_status` is a DB enum. New values can be added with
--   `alter type … add value`.
-- * Creation/modification is scoped to staff (admin/supervisor). Workers
--   perform checks but shouldn't be editing the equipment register.
-- ============================================================================

-- Enum ------------------------------------------------------------------------
do $$ begin
  create type public.equipment_status as enum (
    'active',
    'maintenance',
    'out_of_service',
    'retired'
  );
exception when duplicate_object then null; end $$;


-- Table -----------------------------------------------------------------------
create table public.equipment (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  site_id         uuid,
  name            text not null,
  asset_tag       text not null,
  equipment_type  text not null default 'other',
  manufacturer    text,
  model           text,
  serial_number   text,
  status          public.equipment_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Asset tag unique within a tenant (case-insensitive).
create unique index equipment_tenant_asset_tag_uq
  on public.equipment (tenant_id, lower(asset_tag));

create index equipment_tenant_id_idx
  on public.equipment (tenant_id);
create index equipment_tenant_status_idx
  on public.equipment (tenant_id, status);
create index equipment_tenant_type_idx
  on public.equipment (tenant_id, equipment_type);

create trigger equipment_touch_updated_at
  before update on public.equipment
  for each row execute function public.touch_updated_at();


-- Row Level Security ----------------------------------------------------------
alter table public.equipment enable row level security;

-- Read: everyone in the tenant.
create policy equipment_select_same_tenant on public.equipment
  for select
  using (tenant_id = public.current_tenant_id());

-- Create / update / delete: staff only. Workers record checks but shouldn't
-- be able to modify the asset register — that's an asset-management
-- concern, not a field-operations concern.
create policy equipment_insert_by_staff on public.equipment
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  );

create policy equipment_update_by_staff on public.equipment
  for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin', 'supervisor')
  )
  with check (tenant_id = public.current_tenant_id());

create policy equipment_delete_by_admin on public.equipment
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('platform_admin', 'admin')
  );
