// supabase.js
const SUPABASE_URL = "https://rlunygzxvpldfaanhxnj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_LcfKHbQf88gNcxQkdEvEaA_Ll_twyUd";

if (!window.supabase?.createClient) {
  console.error("Supabase library not loaded");
  throw new Error("Supabase library not loaded");
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true
  }
});

window.supabaseClient = supabaseClient;

export default supabaseClient;
