# AssetPro - Sistem Informasi Manajemen Aset Tetap Manufaktur

Aplikasi web single-page berbasis HTML5, Tailwind CSS CDN, Vanilla JavaScript, Font Awesome CDN, dan Supabase JS v2 CDN. 
# 🏭 Fixed Asset Management System - Manufacturing

> 🚀 **Live Demo System:** [Klik di sini untuk membuka aplikasi](Sistem Informasi Manajemen Aset Tetap Perusahaan Manufaktur/asset-management-vanilla/index.html)


## Struktur

```text
asset-management-vanilla/
├── index.html
├── style.css
├── app.js
├── supabase-config.js
├── schema.sql
└── README.md
```

## Fitur

- Login / Register menggunakan Supabase Auth.
- Session management dan Logout.
- Profil pengguna: nama lengkap + role (`admin`, `technician`, `manager`).
- CRUD aset tetap manufaktur.
- Depresiasi Garis Lurus dan Saldo Menurun Ganda.
- Simpan jadwal depresiasi ke tabel `depreciation_schedules`.
- Modul Maintenance advanced: tiket, filter, status, biaya, teknisi, completion date.
- Auto-update status aset:
  - `in_progress` -> asset `maintenance`
  - `completed` / `cancelled` -> asset `active` jika tidak ada tiket lain yang `in_progress`
- Ringkasan biaya maintenance per aset.
- Dashboard analytics.

## Setup Supabase

1. Buat project di Supabase.
2. Buka **SQL Editor**.
3. Jalankan seluruh isi `schema.sql`.
4. Buka `supabase-config.js`.
5. Isi:

```javascript
const SUPABASE_URL = 'https://project-anda.supabase.co';
const SUPABASE_ANON_KEY = 'public-anon-key-anda';
```

Gunakan **anon/public key**, bukan `service_role` key.

6. Di Supabase Authentication, cek **Email** provider. Untuk pengujian kelas, Anda dapat menyesuaikan Email Confirmation sesuai kebutuhan.
7. Jalankan `index.html` melalui VS Code Live Server.

## Catatan RLS

Schema menggunakan policy dasar: seluruh tabel operasional (`assets`, `maintenance_records`, `depreciation_schedules`) dapat diakses oleh user yang sudah terautentikasi. `users_profile` dibatasi pada profil milik user yang sedang login.

Untuk sistem produksi, role-based access perlu diperketat lagi, misalnya hanya admin/manager yang dapat menghapus aset atau mengubah role.
