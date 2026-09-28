-- =============================================================
-- SEED DATA / DUMMY DATA
-- Sistem Informasi Manajemen Aset Tetap Manufaktur
-- =============================================================
--
-- Penting untuk USERS PROFILE:
-- Supabase Auth mengelola auth.users secara internal. Skrip ini sengaja
-- tidak melakukan INSERT manual ke auth.users agar tidak merusak struktur
-- Auth atau membuat akun yang tidak memiliki identity/password yang valid.
--
-- Sebelum menjalankan seed.sql:
-- 1) Buka Supabase Dashboard > Authentication > Users.
-- 2) Buat 2 akun email-password berikut:
--      admin.manufaktur@demo.local
--      budi.santoso@demo.local
--    Gunakan password demo apa pun yang memenuhi aturan password project.
-- 3) Setelah akun dibuat, jalankan seluruh seed.sql di SQL Editor.
--
-- Trigger pada schema.sql akan otomatis membuat users_profile ketika user
-- Auth dibuat. Bagian USERS PROFILE di bawah juga melakukan upsert agar
-- nama dan role dummy menjadi sesuai dengan data contoh.
--
-- Data dirancang idempotent: aman dijalankan ulang tanpa menggandakan
-- aset/tiket/jadwal berdasarkan primary key atau unique key yang digunakan.
-- =============================================================

begin;

-- =============================================================
-- 1. DUMMY USERS PROFILE (2 DATA)
-- =============================================================

do $$
declare
  v_admin_id uuid;
  v_technician_id uuid;
begin
  select id into v_admin_id
  from auth.users
  where lower(email) = lower('admin.manufaktur@demo.local')
  limit 1;

  select id into v_technician_id
  from auth.users
  where lower(email) = lower('budi.santoso@demo.local')
  limit 1;

  if v_admin_id is null then
    raise exception
      'Auth user admin.manufaktur@demo.local belum ada. Buat user tersebut di Authentication > Users, lalu jalankan seed.sql lagi.';
  end if;

  if v_technician_id is null then
    raise exception
      'Auth user budi.santoso@demo.local belum ada. Buat user tersebut di Authentication > Users, lalu jalankan seed.sql lagi.';
  end if;

  insert into public.users_profile (id, full_name, role)
  values
    (v_admin_id, 'Admin Utama Manufaktur', 'admin'),
    (v_technician_id, 'Budi Santoso', 'technician')
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role;
end $$;

-- =============================================================
-- 2. DUMMY ASSETS (5 ASET MANUFAKTUR)
-- =============================================================
insert into public.assets (
  id,
  asset_code,
  name,
  category,
  location,
  purchase_date,
  purchase_cost,
  salvage_value,
  useful_life,
  depreciation_method,
  status
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'AST-MSN-001',
    'Mesin CNC Milling',
    'Mesin Pabrik',
    'Workshop Produksi A',
    '2026-01-15',
    250000000,
    10000000,
    10,
    'straight_line',
    'active'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'AST-PRD-002',
    'Conveyor Line Produksi',
    'Peralatan Produksi',
    'Line Produksi 1',
    '2026-02-01',
    85000000,
    5000000,
    8,
    'straight_line',
    'maintenance'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'AST-KND-003',
    'Forklift Toyota 3 Ton',
    'Kendaraan Operasional',
    'Gudang Bahan Baku',
    '2026-03-10',
    120000000,
    12000000,
    5,
    'double_declining',
    'active'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'AST-BDG-004',
    'Gedung Workshop Pabrik A',
    'Bangunan Pabrik',
    'Kawasan Pabrik A',
    '2026-01-05',
    850000000,
    50000000,
    20,
    'straight_line',
    'active'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'AST-MSN-005',
    'Robot Arm Welding',
    'Mesin Pabrik',
    'Workshop Welding',
    '2026-04-20',
    400000000,
    20000000,
    10,
    'double_declining',
    'active'
  )
on conflict (id) do update
set
  asset_code = excluded.asset_code,
  name = excluded.name,
  category = excluded.category,
  location = excluded.location,
  purchase_date = excluded.purchase_date,
  purchase_cost = excluded.purchase_cost,
  salvage_value = excluded.salvage_value,
  useful_life = excluded.useful_life,
  depreciation_method = excluded.depreciation_method,
  status = excluded.status;

-- =============================================================
-- 3. DUMMY MAINTENANCE RECORDS (4 DATA)
-- =============================================================
insert into public.maintenance_records (
  id,
  asset_id,
  maintenance_type,
  title,
  description,
  scheduled_date,
  completion_date,
  cost,
  technician_name,
  status
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'preventive',
    'Servis Berkala Mesin CNC',
    'Pembersihan spindle, pengecekan pelumasan, alignment, dan inspeksi komponen utama mesin CNC.',
    '2026-09-05',
    '2026-09-06',
    3500000,
    'Budi Santoso',
    'completed'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'corrective',
    'Perbaikan Belt Conveyor Macet',
    'Pemeriksaan belt, roller, motor penggerak, dan penggantian komponen yang menyebabkan conveyor macet.',
    '2026-09-15',
    null,
    1800000,
    'Budi Santoso',
    'in_progress'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '33333333-3333-3333-3333-333333333333',
    'preventive',
    'Ganti Oli & Ban Forklift',
    'Penggantian oli mesin, inspeksi sistem hidrolik, dan pengecekan kondisi ban forklift.',
    '2026-10-05',
    null,
    2200000,
    'Budi Santoso',
    'scheduled'
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '55555555-5555-5555-5555-555555555555',
    'preventive',
    'Kalibrasi Robot Arm Welding',
    'Kalibrasi posisi joint, pemeriksaan sensor, dan penyesuaian parameter welding robot.',
    '2026-09-20',
    '2026-09-21',
    5000000,
    'Budi Santoso',
    'completed'
  )
