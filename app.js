const state = {
  session: null,
  user: null,
  profile: null,
  currentPage: 'dashboard',
  assets: [],
  maintenanceRecords: [],
  editingAssetId: null,
  editingMaintenanceId: null,
  filters: {
    assetSearch: '',
    assetCategory: '',
    maintenanceSearch: '',
    maintenanceStatus: '',
    maintenanceType: ''
  }
};

const PAGE_META = {
  dashboard: { title: 'Dashboard', subtitle: 'Ringkasan kondisi aset perusahaan.' },
  assets: { title: 'Data Aset', subtitle: 'Register aset tetap dan informasi akuntansinya.' },
  depreciation: { title: 'Depresiasi', subtitle: 'Kalkulasi dan jadwal penyusutan aset.' },
  maintenance: { title: 'Pemeliharaan', subtitle: 'Tiket, jadwal, status teknisi, dan biaya pemeliharaan.' }
};

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('id-ID');

function formatCurrency(value) { return rupiah.format(Number(value) || 0); }
function formatDate(date) {
  if (!date) return '-';
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function getInitials(name) {
  return String(name || 'U').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'U';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function methodLabel(method) { return method === 'double_declining' ? 'Saldo Menurun Ganda' : 'Garis Lurus'; }
function maintenanceTypeLabel(type) { return type === 'corrective' ? 'Perbaikan' : 'Rutin'; }
function assetStatusLabel(status) { return ({ active: 'Active', maintenance: 'Maintenance', disposed: 'Disposed' }[status] || status || '-'); }
function maintenanceStatusLabel(status) { return ({ scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }[status] || status || '-'); }
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  const bg = type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-purple-50 border-purple-200 text-purple-800';
  const toast = document.createElement('div');
  toast.className = `toast border rounded-2xl px-4 py-3 shadow-lg ${bg}`;
  toast.innerHTML = `<div class="flex items-start gap-3"><i class="fa-solid ${icon} mt-0.5"></i><div class="text-sm font-semibold leading-5">${escapeHtml(message)}</div></div>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 200); }, 3500);
}
function normalizeError(error) {
  return error?.message || error?.error_description || 'Terjadi kesalahan. Silakan coba lagi.';
}

// ==================== AUTH ====================
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showAppShell() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
}

function switchAuthTab(tab) {
  const login = tab === 'login';
  document.getElementById('login-form').classList.toggle('hidden', !login);
  document.getElementById('register-form').classList.toggle('hidden', login);
  document.getElementById('show-login-tab').classList.toggle('active', login);
  document.getElementById('show-register-tab').classList.toggle('active', !login);
  document.getElementById('show-login-tab').classList.toggle('font-bold', login);
  document.getElementById('show-register-tab').classList.toggle('font-bold', !login);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!isSupabaseConfigured()) {
    showToast('Konfigurasi Supabase belum diisi.', 'error');
    return;
  }
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const button = event.submitter;
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Memproses...';

  try {
    await loginUser({ email, password });
    showToast('Login berhasil.', 'success');
  } catch (error) {
    showToast(normalizeError(error), 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-2"></i>Masuk ke Sistem';
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  if (!isSupabaseConfigured()) {
    showToast('Konfigurasi Supabase belum diisi.', 'error');
    return;
  }

  const fullName = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const role = document.getElementById('register-role').value;
  const password = document.getElementById('register-password').value;
  const passwordConfirm = document.getElementById('register-password-confirm').value;

  if (password !== passwordConfirm) {
    showToast('Konfirmasi password tidak sama.', 'error');
    return;
  }

  const button = event.submitter;
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Membuat akun...';

  try {
    const data = await registerUser({ fullName, email, password, role });
    if (data.session) {
      showToast('Akun berhasil dibuat dan langsung login.', 'success');
    } else {
      showToast('Akun berhasil dibuat. Periksa email untuk verifikasi sebelum login.', 'info');
      switchAuthTab('login');
      document.getElementById('login-email').value = email;
    }
  } catch (error) {
    showToast(normalizeError(error), 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fa-solid fa-user-plus mr-2"></i>Buat Akun';
  }
}

async function handleLogout() {
  try {
    await logoutUser();
  } catch (error) {
    showToast(normalizeError(error), 'error');
  }
}

async function handleAuthenticatedSession(session) {
  state.session = session;
  state.user = session?.user || null;

  if (!state.user) {
    state.profile = null;
    showAuthScreen();
    return;
  }

  try {
    state.profile = await getCurrentUserProfile(state.user.id);
    if (!state.profile) {
      // The DB trigger should create this row. Fallback to Auth metadata only for UI resilience.
      state.profile = {
        id: state.user.id,
        full_name: state.user.user_metadata?.full_name || state.user.email?.split('@')[0] || 'Pengguna',
        role: state.user.user_metadata?.role || 'technician'
      };
    }

    showAppShell();
    updateUserUI();
    await refreshAllData();
    await initConnectionStatus();
    navigate(state.currentPage || 'dashboard');
  } catch (error) {
    showAuthScreen();
    showToast(`Session aktif, tetapi data profil gagal dimuat: ${normalizeError(error)}`, 'error');
  }
}

function updateUserUI() {
  const name = state.profile?.full_name || state.user?.email || 'Pengguna';
  const role = state.profile?.role || 'technician';
  const initials = getInitials(name);

  document.getElementById('sidebar-user-name').textContent = name;
  document.getElementById('sidebar-user-role').textContent = role;
  document.getElementById('header-user-name').textContent = name;
  document.getElementById('header-user-role').textContent = role;
  document.getElementById('sidebar-user-avatar').textContent = initials;
  document.getElementById('header-avatar').textContent = initials;
}

// ==================== NAVIGATION ====================
function navigate(page) {
  if (!PAGE_META[page]) page = 'dashboard';
  state.currentPage = page;

  document.querySelectorAll('.page-section').forEach(section => section.classList.add('hidden'));
  document.getElementById(`page-${page}`).classList.remove('hidden');

  document.querySelectorAll('[data-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === page);
  });

  document.getElementById('page-title').textContent = PAGE_META[page].title;
  document.getElementById('page-subtitle').textContent = PAGE_META[page].subtitle;
  closeSidebarMobile();

  if (page === 'dashboard') renderDashboard();
  if (page === 'assets') renderAssetsTable();
  if (page === 'depreciation') renderDepreciationPage();
  if (page === 'maintenance') renderMaintenancePage();
}

function openSidebarMobile() {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
}
function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ==================== DEPRECIATION ====================
function calculateStraightLine(asset) {
  const cost = Number(asset.purchase_cost) || 0;
  const salvage = Math.min(Number(asset.salvage_value) || 0, cost);
  const life = Math.max(Number(asset.useful_life) || 0, 1);
  const annual = (cost - salvage) / life;
  let book = cost;
  let accumulated = 0;
  const schedule = [];
  for (let year = 1; year <= life; year += 1) {
    const beginning = book;
    const depreciation = Math.min(annual, Math.max(0, beginning - salvage));
    accumulated += depreciation;
    book = Math.max(salvage, beginning - depreciation);
    schedule.push({ year, beginning, depreciation, accumulated, ending: book });
  }
  return schedule;
}

function calculateDoubleDeclining(asset) {
  const cost = Number(asset.purchase_cost) || 0;
  const salvage = Math.min(Number(asset.salvage_value) || 0, cost);
  const life = Math.max(Number(asset.useful_life) || 0, 1);
  const rate = 2 / life;
  let book = cost;
  let accumulated = 0;
  const schedule = [];
  for (let year = 1; year <= life; year += 1) {
    const beginning = book;
    let depreciation = beginning * rate;
    depreciation = Math.min(depreciation, Math.max(0, beginning - salvage));
    accumulated += depreciation;
    book = Math.max(salvage, beginning - depreciation);
    schedule.push({ year, beginning, depreciation, accumulated, ending: book });
  }
  return schedule;
}

function getDepreciationSchedule(asset) {
  return asset.depreciation_method === 'double_declining'
    ? calculateDoubleDeclining(asset)
    : calculateStraightLine(asset);
}

function getElapsedDepreciation(asset) {
  if (!asset?.purchase_date) return { accumulated: 0, bookValue: Number(asset?.purchase_cost || 0) };
  const purchase = new Date(`${asset.purchase_date}T00:00:00`);
  const today = new Date();
  if (purchase > today) return { accumulated: 0, bookValue: Number(asset.purchase_cost || 0) };

  let elapsedYears = today.getFullYear() - purchase.getFullYear();
  const anniversary = new Date(today.getFullYear(), purchase.getMonth(), purchase.getDate());
  if (today < anniversary) elapsedYears -= 1;
  elapsedYears = Math.max(0, Math.min(Number(asset.useful_life || 1), elapsedYears));

  const schedule = getDepreciationSchedule(asset);
  if (elapsedYears === 0) return { accumulated: 0, bookValue: Number(asset.purchase_cost || 0) };
  const row = schedule[elapsedYears - 1];
  return row ? { accumulated: row.accumulated, bookValue: row.ending } : { accumulated: 0, bookValue: Number(asset.purchase_cost || 0) };
}

function depreciationPeriodDate(asset, year) {
  const base = new Date(`${asset.purchase_date}T00:00:00`);
  base.setFullYear(base.getFullYear() + year);
  return base.toISOString().slice(0, 10);
}

function buildDepreciationRows(asset) {
  return getDepreciationSchedule(asset).map(row => ({
    asset_id: asset.id,
    year: row.year,
    period_date: depreciationPeriodDate(asset, row.year),
    depreciation_amount: Number(row.depreciation.toFixed(2)),
    accumulated_depreciation: Number(row.accumulated.toFixed(2)),
    book_value: Number(row.ending.toFixed(2))
  }));
}

function populateDepreciationSelect() {
  const select = document.getElementById('depr-asset-select');
  const previous = select.value;
  select.innerHTML = '<option value="">Pilih aset...</option>' + state.assets.map(asset => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.asset_code)} - ${escapeHtml(asset.name)}</option>`).join('');
  if (state.assets.some(asset => asset.id === previous)) select.value = previous;
  if (!select.value && state.assets[0]) select.value = state.assets[0].id;
}

