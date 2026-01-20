import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const user_id = req.query.user_id;
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    const { data: settings, error: setErr } = await supabaseAdmin
      .from("user_settings")
      .select("active_skin_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (setErr) return res.status(500).json({ error: "DB error loading settings" });

    const skinId = settings?.active_skin_id;
    if (!skinId) return res.status(200).json({ skin_id: null, imagen_url: null });

    const { data: skinRow, error: skinErr } = await supabaseAdmin
      .from("skins")
      .select("id, imagen_url")
      .eq("id", skinId)
      .maybeSingle();

    if (skinErr) return res.status(500).json({ error: "DB error loading skin" });

    return res.status(200).json({
      skin_id: skinRow?.id ?? null,
      imagen_url: skinRow?.imagen_url ?? null
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