on conflict (id) do update
set
  asset_id = excluded.asset_id,
  maintenance_type = excluded.maintenance_type,
  title = excluded.title,
  description = excluded.description,
  scheduled_date = excluded.scheduled_date,
  completion_date = excluded.completion_date,
  cost = excluded.cost,
  technician_name = excluded.technician_name,
  status = excluded.status;

-- =============================================================
-- 4. DUMMY DEPRECIATION SCHEDULES
-- Full annual schedules are generated from useful_life.
-- CNC       : Straight Line, 10 tahun
-- Conveyor  : Straight Line, 8 tahun
-- Forklift  : Double Declining, 5 tahun
-- Building  : Straight Line, 20 tahun
-- Robot Arm  : Double Declining, 10 tahun
-- =============================================================

do $$
declare
  r record;
  v_year integer;
  v_book numeric(20,2);
  v_acc numeric(20,2);
  v_dep numeric(20,2);
  v_annual_sl numeric(20,2);
  v_rate numeric(20,10);
  v_period_date date;
begin
  for r in
    select
      a.id,
      a.purchase_date,
      a.purchase_cost,
      a.salvage_value,
      a.useful_life,
      a.depreciation_method
    from public.assets a
    where a.id in (
      '11111111-1111-1111-1111-111111111111'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid,
      '55555555-5555-5555-5555-555555555555'::uuid
    )
    order by a.asset_code
  loop
    v_book := r.purchase_cost;
    v_acc := 0;
    v_annual_sl := case
      when r.useful_life > 0
        then (r.purchase_cost - r.salvage_value) / r.useful_life
      else 0
    end;
    v_rate := case
      when r.useful_life > 0
        then 2.0 / r.useful_life
      else 0
    end;

    for v_year in 1..r.useful_life loop
      if r.depreciation_method = 'double_declining' then
        v_dep := least(
          v_book * v_rate,
          greatest(v_book - r.salvage_value, 0)
        );
      else
        v_dep := least(
          v_annual_sl,
          greatest(v_book - r.salvage_value, 0)
        );
      end if;

      v_acc := v_acc + v_dep;
      v_book := greatest(r.salvage_value, v_book - v_dep);

      v_period_date := make_date(
        extract(year from r.purchase_date)::integer + v_year - 1,
        12,
        31
      );

      insert into public.depreciation_schedules (
        id,
        asset_id,
        year,
        period_date,
        depreciation_amount,
        accumulated_depreciation,
        book_value
      )
      values (
        gen_random_uuid(),
        r.id,
        v_year,
        v_period_date,
        round(v_dep, 2),
        round(v_acc, 2),
        round(v_book, 2)
      )
      on conflict (asset_id, year) do update
      set
        period_date = excluded.period_date,
        depreciation_amount = excluded.depreciation_amount,
        accumulated_depreciation = excluded.accumulated_depreciation,
        book_value = excluded.book_value;
    end loop;
  end loop;
end $$;

-- =============================================================
-- 5. FINAL CONSISTENCY CHECK
-- =============================================================
-- Karena tiket Conveyor berstatus in_progress, trigger schema.sql
-- seharusnya membuat status asset Conveyor menjadi 'maintenance'.
-- Bagian ini hanya mengoreksi jika trigger belum aktif.
update public.assets
set status = 'maintenance', updated_at = now()
where id = '22222222-2222-2222-2222-222222222222'::uuid;

-- Pastikan empat aset lainnya aktif setelah seed maintenance.
update public.assets
set status = 'active', updated_at = now()
where id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid,
  '44444444-4444-4444-4444-444444444444'::uuid,
  '55555555-5555-5555-5555-555555555555'::uuid
);

commit;

-- =============================================================
-- 6. QUERY VERIFIKASI (OPTIONAL)
-- Jalankan blok SELECT ini setelah seed untuk memastikan relasi benar.
-- =============================================================

-- User profile
-- select p.id, p.full_name, p.role, u.email
-- from public.users_profile p
-- join auth.users u on u.id = p.id
-- order by p.role, p.full_name;

-- Assets
-- select asset_code, name, category, purchase_cost, useful_life, depreciation_method, status
-- from public.assets
-- order by asset_code;

-- Maintenance + asset
-- select
--   mr.title,
--   mr.maintenance_type,
--   mr.status as maintenance_status,
--   a.asset_code,
--   a.name as asset_name,
--   a.status as asset_status,
--   mr.cost
-- from public.maintenance_records mr
-- join public.assets a on a.id = mr.asset_id
-- order by mr.scheduled_date;

-- Jumlah jadwal depresiasi per aset
-- select
--   a.asset_code,
--   a.name,
--   count(ds.id) as total_schedule_rows
-- from public.assets a
-- left join public.depreciation_schedules ds on ds.asset_id = a.id
-- where a.asset_code in ('AST-MSN-001','AST-PRD-002','AST-KND-003','AST-BDG-004','AST-MSN-005')
-- group by a.id, a.asset_code, a.name
-- order by a.asset_code;

-- =============================================================
-- HASIL YANG DIHARAPKAN
-- -------------------------------------------------------------
-- users_profile              : 2 data
-- assets                     : 5 data
-- maintenance_records       : 4 data
-- depreciation_schedules    : 53 data (10 + 8 + 5 + 20 + 10)
-- Conveyor Line Produksi     : status = maintenance
-- Aset lainnya               : status = active
-- =============================================================
