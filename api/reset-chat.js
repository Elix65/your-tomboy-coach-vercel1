import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const { user_id, conversation_id } = req.body || {};
    if (!token || !user_id || !conversation_id) {
      return res.status(400).json({ error: "Missing token, user_id or conversation_id" });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });
    if (userData.user.id !== user_id) return res.status(403).json({ error: "User mismatch" });

    const { error: delErr } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("user_id", user_id)
      .eq("conversation_id", conversation_id);

    if (delErr) return res.status(500).json({ error: "DB delete failed" });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
