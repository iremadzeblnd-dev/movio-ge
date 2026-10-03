const SUPABASE_URL = "https://iocjpgiarjqpnvqjbhtt.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ak5UWvtJ5z7MuODCOkBHDQ_V6R4V13X";

window.movioSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
