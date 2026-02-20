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

function isRarePlus(rareza) {
  const r = (rareza || "").toLowerCase();
  return r === "rara" || r === "epica" || r === "épica" || r === "legendaria";
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

    if (selErr) {
      console.error("user_rolls select error:", selErr);
      return res.status(500).json({ error: "DB error reading rolls" });
    }

    const saldo = row?.cantidad || 0;
    if (!row) {
      // Si no existe la fila, tratamos como 0 saldo
      return res.status(400).json({ error: "INSUFFICIENT_PREMIUM_ROLLS", saldo: 0, requerido: n });
    }

    if (saldo < n) {
      return res.status(400).json({ error: "INSUFFICIENT_PREMIUM_ROLLS", saldo, requerido: n });
    }

    // 2) Descontar n (MVP: primero descontamos para evitar doble gasto)
    const { error: updErr } = await supabase
      .from("user_rolls")
      .update({ cantidad: saldo - n })
      .eq("id", row.id);

    if (updErr) {
      console.error("user_rolls update error:", updErr);
      return res.status(500).json({ error: "DB error updating rolls" });
    }

    // 3) Skins activas
    const { data: skins, error: skinsErr } = await supabase
      .from("skins")
      .select("id,nombre,rareza,imagen_url,probabilidad")
      .eq("activa", true);

    if (skinsErr) {
      console.error("skins select error:", skinsErr);
      return res.status(500).json({ error: "DB error loading skins" });
    }
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

    // ✅ Bendición Yumiko: si es x10 y salió todo común, forzar 1 Rara+
    if (n === 10) {
      const hasRarePlus = resultados.some(s => isRarePlus(s.rareza));

      if (!hasRarePlus) {
        const rarePlusPool = skins.filter(s => isRarePlus(s.rareza));

        if (rarePlusPool.length) {
          const rarePlusWeights = rarePlusPool.map(s => pesoPremium(s.rareza, s.probabilidad));
          const forced = weightedPick(rarePlusPool, rarePlusWeights) || rarePlusPool[0];

          const idxComun = resultados.findIndex(s => (s.rareza || "").toLowerCase() === "comun");
          const replaceIndex = idxComun >= 0 ? idxComun : 0;

          const removed = resultados[replaceIndex];
          resultados[replaceIndex] = forced;

          // ajustar counts
          counts.set(removed.id, (counts.get(removed.id) || 1) - 1);
          if (counts.get(removed.id) <= 0) counts.delete(removed.id);

          counts.set(forced.id, (counts.get(forced.id) || 0) + 1);
        }
      }
    }

    // 5) Upsert por cada skin en user_skins
    for (const [skinId, addQty] of counts.entries()) {
      const { data: existing, error: exErr } = await supabase
        .from("user_skins")
        .select("id,cantidad")
        .eq("user_id", user_id)
        .eq("skin_id", skinId)
        .maybeSingle();

      if (exErr) {
        console.error("user_skins select error:", exErr);
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
          console.error("user_skins insert error:", insErr);
          return res.status(500).json({ error: "DB error inserting user_skins" });
        }
      } else {
        const { error: upErr2 } = await supabase
          .from("user_skins")
          .update({ cantidad: (existing.cantidad || 0) + addQty })
          .eq("id", existing.id);

        if (upErr2) {
          console.error("user_skins update error:", upErr2);
          return res.status(500).json({ error: "DB error updating user_skins" });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      tipo: "premium",
      cantidad: n,
      saldo_despues: saldo - n,
      resultados,
      bonus: n === 10 ? "rare_plus_guarantee" : null
    });

  } catch (e) {
    console.error("tirar-multiple-premium fatal:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