function renderDepreciationPage() {
  populateDepreciationSelect();
  renderSelectedDepreciation();
}

function renderSelectedDepreciation() {
  const select = document.getElementById('depr-asset-select');
  const asset = state.assets.find(item => item.id === select.value);
  const summary = document.getElementById('depr-summary');
  const body = document.getElementById('depr-table-body');
  const caption = document.getElementById('depr-table-caption');

  if (!asset) {
    summary.innerHTML = '<div class="text-slate-500">Belum ada aset yang dipilih.</div>';
    body.innerHTML = '<tr><td colspan="5" class="px-4 py-10 text-center text-slate-500">Pilih aset untuk melihat jadwal depresiasi.</td></tr>';
    caption.textContent = 'Pilih aset untuk melihat rincian.';
    return;
  }

  const schedule = getDepreciationSchedule(asset);
  const elapsed = getElapsedDepreciation(asset);
  const first = schedule[0];
  const final = schedule.at(-1);
  summary.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
      <div><div class="font-black text-lg text-purple-900">${escapeHtml(asset.name)}</div><div class="text-sm text-slate-500 mt-1">${escapeHtml(asset.asset_code)} · ${escapeHtml(asset.category)} · ${escapeHtml(asset.location)}</div></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div class="text-xs text-slate-500">Harga Perolehan</div><div class="font-bold mt-1">${formatCurrency(asset.purchase_cost)}</div></div>
        <div><div class="text-xs text-slate-500">Nilai Sisa</div><div class="font-bold mt-1">${formatCurrency(asset.salvage_value)}</div></div>
        <div><div class="text-xs text-slate-500">Metode</div><div class="font-bold mt-1">${escapeHtml(methodLabel(asset.depreciation_method))}</div></div>
        <div><div class="text-xs text-slate-500">Depresiasi Berjalan</div><div class="font-bold mt-1 text-purple-700">${formatCurrency(elapsed.accumulated)}</div></div>
      </div>
    </div>
    <div class="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="rounded-xl bg-purple-50 p-4"><div class="text-xs text-purple-700">Beban Tahun 1</div><div class="font-bold text-purple-900 mt-1">${formatCurrency(first?.depreciation || 0)}</div></div>
      <div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Nilai Buku Saat Ini</div><div class="font-bold text-slate-900 mt-1">${formatCurrency(elapsed.bookValue)}</div></div>
      <div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Depresiasi Sampai Akhir Umur</div><div class="font-bold text-slate-900 mt-1">${formatCurrency(final?.accumulated || 0)}</div></div>
    </div>`;

  caption.textContent = `${asset.asset_code} · ${methodLabel(asset.depreciation_method)} · ${asset.useful_life} tahun`;
  body.innerHTML = schedule.map(item => `
    <tr>
      <td class="px-4 py-3 text-center font-semibold">${item.year}</td>
      <td class="px-4 py-3 text-right">${formatCurrency(item.beginning)}</td>
      <td class="px-4 py-3 text-right font-semibold text-purple-700">${formatCurrency(item.depreciation)}</td>
      <td class="px-4 py-3 text-right">${formatCurrency(item.accumulated)}</td>
      <td class="px-4 py-3 text-right font-semibold">${formatCurrency(item.ending)}</td>
    </tr>`).join('');
}

async function persistSelectedDepreciation() {
  const asset = state.assets.find(item => item.id === document.getElementById('depr-asset-select').value);
  if (!asset) {
    showToast('Pilih aset terlebih dahulu.', 'error');
    return;
  }
  const rows = buildDepreciationRows(asset);
  try {
    await saveDepreciationSchedule(asset.id, rows);
    showToast(`Jadwal depresiasi ${asset.asset_code} tersimpan ke Supabase.`, 'success');
  } catch (error) {
    showToast(normalizeError(error), 'error');
  }
}

// ==================== DASHBOARD ====================
function renderDashboard() {
  const totalCost = state.assets.reduce((sum, asset) => sum + Number(asset.purchase_cost || 0), 0);
  const totalAccumulated = state.assets.reduce((sum, asset) => sum + getElapsedDepreciation(asset).accumulated, 0);
  const totalBook = Math.max(0, totalCost - totalAccumulated);
  const maintenanceAssets = state.assets.filter(asset => asset.status === 'maintenance').length;

  document.getElementById('metric-acquisition').textContent = formatCurrency(totalCost);
  document.getElementById('metric-depreciation').textContent = formatCurrency(totalAccumulated);
  document.getElementById('metric-book-value').textContent = formatCurrency(totalBook);
  document.getElementById('metric-maintenance').textContent = integer.format(maintenanceAssets);
  document.getElementById('metric-assets-count').textContent = integer.format(state.assets.length);

  const byCategory = new Map();
  state.assets.forEach(asset => byCategory.set(asset.category, (byCategory.get(asset.category) || 0) + Number(asset.purchase_cost || 0)));
  const categoryChart = document.getElementById('category-chart');
  const values = [...byCategory.values()];
  const maxValue = Math.max(...values, 1);
  categoryChart.innerHTML = byCategory.size
    ? [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, value]) => `
        <div>
          <div class="flex items-center justify-between text-sm mb-2"><span class="font-medium text-slate-700">${escapeHtml(category)}</span><span class="font-semibold text-slate-900">${formatCurrency(value)}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(value / maxValue) * 100}%"></div></div>
        </div>`).join('')
    : '<div class="text-sm text-slate-500 py-8 text-center">Belum ada data untuk ditampilkan.</div>';

  const recent = [...state.assets].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5);
  document.getElementById('recent-assets').innerHTML = recent.length
    ? recent.map(asset => `<div class="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center"><i class="fa-solid fa-cube"></i></div><div class="min-w-0 flex-1"><div class="font-semibold text-sm text-slate-900 truncate">${escapeHtml(asset.name)}</div><div class="text-xs text-slate-500 mt-1">${escapeHtml(asset.asset_code)} · ${escapeHtml(asset.category)}</div></div><div class="text-xs font-semibold text-slate-700 text-right">${formatCurrency(asset.purchase_cost)}</div></div>`).join('')
    : '<div class="text-sm text-slate-500 py-8 text-center">Belum ada aset.</div>';
}

// ==================== ASSETS ====================
function getFilteredAssets() {
  const query = state.filters.assetSearch.trim().toLowerCase();
  return state.assets.filter(asset => {
    const matchesQuery = !query || [asset.asset_code, asset.name, asset.category, asset.location, asset.status].some(value => String(value).toLowerCase().includes(query));
    const matchesCategory = !state.filters.assetCategory || asset.category === state.filters.assetCategory;
    return matchesQuery && matchesCategory;
  });
}

function renderAssetStatusBadge(status) {
  const className = ({ active: 'asset-active', maintenance: 'asset-maintenance', disposed: 'asset-disposed' }[status] || 'asset-maintenance');
  return `<span class="status-pill ${className}">${escapeHtml(assetStatusLabel(status))}</span>`;
}

function renderAssetsTable() {
  const rows = getFilteredAssets();
  const body = document.getElementById('assets-table-body');
  const empty = document.getElementById('assets-empty');
  empty.classList.toggle('hidden', rows.length > 0);
  body.innerHTML = rows.map(asset => `
    <tr>
      <td class="px-5 py-4 font-semibold text-purple-700">${escapeHtml(asset.asset_code)}</td>
      <td class="px-5 py-4"><div class="font-semibold text-slate-900">${escapeHtml(asset.name)}</div><div class="text-xs text-slate-500 mt-1">${escapeHtml(asset.depreciation_method === 'double_declining' ? 'DDB' : 'SL')}</div></td>
      <td class="px-5 py-4 text-sm">${escapeHtml(asset.category)}</td>
      <td class="px-5 py-4 text-sm text-slate-600">${escapeHtml(asset.location)}</td>
      <td class="px-5 py-4 text-sm">${formatDate(asset.purchase_date)}</td>
      <td class="px-5 py-4 text-right font-semibold">${formatCurrency(asset.purchase_cost)}</td>
      <td class="px-5 py-4 text-center">${integer.format(asset.useful_life)} th</td>
      <td class="px-5 py-4 text-center">${renderAssetStatusBadge(asset.status)}</td>
      <td class="px-5 py-4"><div class="flex justify-center gap-2"><button data-action="edit" data-id="${escapeHtml(asset.id)}" class="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100" title="Edit"><i class="fa-solid fa-pen"></i></button><button data-action="depr" data-id="${escapeHtml(asset.id)}" class="w-9 h-9 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100" title="Depresiasi"><i class="fa-solid fa-calculator"></i></button><button data-action="delete" data-id="${escapeHtml(asset.id)}" class="w-9 h-9 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" title="Hapus"><i class="fa-solid fa-trash"></i></button></div></td>
    </tr>`).join('');
}

function openAssetModal(asset = null) {
  state.editingAssetId = asset?.id || null;
  document.getElementById('asset-modal-title').textContent = asset ? 'Edit Aset' : 'Tambah Aset';
  document.getElementById('asset-id').value = asset?.id || '';
  document.getElementById('asset-code').value = asset?.asset_code || '';
  document.getElementById('asset-name').value = asset?.name || '';
  document.getElementById('asset-category').value = asset?.category || 'Mesin Pabrik';
  document.getElementById('asset-location').value = asset?.location || '';
  document.getElementById('asset-purchase-date').value = asset?.purchase_date || todayIso();
  document.getElementById('asset-cost').value = asset?.purchase_cost ?? '';
  document.getElementById('asset-salvage').value = asset?.salvage_value ?? 0;
  document.getElementById('asset-life').value = asset?.useful_life ?? 10;
  document.getElementById('asset-method').value = asset?.depreciation_method || 'straight_line';
  document.getElementById('asset-status').value = asset?.status || 'active';
  const modal = document.getElementById('asset-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeAssetModal() {
  const modal = document.getElementById('asset-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  state.editingAssetId = null;
  document.getElementById('asset-form').reset();
}

async function handleAssetSubmit(event) {
  event.preventDefault();
  const payload = {
    asset_code: document.getElementById('asset-code').value.trim(),
    name: document.getElementById('asset-name').value.trim(),
    category: document.getElementById('asset-category').value,
    location: document.getElementById('asset-location').value.trim(),
    purchase_date: document.getElementById('asset-purchase-date').value,
    purchase_cost: Number(document.getElementById('asset-cost').value),
    salvage_value: Number(document.getElementById('asset-salvage').value),
    useful_life: Number(document.getElementById('asset-life').value),
    depreciation_method: document.getElementById('asset-method').value,
    status: document.getElementById('asset-status').value
  };

  if (payload.salvage_value > payload.purchase_cost) {
    showToast('Nilai sisa tidak boleh melebihi harga perolehan.', 'error');
    return;
  }

  try {
    if (state.editingAssetId) {
      await updateAsset(state.editingAssetId, payload);
      showToast('Data aset berhasil diperbarui.', 'success');
    } else {
      await createAsset(payload);
      showToast('Aset baru berhasil ditambahkan.', 'success');
    }
    closeAssetModal();
    await refreshAllData();
    navigate('assets');
  } catch (error) {
    showToast(normalizeError(error), 'error');
  }
}

async function handleDeleteAsset(assetId) {
  const asset = state.assets.find(item => item.id === assetId);
  if (!asset) return;
  if (!window.confirm(`Hapus aset ${asset.asset_code} - ${asset.name}? Semua tiket maintenance dan jadwal depresiasinya juga akan terhapus karena ON DELETE CASCADE.`)) return;

  try {
    await deleteAsset(assetId);
    showToast('Aset berhasil dihapus.', 'success');
    await refreshAllData();
    navigate('assets');
  } catch (error) {
    showToast(normalizeError(error), 'error');
  }
}

// ==================== MAINTENANCE ====================
function getFilteredMaintenanceRecords() {
  const query = state.filters.maintenanceSearch.trim().toLowerCase();
  return state.maintenanceRecords.filter(record => {
    const asset = record.assets || {};
    const matchesQuery = !query || [record.title, record.technician_name, record.description, asset.asset_code, asset.name, asset.category].some(value => String(value || '').toLowerCase().includes(query));
    const matchesStatus = !state.filters.maintenanceStatus || record.status === state.filters.maintenanceStatus;
    const matchesType = !state.filters.maintenanceType || record.maintenance_type === state.filters.maintenanceType;
    return matchesQuery && matchesStatus && matchesType;
  });
}

function maintenanceStatusBadge(status) {
  const className = ({ scheduled: 'status-scheduled', in_progress: 'status-progress', completed: 'status-completed', cancelled: 'status-cancelled' }[status] || 'status-cancelled');
  return `<span class="status-pill ${className}">${escapeHtml(maintenanceStatusLabel(status))}</span>`;
}

function populateMaintenanceAssetSelect(selectedId = '') {
  const select = document.getElementById('maintenance-asset');
  select.innerHTML = '<option value="">Pilih aset...</option>' + state.assets.filter(asset => asset.status !== 'disposed').map(asset => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.asset_code)} - ${escapeHtml(asset.name)}</option>`).join('');
  if (selectedId) select.value = selectedId;
}

