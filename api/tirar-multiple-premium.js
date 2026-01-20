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

function pesoPremium(rareza, base) {
  const r = (rareza || "").toLowerCase();
  const mult =
    r === "legendaria" ? 4 :
    (r === "epica" || r === "épica") ? 3 :
    r === "rara" ? 2 : 1;
  return Math.max(0, Number(base || 0)) * mult;
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
    const n = clampInt(cantidad, 1, 10);

    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    // 1) Chequear saldo premium
    const { data: row, error: selErr } = await supabase
      .from("user_rolls")
      .select("id,cantidad")
      .eq("user_id", user_id)
      .eq("tipo", "premium")
      .maybeSingle();

    if (selErr) return res.status(500).json({ error: "DB error reading rolls" });

    const saldo = row?.cantidad || 0;
    if (saldo < n) {
      return res.status(400).json({ error: "INSUFFICIENT_PREMIUM_ROLLS", saldo, requerido: n });
    }

    // 2) Descontar n
    const { error: updErr } = await supabase
      .from("user_rolls")
      .update({ cantidad: saldo - n })
      .eq("id", row.id);

    if (updErr) return res.status(500).json({ error: "DB error updating rolls" });

    // 3) Skins activas
    const { data: skins, error: skinsErr } = await supabase
      .from("skins")
      .select("id,nombre,rareza,imagen_url,probabilidad")
      .eq("activa", true);

    if (skinsErr) return res.status(500).json({ error: "DB error loading skins" });
    if (!skins?.length) return res.status(500).json({ error: "No active skins" });

    const weights = skins.map(s => pesoPremium(s.rareza, s.probabilidad));

    // 4) Pick n veces
    const resultados = [];
    const counts = new Map();

    for (let i = 0; i < n; i++) {
      const picked = weightedPick(skins, weights) || skins[0];
      resultados.push(picked);
      counts.set(picked.id, (counts.get(picked.id) || 0) + 1);
    }

    // 5) Upsert por cada skin en user_skins
    for (const [skinId, addQty] of counts.entries()) {
      const { data: existing, error: exErr } = await supabase
        .from("user_skins")
        .select("id,cantidad")
        .eq("user_id", user_id)
        .eq("skin_id", skinId)
        .maybeSingle();

      if (exErr) return res.status(500).json({ error: "DB error reading user_skins" });

      if (!existing) {
        const { error: insErr } = await supabase.from("user_skins").insert({
          user_id,
          skin_id: skinId,
          cantidad: addQty,
          fecha_obtenida: new Date().toISOString()
        });
        if (insErr) return res.status(500).json({ error: "DB error inserting user_skins" });
      } else {
        const { error: upErr2 } = await supabase
          .from("user_skins")
          .update({ cantidad: (existing.cantidad || 0) + addQty })
          .eq("id", existing.id);

        if (upErr2) return res.status(500).json({ error: "DB error updating user_skins" });
      }
    }

    return res.status(200).json({
      ok: true,
      tipo: "premium",
      cantidad: n,
      saldo_despues: saldo - n,
      resultados
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
