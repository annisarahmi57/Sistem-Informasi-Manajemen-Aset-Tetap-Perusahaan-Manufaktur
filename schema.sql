-- =========================================================
-- ASSET MANAGEMENT VANILLA - SUPABASE DATABASE SCHEMA
-- Sistem Informasi Manajemen Aset Tetap Manufaktur
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 1. USERS PROFILE
-- ---------------------------------------------------------
create table if not exists public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'technician'
    check (role in ('admin', 'technician', 'manager')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 2. ASSETS
-- ---------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null,
  category text not null
    check (category in (
      'Mesin Pabrik',
      'Peralatan Produksi',
      'Kendaraan Operasional',
      'Bangunan Pabrik'
    )),
  location text not null,
  purchase_date date not null,
  purchase_cost numeric(20,2) not null check (purchase_cost >= 0),
  salvage_value numeric(20,2) not null default 0
    check (salvage_value >= 0 and salvage_value <= purchase_cost),
  useful_life integer not null check (useful_life >= 1),
  depreciation_method text not null default 'straight_line'
    check (depreciation_method in ('straight_line', 'double_declining')),
  status text not null default 'active'
    check (status in ('active', 'maintenance', 'disposed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 3. MAINTENANCE RECORDS
-- ---------------------------------------------------------
create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  maintenance_type text not null
    check (maintenance_type in ('preventive', 'corrective')),
  title text not null,
  description text,
  scheduled_date date not null,
  completion_date date,
  cost numeric(20,2) not null default 0 check (cost >= 0),
  technician_name text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completion_date is null or completion_date >= scheduled_date)
);

-- ---------------------------------------------------------
-- 4. DEPRECIATION SCHEDULES
-- ---------------------------------------------------------
create table if not exists public.depreciation_schedules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  year integer not null check (year >= 1),
  period_date date not null,
  depreciation_amount numeric(20,2) not null default 0 check (depreciation_amount >= 0),
  accumulated_depreciation numeric(20,2) not null default 0 check (accumulated_depreciation >= 0),
  book_value numeric(20,2) not null default 0 check (book_value >= 0),
  created_at timestamptz not null default now(),
  unique (asset_id, year)
);

-- ---------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------
create index if not exists idx_assets_category on public.assets(category);
create index if not exists idx_assets_status on public.assets(status);
create index if not exists idx_assets_purchase_date on public.assets(purchase_date);
create index if not exists idx_maintenance_asset_id on public.maintenance_records(asset_id);
create index if not exists idx_maintenance_status on public.maintenance_records(status);
create index if not exists idx_maintenance_scheduled_date on public.maintenance_records(scheduled_date);
create index if not exists idx_depreciation_asset_id on public.depreciation_schedules(asset_id);

-- ---------------------------------------------------------
-- UPDATED_AT FUNCTION
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_assets_updated_at on public.assets;
create trigger trg_assets_updated_at
before update on public.assets
for each row
execute function public.set_updated_at();

drop trigger if exists trg_maintenance_updated_at on public.maintenance_records;
create trigger trg_maintenance_updated_at
before update on public.maintenance_records
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- AUTH -> USERS_PROFILE TRIGGER
-- A profile is automatically created after a Supabase Auth user.
-- The role sent from the registration form is validated here.
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_name text;
begin
  requested_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Pengguna');
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'technician');

  if requested_role not in ('admin', 'technician', 'manager') then
    requested_role := 'technician';
  end if;

  insert into public.users_profile (id, full_name, role)
  values (new.id, requested_name, requested_role)
  on conflict (id) do update
    set full_name = excluded.full_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

-- ---------------------------------------------------------
-- MAINTENANCE -> ASSET STATUS AUTOMATION
-- in_progress => asset maintenance
-- completed/cancelled => asset active if no other in_progress ticket exists
-- ---------------------------------------------------------
create or replace function public.sync_asset_status_from_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_asset_id uuid;
  target_status text;
  current_record_id uuid;
  has_other_in_progress boolean;
