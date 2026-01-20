import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { user_id, skin_id } = req.body || {};
    if (!user_id || !skin_id) return res.status(400).json({ error: "Missing user_id or skin_id" });

    // 1) Verificar que el usuario tenga esa skin (seguridad MVP)
    const { data: owned, error: ownedErr } = await supabaseAdmin
      .from("user_skins")
      .select("id")
      .eq("user_id", user_id)
      .eq("skin_id", skin_id)
      .maybeSingle();

    if (ownedErr) return res.status(500).json({ error: "DB error checking ownership" });
    if (!owned) return res.status(403).json({ error: "NOT_OWNED" });

    // 2) Obtener imagen_url para devolverla (para aplicar al toque)
    const { data: skinRow, error: skinErr } = await supabaseAdmin
      .from("skins")
      .select("id, imagen_url")
      .eq("id", skin_id)
      .maybeSingle();

    if (skinErr) return res.status(500).json({ error: "DB error loading skin" });
    if (!skinRow) return res.status(404).json({ error: "SKIN_NOT_FOUND" });

    // 3) Upsert en user_settings
    const { error: upsertErr } = await supabaseAdmin
      .from("user_settings")
      .upsert(
        { user_id, active_skin_id: skin_id, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (upsertErr) return res.status(500).json({ error: "DB error saving settings" });

    return res.status(200).json({
      ok: true,
      skin_id: skinRow.id,
      imagen_url: skinRow.imagen_url
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
