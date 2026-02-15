// supabase.js
const supabaseClient = window.supabase.createClient(
  "https://rlunygzxvpldfaanhxnj.supabase.co",
  "sb_publishable_LcfKHbQf88gNcxQkdEvEaA_Ll_twyUd",
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true
    }
  }
);

export default supabaseClient;