function renderMaintenancePage() {
  const currentMonthPrefix = todayIso().slice(0, 7);
  const monthCost = state.maintenanceRecords.filter(record => String(record.scheduled_date || '').startsWith(currentMonthPrefix)).reduce((sum, record) => sum + Number(record.cost || 0), 0);
  const scheduledCount = state.maintenanceRecords.filter(record => record.status === 'scheduled').length;
  const repairCount = state.assets.filter(asset => asset.status === 'maintenance' && ['Mesin Pabrik', 'Peralatan Produksi'].includes(asset.category)).length;

  document.getElementById('maint-cost-month').textContent = formatCurrency(monthCost);
  document.getElementById('maint-scheduled').textContent = integer.format(scheduledCount);
  document.getElementById('maint-in-repair').textContent = integer.format(repairCount);

  const rows = getFilteredMaintenanceRecords();
  const body = document.getElementById('maintenance-table-body');
  const empty = document.getElementById('maintenance-empty');
  empty.classList.toggle('hidden', rows.length > 0);
  body.innerHTML = rows.map(record => {
    const asset = record.assets || {};
    return `<tr>
      <td class="px-4 py-4"><div class="font-bold text-purple-700">${escapeHtml(record.id.slice(0, 8).toUpperCase())}</div><div class="text-xs text-slate-400 mt-1">${formatDate(record.created_at?.slice?.(0, 10) || '')}</div></td>
      <td class="px-4 py-4"><div class="font-semibold text-slate-900">${escapeHtml(asset.name || '-')}</div><div class="text-xs text-slate-500 mt-1">${escapeHtml(asset.asset_code || '-')}</div></td>
      <td class="px-4 py-4"><div class="font-semibold text-slate-800">${escapeHtml(record.title)}</div><div class="text-xs text-slate-500 mt-1">${escapeHtml(maintenanceTypeLabel(record.maintenance_type))}${record.description ? ` · ${escapeHtml(record.description).slice(0, 60)}${record.description.length > 60 ? '…' : ''}` : ''}</div></td>
      <td class="px-4 py-4 text-sm"><div>${formatDate(record.scheduled_date)}</div><div class="text-xs text-slate-400 mt-1">Selesai: ${formatDate(record.completion_date)}</div></td>
      <td class="px-4 py-4 text-sm">${escapeHtml(record.technician_name)}</td>
      <td class="px-4 py-4 text-right font-semibold">${formatCurrency(record.cost)}</td>
      <td class="px-4 py-4 text-center"><select data-action="status" data-id="${escapeHtml(record.id)}" class="text-xs border border-purple-200 rounded-lg px-2 py-1.5 bg-white"><option value="scheduled" ${record.status === 'scheduled' ? 'selected' : ''}>Scheduled</option><option value="in_progress" ${record.status === 'in_progress' ? 'selected' : ''}>In Progress</option><option value="completed" ${record.status === 'completed' ? 'selected' : ''}>Completed</option><option value="cancelled" ${record.status === 'cancelled' ? 'selected' : ''}>Cancelled</option></select><div class="mt-2">${maintenanceStatusBadge(record.status)}</div></td>
      <td class="px-4 py-4"><div class="flex justify-center gap-2"><button data-action="edit" data-id="${escapeHtml(record.id)}" class="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100" title="Edit"><i class="fa-solid fa-pen"></i></button><button data-action="delete" data-id="${escapeHtml(record.id)}" class="w-9 h-9 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" title="Hapus"><i class="fa-solid fa-trash"></i></button></div></td>
    </tr>`;
  }).join('');

  renderMaintenanceAssetSummary();
  populateMaintenanceAssetSelect(document.getElementById('maintenance-asset')?.value || '');
}

