import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const { user_id, new_reply } = req.body || {};
    if (!token || !user_id || !new_reply) {
      return res.status(400).json({ error: "Missing token/user_id/new_reply" });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });
    if (userData.user.id !== user_id) return res.status(403).json({ error: "User mismatch" });

    const { data: lastYumiko, error: lastErr } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("user_id", user_id)
      .eq("sender", "yumiko")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) return res.status(500).json({ error: lastErr.message || "DB read failed" });

    if (lastYumiko?.id) {
      const { error: delErr } = await supabaseAdmin
        .from("messages")
        .delete()
        .eq("id", lastYumiko.id);

      if (delErr) return res.status(500).json({ error: delErr.message || "DB delete last yumiko failed" });
    }

    const { error: insErr } = await supabaseAdmin
      .from("messages")
      .insert({ user_id, sender: "yumiko", content: new_reply });

    if (insErr) return res.status(500).json({ error: insErr.message || "DB insert new yumiko failed" });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("regenerate-last error:", e?.message || e);
    return res.status(500).json({ error: "Internal error" });
  }
}
