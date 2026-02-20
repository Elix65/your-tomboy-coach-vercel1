import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helpers
function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function normalizeTipo(tipo) {
  return tipo === "premium" ? "premium" : "comun";
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

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });

    // Validar usuario por JWT del cliente
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });

    const userId = userData.user.id;

    const { tipo, count } = req.body || {};
    const tipoNorm = normalizeTipo(tipo);
    const n = clampInt(count, 1, 10); // permitimos 1..10

    // 1) Obtener saldo
    const { data: rollRow, error: rollErr } = await supabaseAdmin
      .from("user_rolls")
      .select("id,cantidad")
      .eq("user_id", userId)
      .eq("tipo", tipoNorm)
      .maybeSingle();

    if (rollErr) return res.status(500).json({ error: "DB error reading rolls" });

    const saldo = rollRow?.cantidad || 0;
    if (saldo < n) {
      return res.status(400).json({
        error: "INSUFFICIENT_ROLLS",
        tipo: tipoNorm,
        saldo,
        requerido: n
      });
    }

    // 2) Descontar saldo
    const nuevoSaldo = saldo - n;

    if (!rollRow) {
      // no debería pasar si saldo existía, pero por seguridad:
      await supabaseAdmin.from("user_rolls").insert({
        user_id: userId,
        tipo: tipoNorm,
        cantidad: nuevoSaldo,
        skin_id: null
      });
    } else {
      const { error: updErr } = await supabaseAdmin
        .from("user_rolls")
        .update({ cantidad: nuevoSaldo })
        .eq("id", rollRow.id);

      if (updErr) return res.status(500).json({ error: "DB error updating rolls" });
    }

    // 3) Traer skins activas
    const { data: skins, error: skinsErr } = await supabaseAdmin
      .from("skins")
      .select("id,nombre,rareza,imagen_url,probabilidad,activa")
      .eq("activa", true);

    if (skinsErr) return res.status(500).json({ error: "DB error loading skins" });
    if (!skins || skins.length === 0) {
      return res.status(500).json({ error: "No active skins configured" });
    }

    // 4) Sampleo por probabilidad
    const picks = [];
    for (let i = 0; i < n; i++) {
      const weights = skins.map(s =>
        tipoNorm === "premium"
          ? pesoPremium(s.rareza, s.probabilidad)
          : Math.max(0, Number(s.probabilidad || 0))
      );

      const picked = weightedPick(skins, weights) || skins[0];
      picks.push(picked);
    }

    // 5) Guardar en user_skins (upsert por user_id+skin_id)
    // OJO: tu tabla tiene id uuid + user_id + skin_id + fecha_obtenida + cantidad
    // Vamos a hacer: para cada skin, si existe -> cantidad+1, si no -> insert.
    // Para evitar N queries, agrupamos conteos.
    const counts = new Map();
    for (const p of picks) counts.set(p.id, (counts.get(p.id) || 0) + 1);

    for (const [skinId, addQty] of counts.entries()) {
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("user_skins")
        .select("id,cantidad")
        .eq("user_id", userId)
        .eq("skin_id", skinId)
        .maybeSingle();

      if (exErr) return res.status(500).json({ error: "DB error reading user_skins" });

      if (!existing) {
        const { error: insErr } = await supabaseAdmin
          .from("user_skins")
          .insert({
            user_id: userId,
            skin_id: skinId,
            cantidad: addQty,
            fecha_obtenida: new Date().toISOString()
          });

        if (insErr) return res.status(500).json({ error: "DB error inserting user_skins" });
      } else {
        const { error: upErr } = await supabaseAdmin
          .from("user_skins")
          .update({ cantidad: (existing.cantidad || 0) + addQty })
          .eq("id", existing.id);

        if (upErr) return res.status(500).json({ error: "DB error updating user_skins" });
      }
    }

    // 6) (Opcional) Loggear tiradas en user_rolls como historial NO lo hacemos hoy.
    // Te devuelvo resultados + saldo actualizado
    return res.status(200).json({
      ok: true,
      tipo: tipoNorm,
      count: n,
      saldo_antes: saldo,
      saldo_despues: nuevoSaldo,
      results: picks.map(p => ({
        id: p.id,
        nombre: p.nombre,
        rareza: p.rareza,
        imagen_url: p.imagen_url
      }))
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
