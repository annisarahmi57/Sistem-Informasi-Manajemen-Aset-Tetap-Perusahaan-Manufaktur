/*
 * Supabase client + database API layer.
 *
 * IMPORTANT:
 * 1) Replace the two empty constants below with your own Supabase project URL
 *    and public anon key.
 * 2) Never put a service_role key in this browser application.
 * 3) Run schema.sql first in Supabase SQL Editor.
 */

const SUPABASE_URL = 'https://ftdsnonokezyyvgudabg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZHNub25va2V6eXl2Z3VkYWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NjAxMzcsImV4cCI6MjEwNjEzNjEzN30.ghV-TSjwpYTfT5VNLKwvUf__lDsla9Ne725rf_zSHPA';

const SUPABASE_CONFIGURED = Boolean(
  window.supabase &&
  SUPABASE_URL.trim() &&
  SUPABASE_ANON_KEY.trim()
);

const supabaseClient = SUPABASE_CONFIGURED
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function isSupabaseConfigured() {
  return SUPABASE_CONFIGURED && Boolean(supabaseClient);
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di supabase-config.js.');
  }
}

function throwIfError(error) {
  if (error) throw error;
}

// ------------------------------
// AUTHENTICATION
// ------------------------------
async function getSession() {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient.auth.getSession();
  throwIfError(error);
  return data.session;
}

async function registerUser({ fullName, email, password, role }) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role
      }
    }
  });
  throwIfError(error);
  return data;
}

async function loginUser({ email, password }) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  throwIfError(error);
  return data;
}

async function logoutUser() {
  assertSupabaseConfigured();
  const { error } = await supabaseClient.auth.signOut();
  throwIfError(error);
}

function onAuthStateChanged(callback) {
  assertSupabaseConfigured();
  return supabaseClient.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

async function getCurrentUserProfile(userId) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('users_profile')
    .select('id, full_name, role, created_at')
    .eq('id', userId)
    .maybeSingle();
  throwIfError(error);
  return data;
}

// ------------------------------
// ASSET API
// ------------------------------
async function fetchAssets() {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });
  throwIfError(error);
  return data || [];
}

async function createAsset(payload) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('assets')
    .insert(payload)
    .select('*')
    .single();
  throwIfError(error);
  return data;
}

async function updateAsset(assetId, payload) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('assets')
    .update(payload)
    .eq('id', assetId)
    .select('*')
    .single();
  throwIfError(error);
  return data;
}

async function deleteAsset(assetId) {
  assertSupabaseConfigured();
  const { error } = await supabaseClient
    .from('assets')
    .delete()
    .eq('id', assetId);
  throwIfError(error);
}

// ------------------------------
// MAINTENANCE API
// ------------------------------
async function fetchMaintenanceRecords() {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('maintenance_records')
    .select(`
      id,
      asset_id,
      maintenance_type,
      title,
      description,
      scheduled_date,
      completion_date,
      cost,
      technician_name,
      status,
      created_at,
      updated_at,
      assets:assets!maintenance_records_asset_id_fkey (
        id,
        asset_code,
        name,
        category,
        location,
        status
      )
    `)
    .order('scheduled_date', { ascending: false })
    .order('created_at', { ascending: false });
  throwIfError(error);
  return data || [];
}

async function createMaintenance(payload) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('maintenance_records')
    .insert(payload)
    .select(`
      *,
      assets:assets!maintenance_records_asset_id_fkey (id, asset_code, name, category, location, status)
    `)
    .single();
  throwIfError(error);

  // JS-side synchronization requested by the application specification.
  await syncAssetStatusFromMaintenance(data);
  return data;
}

async function updateMaintenance(maintenanceId, payload) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('maintenance_records')
    .update(payload)
    .eq('id', maintenanceId)
    .select(`
      *,
      assets:assets!maintenance_records_asset_id_fkey (id, asset_code, name, category, location, status)
    `)
    .single();
  throwIfError(error);

  await syncAssetStatusFromMaintenance(data);
  return data;
}

async function deleteMaintenance(maintenanceId) {
  assertSupabaseConfigured();
  const { data: oldRecord, error: fetchError } = await supabaseClient
    .from('maintenance_records')
    .select('id, asset_id, status')
    .eq('id', maintenanceId)
    .single();
  throwIfError(fetchError);

  const { error } = await supabaseClient
    .from('maintenance_records')
    .delete()
    .eq('id', maintenanceId);
  throwIfError(error);

  if (oldRecord) {
    await syncAssetStatusFromMaintenance({ ...oldRecord, deleted: true });
  }
}

async function getInProgressCountForAsset(assetId, exceptId = null) {
  const query = supabaseClient
    .from('maintenance_records')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', assetId)
    .eq('status', 'in_progress');

  if (exceptId) query.neq('id', exceptId);

  const { count, error } = await query;
  throwIfError(error);
  return Number(count || 0);
}

async function setAssetStatus(assetId, status) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('assets')
    .update({ status })
    .eq('id', assetId)
    .select('id, status')
    .single();
  throwIfError(error);
  return data;
}

async function syncAssetStatusFromMaintenance(record) {
  assertSupabaseConfigured();
  if (!record?.asset_id) return;

  if (!record.deleted && record.status === 'in_progress') {
    await setAssetStatus(record.asset_id, 'maintenance');
    return;
  }

  if (record.deleted && record.status !== 'in_progress') return;

  if (record.status === 'completed' || record.status === 'cancelled' || record.deleted) {
    const exceptId = record.deleted ? record.id : record.id;
    const inProgressCount = await getInProgressCountForAsset(record.asset_id, exceptId);
    if (inProgressCount === 0) {
      await setAssetStatus(record.asset_id, 'active');
    }
  }
}

// ------------------------------
// DEPRECIATION SCHEDULE API
// ------------------------------
async function fetchDepreciationSchedules(assetId) {
  assertSupabaseConfigured();
  const { data, error } = await supabaseClient
    .from('depreciation_schedules')
    .select('*')
    .eq('asset_id', assetId)
    .order('year', { ascending: true });
  throwIfError(error);
  return data || [];
}

async function saveDepreciationSchedule(assetId, rows) {
  assertSupabaseConfigured();

  const { error: deleteError } = await supabaseClient
    .from('depreciation_schedules')
    .delete()
    .eq('asset_id', assetId);
  throwIfError(deleteError);

  if (!rows.length) return [];

  const { data, error } = await supabaseClient
    .from('depreciation_schedules')
    .insert(rows)
    .select('*')
    .order('year', { ascending: true });
  throwIfError(error);
  return data || [];
}

// ------------------------------
// CONNECTION TEST
// ------------------------------
async function testSupabaseConnection() {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      configured: false,
      message: 'Supabase belum dikonfigurasi.'
    };
  }

  try {
    const { error } = await supabaseClient
      .from('assets')
      .select('id')
      .limit(1);

    return error
      ? { connected: false, configured: true, error }
      : { connected: true, configured: true };
  } catch (error) {
    return { connected: false, configured: true, error };
  }
}
