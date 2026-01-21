import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Si ya tenés un endpoint /api/yumiko que genera reply, podés llamarlo desde el cliente
// Pero para mantenerlo simple, este endpoint espera que el cliente le pase `reply` ya generado.
// (Abajo te doy el patch del cliente que lo hace.)

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const { user_id, new_reply } = req.body || {};
    if (!token || !user_id || !new_reply) {
      return res.status(400).json({ error: "Missing token/user_id/new_reply" });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });
    if (userData.user.id !== user_id) return res.status(403).json({ error: "User mismatch" });

    // 1) Traer último mensaje del bot
    const { data: lastBot, error: lastErr } = await supabaseAdmin
      .from("messages")
      .select("id, created_at")
      .eq("user_id", user_id)
      .eq("sender", "bot")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) return res.status(500).json({ error: "DB read failed" });

    // 2) Borrarlo si existe
    if (lastBot?.id) {
      const { error: delErr } = await supabaseAdmin
        .from("messages")
        .delete()
        .eq("id", lastBot.id);

      if (delErr) return res.status(500).json({ error: "DB delete last bot failed" });
    }

    // 3) Insertar nueva respuesta del bot
    const { error: insErr } = await supabaseAdmin
      .from("messages")
      .insert({ user_id, sender: "bot", content: new_reply });

    if (insErr) return res.status(500).json({ error: "DB insert new bot failed" });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