function renderMaintenanceAssetSummary() {
  const map = new Map();
  state.maintenanceRecords.forEach(record => {
    const asset = record.assets || {};
    if (!asset.id) return;
    const current = map.get(asset.id) || { asset, count: 0, cost: 0 };
    current.count += 1;
    current.cost += Number(record.cost || 0);
    map.set(asset.id, current);
  });

  const rows = [...map.values()].sort((a, b) => b.cost - a.cost);
  document.getElementById('maintenance-asset-summary-body').innerHTML = rows.length
    ? rows.map(item => `<tr><td class="px-5 py-4 font-semibold text-purple-700">${escapeHtml(item.asset.asset_code)}</td><td class="px-5 py-4">${escapeHtml(item.asset.name)}</td><td class="px-5 py-4 text-sm text-slate-600">${escapeHtml(item.asset.category || '-')}</td><td class="px-5 py-4 text-center">${integer.format(item.count)}</td><td class="px-5 py-4 text-right font-bold">${formatCurrency(item.cost)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="px-5 py-10 text-center text-slate-500">Belum ada histori pemeliharaan.</td></tr>';
}

function openMaintenanceModal(record = null) {
  state.editingMaintenanceId = record?.id || null;
  document.getElementById('maintenance-modal-title').textContent = record ? 'Edit Tiket Pemeliharaan' : 'Buat Tiket Pemeliharaan';
  document.getElementById('maintenance-id').value = record?.id || '';
  populateMaintenanceAssetSelect(record?.asset_id || '');
  document.getElementById('maintenance-asset').value = record?.asset_id || '';
  document.getElementById('maintenance-type').value = record?.maintenance_type || 'preventive';
  document.getElementById('maintenance-title').value = record?.title || '';
  document.getElementById('maintenance-description').value = record?.description || '';
  document.getElementById('maintenance-scheduled-date').value = record?.scheduled_date || todayIso();
  document.getElementById('maintenance-cost').value = record?.cost ?? 0;
  document.getElementById('maintenance-technician').value = record?.technician_name || state.profile?.full_name || '';
  document.getElementById('maintenance-status').value = record?.status || 'scheduled';
  document.getElementById('maintenance-completion-date').value = record?.completion_date || '';
  toggleCompletionDate();

  const modal = document.getElementById('maintenance-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeMaintenanceModal() {
  const modal = document.getElementById('maintenance-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  state.editingMaintenanceId = null;
  document.getElementById('maintenance-form').reset();
}

function toggleCompletionDate() {
  const status = document.getElementById('maintenance-status').value;
  const wrap = document.getElementById('completion-date-wrap');
  const input = document.getElementById('maintenance-completion-date');
  const visible = status === 'completed';
  wrap.classList.toggle('hidden', !visible);
  input.required = visible;
  if (visible && !input.value) input.value = todayIso();
}

async function handleMaintenanceSubmit(event) {
  event.preventDefault();
  const status = document.getElementById('maintenance-status').value;
  const payload = {
    asset_id: document.getElementById('maintenance-asset').value,
    maintenance_type: document.getElementById('maintenance-type').value,
    title: document.getElementById('maintenance-title').value.trim(),
    description: document.getElementById('maintenance-description').value.trim() || null,
    scheduled_date: document.getElementById('maintenance-scheduled-date').value,
    completion_date: status === 'completed' ? document.getElementById('maintenance-completion-date').value : null,
    cost: Number(document.getElementById('maintenance-cost').value),
    technician_name: document.getElementById('maintenance-technician').value.trim(),
    status
  };

  if (!payload.asset_id) {
    showToast('Pilih aset yang akan dipelihara.', 'error');
    return;
  }

  try {
    if (state.editingMaintenanceId) {
      await updateMaintenance(state.editingMaintenanceId, payload);
      showToast('Tiket pemeliharaan berhasil diperbarui.', 'success');
    } else {
      await createMaintenance(payload);
      showToast('Tiket pemeliharaan berhasil dibuat.', 'success');
    }
    closeMaintenanceModal();
    await refreshAllData();
    navigate('maintenance');
  } catch (error) {
    showToast(normalizeError(error), 'error');
  }
}

async function handleMaintenanceStatusChange(recordId, status) {
  const record = state.maintenanceRecords.find(item => item.id === recordId);
  if (!record) return;

  const payload = {
    status,
    completion_date: status === 'completed' ? (record.completion_date || todayIso()) : null
  };

  try {
    await updateMaintenance(recordId, payload);
    showToast(`Status tiket diubah menjadi ${maintenanceStatusLabel(status)}.`, 'success');
    await refreshAllData();
    navigate('maintenance');
  } catch (error) {
    showToast(normalizeError(error), 'error');
    await refreshAllData();
  }
}

async function handleDeleteMaintenance(recordId) {
  if (!window.confirm('Hapus tiket pemeliharaan ini? Data histori akan ikut terhapus.')) return;
  try {
    await deleteMaintenance(recordId);
    showToast('Tiket pemeliharaan berhasil dihapus.', 'success');
    await refreshAllData();
    navigate('maintenance');
  } catch (error) {
    showToast(normalizeError(error), 'error');
  }
}

// ==================== DATA REFRESH ====================
async function refreshAllData() {
  if (!state.user) return;
  const [assets, maintenance] = await Promise.all([
    fetchAssets(),
    fetchMaintenanceRecords()
  ]);
  state.assets = assets || [];
  state.maintenanceRecords = maintenance || [];
  renderDashboard();
  renderAssetsTable();
  renderDepreciationPage();
  renderMaintenancePage();
}

async function initConnectionStatus() {
  const result = await testSupabaseConnection();
  const sidebar = document.getElementById('db-status-sidebar');
  const top = document.getElementById('top-db-status');
  if (result.connected) {
    sidebar.textContent = 'Terhubung ke Supabase';
    top.textContent = 'Supabase Terhubung';
  } else {
    sidebar.textContent = result.configured ? `Koneksi gagal: ${normalizeError(result.error)}` : 'Belum dikonfigurasi';
    top.textContent = result.configured ? 'Koneksi Error' : 'Konfigurasi Belum Ada';
  }
}

function bindEvents() {
  document.getElementById('show-login-tab').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('show-register-tab').addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);

  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('mobile-menu-btn').addEventListener('click', openSidebarMobile);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebarMobile);

  document.getElementById('add-asset-btn').addEventListener('click', () => openAssetModal());
  document.getElementById('close-asset-modal').addEventListener('click', closeAssetModal);
  document.getElementById('cancel-asset-modal').addEventListener('click', closeAssetModal);
  document.getElementById('asset-form').addEventListener('submit', handleAssetSubmit);
  document.getElementById('asset-modal').addEventListener('click', event => { if (event.target.id === 'asset-modal') closeAssetModal(); });

  document.getElementById('add-maintenance-btn').addEventListener('click', () => openMaintenanceModal());
  document.getElementById('close-maintenance-modal').addEventListener('click', closeMaintenanceModal);
  document.getElementById('cancel-maintenance-modal').addEventListener('click', closeMaintenanceModal);
  document.getElementById('maintenance-form').addEventListener('submit', handleMaintenanceSubmit);
  document.getElementById('maintenance-status').addEventListener('change', toggleCompletionDate);
  document.getElementById('maintenance-modal').addEventListener('click', event => { if (event.target.id === 'maintenance-modal') closeMaintenanceModal(); });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeAssetModal();
      closeMaintenanceModal();
    }
  });

  document.getElementById('asset-search').addEventListener('input', event => { state.filters.assetSearch = event.target.value; renderAssetsTable(); });
  document.getElementById('asset-filter-category').addEventListener('change', event => { state.filters.assetCategory = event.target.value; renderAssetsTable(); });
  document.getElementById('maintenance-search').addEventListener('input', event => { state.filters.maintenanceSearch = event.target.value; renderMaintenancePage(); });
  document.getElementById('maintenance-status-filter').addEventListener('change', event => { state.filters.maintenanceStatus = event.target.value; renderMaintenancePage(); });
  document.getElementById('maintenance-type-filter').addEventListener('change', event => { state.filters.maintenanceType = event.target.value; renderMaintenancePage(); });

  document.getElementById('assets-table-body').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const asset = state.assets.find(item => item.id === id);
    if (button.dataset.action === 'edit' && asset) openAssetModal(asset);
    if (button.dataset.action === 'depr' && asset) {
      navigate('depreciation');
      document.getElementById('depr-asset-select').value = asset.id;
      renderSelectedDepreciation();
    }
    if (button.dataset.action === 'delete') handleDeleteAsset(id);
  });

  document.getElementById('maintenance-table-body').addEventListener('change', event => {
    const control = event.target.closest('select[data-action="status"]');
    if (!control) return;
    handleMaintenanceStatusChange(control.dataset.id, control.value);
  });

  document.getElementById('maintenance-table-body').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const record = state.maintenanceRecords.find(item => item.id === button.dataset.id);
    if (button.dataset.action === 'edit' && record) openMaintenanceModal(record);
    if (button.dataset.action === 'delete') handleDeleteMaintenance(button.dataset.id);
  });

  document.getElementById('depr-asset-select').addEventListener('change', renderSelectedDepreciation);
  document.getElementById('save-depr-btn').addEventListener('click', persistSelectedDepreciation);

  document.getElementById('auth-config-warning').classList.toggle('hidden', isSupabaseConfigured());
}

async function initAuth() {
  if (!isSupabaseConfigured()) {
    showAuthScreen();
    document.getElementById('auth-config-warning').classList.remove('hidden');
    return;
  }

  try {
    const session = await getSession();
    await handleAuthenticatedSession(session);

    onAuthStateChanged((_event, nextSession) => {
      setTimeout(() => handleAuthenticatedSession(nextSession), 0);
    });
  } catch (error) {
    showAuthScreen();
    showToast(normalizeError(error), 'error');
  }
}

async function initApp() {
  bindEvents();
  switchAuthTab('login');
  showAuthScreen();
  await initAuth();
}

document.addEventListener('DOMContentLoaded', initApp);