begin
  if tg_op = 'DELETE' then
    target_asset_id := old.asset_id;
    target_status := old.status;
    current_record_id := old.id;
  else
    target_asset_id := new.asset_id;
    target_status := new.status;
    current_record_id := new.id;
  end if;

  if target_status = 'in_progress' and tg_op <> 'DELETE' then
    update public.assets
       set status = 'maintenance', updated_at = now()
     where id = target_asset_id;
  elsif target_status in ('completed', 'cancelled') or (tg_op = 'DELETE' and target_status = 'in_progress') then
    select exists (
      select 1
      from public.maintenance_records mr
      where mr.asset_id = target_asset_id
        and mr.status = 'in_progress'
        and mr.id <> current_record_id
    ) into has_other_in_progress;

    if not has_other_in_progress then
      update public.assets
         set status = 'active', updated_at = now()
       where id = target_asset_id
         and status = 'maintenance';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_asset_status_maintenance on public.maintenance_records;
create trigger trg_sync_asset_status_maintenance
after insert or update or delete on public.maintenance_records
for each row
execute function public.sync_asset_status_from_maintenance();

-- ---------------------------------------------------------
-- RLS
-- Basic policy: all authenticated users may use the application data.
-- Tighten these policies further for production role-based access.
-- ---------------------------------------------------------
alter table public.users_profile enable row level security;
alter table public.assets enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.depreciation_schedules enable row level security;

-- users_profile: users can read/update their own profile.
drop policy if exists users_profile_select_own on public.users_profile;
create policy users_profile_select_own
on public.users_profile for select
to authenticated
using (id = auth.uid());

drop policy if exists users_profile_update_own on public.users_profile;
create policy users_profile_update_own
on public.users_profile for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Assets: authenticated users can CRUD.
drop policy if exists assets_select_authenticated on public.assets;
create policy assets_select_authenticated
on public.assets for select
to authenticated
using (true);

drop policy if exists assets_insert_authenticated on public.assets;
create policy assets_insert_authenticated
on public.assets for insert
to authenticated
with check (true);

drop policy if exists assets_update_authenticated on public.assets;
create policy assets_update_authenticated
on public.assets for update
to authenticated
using (true)
with check (true);

drop policy if exists assets_delete_authenticated on public.assets;
create policy assets_delete_authenticated
on public.assets for delete
to authenticated
using (true);

-- Maintenance records: authenticated users can CRUD.
drop policy if exists maintenance_select_authenticated on public.maintenance_records;
create policy maintenance_select_authenticated
on public.maintenance_records for select
to authenticated
using (true);

drop policy if exists maintenance_insert_authenticated on public.maintenance_records;
create policy maintenance_insert_authenticated
on public.maintenance_records for insert
to authenticated
with check (true);

drop policy if exists maintenance_update_authenticated on public.maintenance_records;
create policy maintenance_update_authenticated
on public.maintenance_records for update
to authenticated
using (true)
with check (true);

drop policy if exists maintenance_delete_authenticated on public.maintenance_records;
create policy maintenance_delete_authenticated
on public.maintenance_records for delete
to authenticated
using (true);

-- Depreciation schedules: authenticated users can CRUD.
drop policy if exists depreciation_select_authenticated on public.depreciation_schedules;
create policy depreciation_select_authenticated
on public.depreciation_schedules for select
to authenticated
using (true);

drop policy if exists depreciation_insert_authenticated on public.depreciation_schedules;
create policy depreciation_insert_authenticated
on public.depreciation_schedules for insert
to authenticated
with check (true);

drop policy if exists depreciation_update_authenticated on public.depreciation_schedules;
create policy depreciation_update_authenticated
on public.depreciation_schedules for update
to authenticated
using (true)
with check (true);

drop policy if exists depreciation_delete_authenticated on public.depreciation_schedules;
create policy depreciation_delete_authenticated
on public.depreciation_schedules for delete
to authenticated
using (true);

-- Table privileges for PostgREST.
grant select, insert, update, delete on public.users_profile to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.maintenance_records to authenticated;
grant select, insert, update, delete on public.depreciation_schedules to authenticated;

-- =========================================================
-- END OF SCHEMA
-- =========================================================
