const SUPABASE_URL = "https://iocjpgiarjqpnvqjbhtt.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ak5UWvtJ5z7MuODCOkBHDQ_V6R4V13X";

// Fail closed when the SDK cannot load; catalog/Auth components show their errors.
window.movioSupabase = null;
if (typeof window.supabase?.createClient === 'function') {
  try { window.movioSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
  catch { /* No local catalog or authentication fallback. */ }
}
