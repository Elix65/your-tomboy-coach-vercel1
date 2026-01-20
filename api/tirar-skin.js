import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function weightedPick(items, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    // 1) Skins activas
    const { data: skins, error: skinsErr } = await supabase
      .from("skins")
      .select("id,nombre,rareza,imagen_url,probabilidad")
      .eq("activa", true);

    if (skinsErr) {
      console.error("skinsErr:", skinsErr);
      return res.status(500).json({ error: "DB error loading skins" });
    }
    if (!skins?.length) return res.status(500).json({ error: "No active skins" });

    // 2) Pick por probabilidad (COMUN)
    const weights = skins.map(s => Math.max(0, Number(s.probabilidad || 0)));
    const picked = weightedPick(skins, weights) || skins[0];

    // 3) Guardar en user_skins (sumar cantidad si ya existe)
    const { data: existing, error: exErr } = await supabase
      .from("user_skins")
      .select("id,cantidad")
      .eq("user_id", user_id)
      .eq("skin_id", picked.id)
      .maybeSingle();

    if (exErr) {
      console.error("exErr:", exErr);
      return res.status(500).json({ error: "DB error reading user_skins" });
    }

    if (!existing) {
      const { error: insErr } = await supabase.from("user_skins").insert({
        user_id,
        skin_id: picked.id,
        cantidad: 1,
        fecha_obtenida: new Date().toISOString()
      });

      if (insErr) {
        console.error("insErr:", insErr);
        return res.status(500).json({ error: "DB error inserting user_skins" });
      }
    } else {
      const { error: updErr } = await supabase
        .from("user_skins")
        .update({ cantidad: (existing.cantidad || 0) + 1 })
        .eq("id", existing.id);

      if (updErr) {
        console.error("updErr:", updErr);
        return res.status(500).json({ error: "DB error updating user_skins" });
      }
    }

    return res.status(200).json({ ok: true, skin: picked });
  } catch (e) {
    console.error("tirar-skin fatal:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
