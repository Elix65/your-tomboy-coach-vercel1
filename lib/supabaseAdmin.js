const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdminEnvState() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  let supabaseUrlHost = null;
  if (supabaseUrl) {
    try {
      supabaseUrlHost = new URL(supabaseUrl).host;
    } catch {
      supabaseUrlHost = 'invalid_url';
    }
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    hasServiceRoleKey: Boolean(serviceRoleKey),
    supabaseUrlHost
  };
}

function getSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminEnvState();

  if (!supabaseUrl) {
    const error = new Error('Missing SUPABASE_URL');
    error.statusCode = 500;
    throw error;
  }

  if (!serviceRoleKey) {
    const error = new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    error.statusCode = 500;
    throw error;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

module.exports = {
  getSupabaseAdminClient,
  getSupabaseAdminEnvState
};
