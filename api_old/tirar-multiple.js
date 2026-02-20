import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

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

    const { user_id, cantidad } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    const n = clampInt(cantidad, 1, 10);

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

    const weights = skins.map(s => Math.max(0, Number(s.probabilidad || 0)));

    // 2) Pick n veces
    const resultados = [];
    const counts = new Map();

    for (let i = 0; i < n; i++) {
      const picked = weightedPick(skins, weights) || skins[0];
      resultados.push(picked);
      counts.set(picked.id, (counts.get(picked.id) || 0) + 1);
    }

    // 3) Upsert en user_skins por grupo
    for (const [skinId, addQty] of counts.entries()) {
      const { data: existing, error: exErr } = await supabase
        .from("user_skins")
        .select("id,cantidad")
        .eq("user_id", user_id)
        .eq("skin_id", skinId)
        .maybeSingle();

      if (exErr) {
        console.error("exErr:", exErr);
        return res.status(500).json({ error: "DB error reading user_skins" });
      }

      if (!existing) {
        const { error: insErr } = await supabase.from("user_skins").insert({
          user_id,
          skin_id: skinId,
          cantidad: addQty,
          fecha_obtenida: new Date().toISOString()
        });

        if (insErr) {
          console.error("insErr:", insErr);
          return res.status(500).json({ error: "DB error inserting user_skins" });
        }
      } else {
        const { error: updErr } = await supabase
          .from("user_skins")
          .update({ cantidad: (existing.cantidad || 0) + addQty })
          .eq("id", existing.id);

        if (updErr) {
          console.error("updErr:", updErr);
          return res.status(500).json({ error: "DB error updating user_skins" });
        }
      }
    }

    return res.status(200).json({ ok: true, cantidad: n, resultados });
  } catch (e) {
    console.error("tirar-multiple fatal:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
