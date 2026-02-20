const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const formidable = require('formidable');
const OpenAI = require('openai');
const { toFile } = require('openai/uploads');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function getAction(req) {
  if (req.query?.action) return req.query.action;
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('action');
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const raw = await readRawBody(req);
  if (!raw.length) return {};

  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return {};
  }
}

function parseMultipart(req) {
  const form = formidable({ multiples: false });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

// ===============================
// MEMORIA DEL DOJO (BACKEND)
// ===============================
global.yumikoSession = global.yumikoSession || {
  meta: null,
  name: null,
  challengeStart: null
};

function detectarMeta(texto) {
  const t = texto.toLowerCase();
  if (t.includes('ingresos') && t.includes('uber')) {
    return 'aumentar ingresos como conductor de Uber en 15 días';
  }
  return null;
}

function calcularDia(startDate) {
  if (!startDate) return null;

  const start = new Date(startDate);
  const now = new Date();
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
}

function sanitizeMessages(messages = []) {
  return messages
    .filter((msg) => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string')
    .slice(-20)
    .map((msg) => ({ role: msg.role, content: msg.content }));
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function normalizeTipo(tipo) {
  return tipo === 'premium' ? 'premium' : 'comun';
}

function pesoPremium(rareza, base) {
  const r = (rareza || '').toLowerCase();
  const mult = r === 'legendaria' ? 4 : (r === 'epica' || r === 'épica') ? 3 : r === 'rara' ? 2 : 1;
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
  const r = (rareza || '').toLowerCase();
  return r === 'rara' || r === 'epica' || r === 'épica' || r === 'legendaria';
}

async function yumikoHandler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Yumiko API está viva' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message, profile, messages: incomingMessages, summary } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Falta el campo 'message' en el cuerpo." });
    }

    const apiKey = process.env.DEEPSEEK_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta la variable de entorno DEEPSEEK_KEY.' });
    }

    if (profile?.name) global.yumikoSession.name = profile.name;
    if (profile?.goal) global.yumikoSession.meta = profile.goal;
    if (profile?.challengeStart) global.yumikoSession.challengeStart = profile.challengeStart;

    const posibleMeta = detectarMeta(message);
    if (posibleMeta) {
      global.yumikoSession.meta = posibleMeta;
      if (!global.yumikoSession.challengeStart) {
        global.yumikoSession.challengeStart = new Date().toISOString();
      }
    }

    const dia = calcularDia(global.yumikoSession.challengeStart);
    const promptPath = path.join(process.cwd(), 'prompt.txt');
    const basePrompt = fs.readFileSync(promptPath, 'utf8');

    const contextMessages = sanitizeMessages(incomingMessages);
    const messages = [{ role: 'system', content: basePrompt }];

    if (global.yumikoSession.name) {
      messages.push({ role: 'system', content: `El nombre del usuario es ${global.yumikoSession.name}.` });
    }

    if (global.yumikoSession.meta) {
      messages.push({ role: 'system', content: `La meta del usuario es: ${global.yumikoSession.meta}.` });
    }

    if (dia) {
      messages.push({ role: 'system', content: `Hoy es el día ${dia} del reto de 15 días.` });
    }

    if (summary) {
      messages.push({ role: 'system', content: `Resumen de memoria previa del chat: ${summary}` });
    }

    if (contextMessages.length > 0) {
      messages.push(...contextMessages);
    } else {
      messages.push({ role: 'user', content: message });
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || 'Error desconocido desde DeepSeek.';
      return res.status(500).json({ reply: `Yumiko no pudo responder: ${errorMsg}` });
    }

    const reply = data?.choices?.[0]?.message?.content || 'Yumiko no generó respuesta.';
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Error en yumiko:', error);
    return res.status(500).json({ reply: 'Error interno en la API de Yumiko.' });
  }
}

async function regenerateLastHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const { user_id, new_reply } = req.body || {};
    if (!token || !user_id || !new_reply) {
      return res.status(400).json({ error: 'Missing token/user_id/new_reply' });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' });
    if (userData.user.id !== user_id) return res.status(403).json({ error: 'User mismatch' });

    const { data: lastBot, error: lastErr } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('user_id', user_id)
      .eq('sender', 'yumiko')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) return res.status(500).json({ error: lastErr.message || 'DB read failed' });

    if (lastBot?.id) {
      const { error: delErr } = await supabaseAdmin.from('messages').delete().eq('id', lastBot.id);
      if (delErr) return res.status(500).json({ error: delErr.message || 'DB delete last yumiko failed' });
    }

    const { error: insErr } = await supabaseAdmin.from('messages').insert({ user_id, sender: 'yumiko', content: new_reply });
    if (insErr) return res.status(500).json({ error: insErr.message || 'DB insert new yumiko failed' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('regenerate-last error:', e?.message || e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function resetChatHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const { user_id } = req.body || {};
    if (!token || !user_id) {
      return res.status(400).json({ error: 'Missing token or user_id' });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' });
    if (userData.user.id !== user_id) return res.status(403).json({ error: 'User mismatch' });

    const { error: delErr } = await supabaseAdmin.from('messages').delete().eq('user_id', user_id);
    if (delErr) return res.status(500).json({ error: delErr.message || 'DB delete failed' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('reset-chat error:', e?.message || e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function setActiveSkinHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const { user_id, skin_id } = req.body || {};
    if (!user_id || !skin_id) return res.status(400).json({ error: 'Missing user_id or skin_id' });

    const { data: owned, error: ownedErr } = await supabaseAdmin
      .from('user_skins')
      .select('id')
      .eq('user_id', user_id)
      .eq('skin_id', skin_id)
      .maybeSingle();

    if (ownedErr) return res.status(500).json({ error: 'DB error checking ownership' });
    if (!owned) return res.status(403).json({ error: 'NOT_OWNED' });

    const { data: skinRow, error: skinErr } = await supabaseAdmin.from('skins').select('id, imagen_url').eq('id', skin_id).maybeSingle();
    if (skinErr) return res.status(500).json({ error: 'DB error loading skin' });
    if (!skinRow) return res.status(404).json({ error: 'SKIN_NOT_FOUND' });

    const { error: upsertErr } = await supabaseAdmin
      .from('user_settings')
      .upsert({ user_id, active_skin_id: skin_id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (upsertErr) return res.status(500).json({ error: 'DB error saving settings' });

    return res.status(200).json({ ok: true, skin_id: skinRow.id, imagen_url: skinRow.imagen_url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function getActiveSkinHandler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const user_id = req.query.user_id;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    const { data: settings, error: setErr } = await supabaseAdmin.from('user_settings').select('active_skin_id').eq('user_id', user_id).maybeSingle();
    if (setErr) return res.status(500).json({ error: 'DB error loading settings' });

    const skinId = settings?.active_skin_id;
    if (!skinId) return res.status(200).json({ skin_id: null, imagen_url: null });

    const { data: skinRow, error: skinErr } = await supabaseAdmin.from('skins').select('id, imagen_url').eq('id', skinId).maybeSingle();
    if (skinErr) return res.status(500).json({ error: 'DB error loading skin' });

    return res.status(200).json({ skin_id: skinRow?.id ?? null, imagen_url: skinRow?.imagen_url ?? null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function inventarioHandler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const user_id = req.query.user_id;
    if (!user_id) return res.status(400).json({ error: 'Falta user_id' });

    const { data: inventario, error: invError } = await supabaseAdmin
      .from('user_skins')
      .select(`
        id,
        cantidad,
        fecha_obtenida,
        skins (
          id,
          nombre,
          rareza,
          imagen_url
        )
      `)
      .eq('user_id', user_id)
      .order('fecha_obtenida', { ascending: false });

    if (invError) return res.status(500).json({ error: invError.message });

    const resultado = inventario.map((item) => ({
      skin_id: item.skins?.id,
      nombre: item.skins?.nombre,
      rareza: item.skins?.rareza,
      imagen_url: item.skins?.imagen_url,
      cantidad: item.cantidad,
      fecha_obtenida: item.fecha_obtenida
    }));

    return res.status(200).json({ ok: true, total: resultado.length, inventario: resultado });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function gachaPullHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' });

    const userId = userData.user.id;
    const { tipo, count } = req.body || {};
    const tipoNorm = normalizeTipo(tipo);
    const n = clampInt(count, 1, 10);

    const { data: rollRow, error: rollErr } = await supabaseAdmin
      .from('user_rolls')
      .select('id,cantidad')
      .eq('user_id', userId)
      .eq('tipo', tipoNorm)
      .maybeSingle();

    if (rollErr) return res.status(500).json({ error: 'DB error reading rolls' });

    const saldo = rollRow?.cantidad || 0;
    if (saldo < n) {
      return res.status(400).json({ error: 'INSUFFICIENT_ROLLS', tipo: tipoNorm, saldo, requerido: n });
    }

    const nuevoSaldo = saldo - n;

    if (!rollRow) {
      await supabaseAdmin.from('user_rolls').insert({ user_id: userId, tipo: tipoNorm, cantidad: nuevoSaldo, skin_id: null });
    } else {
      const { error: updErr } = await supabaseAdmin.from('user_rolls').update({ cantidad: nuevoSaldo }).eq('id', rollRow.id);
      if (updErr) return res.status(500).json({ error: 'DB error updating rolls' });
    }

    const { data: skins, error: skinsErr } = await supabaseAdmin
      .from('skins')
      .select('id,nombre,rareza,imagen_url,probabilidad,activa')
      .eq('activa', true);

    if (skinsErr) return res.status(500).json({ error: 'DB error loading skins' });
    if (!skins || skins.length === 0) return res.status(500).json({ error: 'No active skins configured' });

    const picks = [];
    for (let i = 0; i < n; i++) {
      const weights = skins.map((s) => (tipoNorm === 'premium' ? pesoPremium(s.rareza, s.probabilidad) : Math.max(0, Number(s.probabilidad || 0))));
      const picked = weightedPick(skins, weights) || skins[0];
      picks.push(picked);
    }

    const counts = new Map();
    for (const p of picks) counts.set(p.id, (counts.get(p.id) || 0) + 1);

    for (const [skinId, addQty] of counts.entries()) {
      const { data: existing, error: exErr } = await supabaseAdmin.from('user_skins').select('id,cantidad').eq('user_id', userId).eq('skin_id', skinId).maybeSingle();
      if (exErr) return res.status(500).json({ error: 'DB error reading user_skins' });

      if (!existing) {
        const { error: insErr } = await supabaseAdmin.from('user_skins').insert({ user_id: userId, skin_id: skinId, cantidad: addQty, fecha_obtenida: new Date().toISOString() });
        if (insErr) return res.status(500).json({ error: 'DB error inserting user_skins' });
      } else {
        const { error: upErr } = await supabaseAdmin.from('user_skins').update({ cantidad: (existing.cantidad || 0) + addQty }).eq('id', existing.id);
        if (upErr) return res.status(500).json({ error: 'DB error updating user_skins' });
      }
    }

    return res.status(200).json({
      ok: true,
      tipo: tipoNorm,
      count: n,
      saldo_antes: saldo,
      saldo_despues: nuevoSaldo,
      results: picks.map((p) => ({ id: p.id, nombre: p.nombre, rareza: p.rareza, imagen_url: p.imagen_url }))
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function tirarSkinHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    const { data: skins, error: skinsErr } = await supabaseAdmin.from('skins').select('id,nombre,rareza,imagen_url,probabilidad').eq('activa', true);
    if (skinsErr) return res.status(500).json({ error: 'DB error loading skins' });
    if (!skins?.length) return res.status(500).json({ error: 'No active skins' });

    const weights = skins.map((s) => Math.max(0, Number(s.probabilidad || 0)));
    const picked = weightedPick(skins, weights) || skins[0];

    const { data: existing, error: exErr } = await supabaseAdmin.from('user_skins').select('id,cantidad').eq('user_id', user_id).eq('skin_id', picked.id).maybeSingle();
    if (exErr) return res.status(500).json({ error: 'DB error reading user_skins' });

    if (!existing) {
      const { error: insErr } = await supabaseAdmin.from('user_skins').insert({ user_id, skin_id: picked.id, cantidad: 1, fecha_obtenida: new Date().toISOString() });
      if (insErr) return res.status(500).json({ error: 'DB error inserting user_skins' });
    } else {
      const { error: updErr } = await supabaseAdmin.from('user_skins').update({ cantidad: (existing.cantidad || 0) + 1 }).eq('id', existing.id);
      if (updErr) return res.status(500).json({ error: 'DB error updating user_skins' });
    }

    return res.status(200).json({ ok: true, skin: picked });
  } catch (e) {
    console.error('tirar-skin fatal:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function tirarSkinPremiumHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    const { data: row, error: selErr } = await supabaseAdmin
      .from('user_rolls')
      .select('id,cantidad')
      .eq('user_id', user_id)
      .eq('tipo', 'premium')
      .maybeSingle();

    if (selErr) return res.status(500).json({ error: 'DB error reading rolls' });

    const saldo = row?.cantidad || 0;
    if (saldo < 1) return res.status(400).json({ error: 'INSUFFICIENT_PREMIUM_ROLLS', saldo });

    if (!row) {
      await supabaseAdmin.from('user_rolls').insert({ user_id, tipo: 'premium', cantidad: 0, skin_id: null });
    } else {
      const { error: updErr } = await supabaseAdmin.from('user_rolls').update({ cantidad: saldo - 1 }).eq('id', row.id);
      if (updErr) return res.status(500).json({ error: 'DB error updating rolls' });
    }

    const { data: skins, error: skinsErr } = await supabaseAdmin.from('skins').select('id,nombre,rareza,imagen_url,probabilidad').eq('activa', true);
    if (skinsErr) return res.status(500).json({ error: 'DB error loading skins' });
    if (!skins?.length) return res.status(500).json({ error: 'No active skins' });

    const weights = skins.map((s) => pesoPremium(s.rareza, s.probabilidad));
    const picked = weightedPick(skins, weights) || skins[0];

    const { data: existing, error: exErr } = await supabaseAdmin.from('user_skins').select('id,cantidad').eq('user_id', user_id).eq('skin_id', picked.id).maybeSingle();
    if (exErr) return res.status(500).json({ error: 'DB error reading user_skins' });

    if (!existing) {
      const { error: insErr } = await supabaseAdmin.from('user_skins').insert({ user_id, skin_id: picked.id, cantidad: 1, fecha_obtenida: new Date().toISOString() });
      if (insErr) return res.status(500).json({ error: 'DB error inserting user_skins' });
    } else {
      const { error: upErr } = await supabaseAdmin.from('user_skins').update({ cantidad: (existing.cantidad || 0) + 1 }).eq('id', existing.id);
      if (upErr) return res.status(500).json({ error: 'DB error updating user_skins' });
    }

    return res.status(200).json({ ok: true, tipo: 'premium', saldo_despues: Math.max(0, saldo - 1), skin: picked });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function tirarMultipleHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const { user_id, cantidad } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    const n = clampInt(cantidad, 1, 10);

    const { data: skins, error: skinsErr } = await supabaseAdmin.from('skins').select('id,nombre,rareza,imagen_url,probabilidad').eq('activa', true);
    if (skinsErr) return res.status(500).json({ error: 'DB error loading skins' });
    if (!skins?.length) return res.status(500).json({ error: 'No active skins' });

    const weights = skins.map((s) => Math.max(0, Number(s.probabilidad || 0)));

    const resultados = [];
    const counts = new Map();

    for (let i = 0; i < n; i++) {
      const picked = weightedPick(skins, weights) || skins[0];
      resultados.push(picked);
      counts.set(picked.id, (counts.get(picked.id) || 0) + 1);
    }

    for (const [skinId, addQty] of counts.entries()) {
      const { data: existing, error: exErr } = await supabaseAdmin.from('user_skins').select('id,cantidad').eq('user_id', user_id).eq('skin_id', skinId).maybeSingle();
      if (exErr) return res.status(500).json({ error: 'DB error reading user_skins' });

      if (!existing) {
        const { error: insErr } = await supabaseAdmin.from('user_skins').insert({ user_id, skin_id: skinId, cantidad: addQty, fecha_obtenida: new Date().toISOString() });
        if (insErr) return res.status(500).json({ error: 'DB error inserting user_skins' });
      } else {
        const { error: updErr } = await supabaseAdmin.from('user_skins').update({ cantidad: (existing.cantidad || 0) + addQty }).eq('id', existing.id);
        if (updErr) return res.status(500).json({ error: 'DB error updating user_skins' });
      }
    }

    return res.status(200).json({ ok: true, cantidad: n, resultados });
  } catch (e) {
    console.error('tirar-multiple fatal:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function tirarMultiplePremiumHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

    const { user_id, cantidad } = req.body || {};
    const n = clampInt(cantidad, 1, 10);
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    const { data: row, error: selErr } = await supabaseAdmin
      .from('user_rolls')
      .select('id,cantidad')
      .eq('user_id', user_id)
      .eq('tipo', 'premium')
      .maybeSingle();

    if (selErr) return res.status(500).json({ error: 'DB error reading rolls' });

    const saldo = row?.cantidad || 0;
    if (!row) return res.status(400).json({ error: 'INSUFFICIENT_PREMIUM_ROLLS', saldo: 0, requerido: n });
    if (saldo < n) return res.status(400).json({ error: 'INSUFFICIENT_PREMIUM_ROLLS', saldo, requerido: n });

    const { error: updErr } = await supabaseAdmin.from('user_rolls').update({ cantidad: saldo - n }).eq('id', row.id);
    if (updErr) return res.status(500).json({ error: 'DB error updating rolls' });

    const { data: skins, error: skinsErr } = await supabaseAdmin.from('skins').select('id,nombre,rareza,imagen_url,probabilidad').eq('activa', true);
    if (skinsErr) return res.status(500).json({ error: 'DB error loading skins' });
    if (!skins?.length) return res.status(500).json({ error: 'No active skins' });

    const weights = skins.map((s) => pesoPremium(s.rareza, s.probabilidad));

    const resultados = [];
    const counts = new Map();

    for (let i = 0; i < n; i++) {
      const picked = weightedPick(skins, weights) || skins[0];
      resultados.push(picked);
      counts.set(picked.id, (counts.get(picked.id) || 0) + 1);
    }

    if (n === 10) {
      const hasRarePlus = resultados.some((s) => isRarePlus(s.rareza));
      if (!hasRarePlus) {
        const rarePlusPool = skins.filter((s) => isRarePlus(s.rareza));
        if (rarePlusPool.length) {
          const rarePlusWeights = rarePlusPool.map((s) => pesoPremium(s.rareza, s.probabilidad));
          const forced = weightedPick(rarePlusPool, rarePlusWeights) || rarePlusPool[0];

          const idxComun = resultados.findIndex((s) => (s.rareza || '').toLowerCase() === 'comun');
          const replaceIndex = idxComun >= 0 ? idxComun : 0;

          const removed = resultados[replaceIndex];
          resultados[replaceIndex] = forced;

          counts.set(removed.id, (counts.get(removed.id) || 1) - 1);
          if (counts.get(removed.id) <= 0) counts.delete(removed.id);
          counts.set(forced.id, (counts.get(forced.id) || 0) + 1);
        }
      }
    }

    for (const [skinId, addQty] of counts.entries()) {
      const { data: existing, error: exErr } = await supabaseAdmin.from('user_skins').select('id,cantidad').eq('user_id', user_id).eq('skin_id', skinId).maybeSingle();
      if (exErr) return res.status(500).json({ error: 'DB error reading user_skins' });

      if (!existing) {
        const { error: insErr } = await supabaseAdmin.from('user_skins').insert({ user_id, skin_id: skinId, cantidad: addQty, fecha_obtenida: new Date().toISOString() });
        if (insErr) return res.status(500).json({ error: 'DB error inserting user_skins' });
      } else {
        const { error: upErr2 } = await supabaseAdmin.from('user_skins').update({ cantidad: (existing.cantidad || 0) + addQty }).eq('id', existing.id);
        if (upErr2) return res.status(500).json({ error: 'DB error updating user_skins' });
      }
    }

    return res.status(200).json({
      ok: true,
      tipo: 'premium',
      cantidad: n,
      saldo_despues: saldo - n,
      resultados,
      bonus: n === 10 ? 'rare_plus_guarantee' : null
    });
  } catch (e) {
    console.error('tirar-multiple-premium fatal:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function voiceMessageHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase env vars are missing.' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!openaiKey || !elevenKey || !elevenVoiceId) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY, ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' });

  const userId = userData.user.id;
  const { files } = await parseMultipart(req);
  const audioFile = files.audio || files.file || Object.values(files)[0];
  const audio = Array.isArray(audioFile) ? audioFile[0] : audioFile;

  if (!audio?.filepath) return res.status(400).json({ error: 'Missing audio file in multipart/form-data.' });

  const userMsgId = crypto.randomUUID();

  const { error: userInsertErr } = await supabaseAdmin.from('messages').insert({
    id: userMsgId,
    user_id: userId,
    sender: 'user',
    message_type: 'audio',
    content: null
  });

  if (userInsertErr) return res.status(500).json({ error: userInsertErr.message || 'Error inserting user audio message.' });

  const audioBuffer = await fsp.readFile(audio.filepath);

  const userAudioKey = `${userId}/${userMsgId}.webm`;
  const { error: userAudioUploadErr } = await supabaseAdmin.storage
    .from('user-audio')
    .upload(userAudioKey, audioBuffer, { contentType: 'audio/webm', upsert: true });

  if (userAudioUploadErr) return res.status(500).json({ error: userAudioUploadErr.message || 'Error uploading user audio.' });

  const openai = new OpenAI({ apiKey: openaiKey });
  const sttFile = await toFile(audioBuffer, audio.originalFilename || `${userMsgId}.webm`);
  const transcription = await openai.audio.transcriptions.create({
    model: 'gpt-4o-mini-transcribe',
    file: sttFile
  });

  const transcript = transcription?.text?.trim() || '';

  const { error: userUpdateErr } = await supabaseAdmin
    .from('messages')
    .update({ transcript, audio_in_path: userAudioKey })
    .eq('id', userMsgId)
    .eq('user_id', userId);

  if (userUpdateErr) return res.status(500).json({ error: userUpdateErr.message || 'Error updating user audio message.' });

  const { data: recentMessages, error: recentMessagesErr } = await supabaseAdmin
    .from('messages')
    .select('sender,content,transcript')
    .eq('user_id', userId)
    .eq('sender', 'user')
    .order('created_at', { ascending: false })
    .limit(6);

  if (recentMessagesErr) {
    console.warn('Could not load recent messages context for voice-message:', recentMessagesErr.message);
  }

  const userContext = (recentMessages || [])
    .map((msg) => msg?.content || msg?.transcript)
    .filter(Boolean)
    .slice(0, 6)
    .reverse();

  const contextBlock = userContext.length
    ? `Contexto reciente del usuario:\n${userContext.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : 'Sin contexto reciente adicional.';

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Sos Yumiko, una coach motivadora. Respondé siempre en español rioplatense, en tono cálido y directo, breve (1-4 frases), y cerrá exactamente con “Usuario-kun”.'
      },
      {
        role: 'user',
        content: `${contextBlock}\n\nAudio transcripto actual:\n${transcript || 'No se pudo transcribir claramente el audio.'}`
      }
    ]
  });

  const replyText = completion.choices?.[0]?.message?.content?.trim() || 'Te escucho, Usuario-kun';
  const yumikoMsgId = crypto.randomUUID();

  const { error: yumikoInsertErr } = await supabaseAdmin.from('messages').insert({
    id: yumikoMsgId,
    user_id: userId,
    sender: 'yumiko',
    message_type: 'audio',
    content: replyText
  });

  if (yumikoInsertErr) return res.status(500).json({ error: yumikoInsertErr.message || 'Error inserting Yumiko audio message.' });

  const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text: replyText,
      model_id: 'eleven_multilingual_v2'
    })
  });

  if (!ttsResponse.ok) {
    const ttsError = await ttsResponse.text();
    return res.status(500).json({ error: `ElevenLabs TTS error: ${ttsError}` });
  }

  const mp3Buffer = Buffer.from(await ttsResponse.arrayBuffer());
  const yumikoAudioKey = `${userId}/${yumikoMsgId}.mp3`;

  const { error: yumikoAudioUploadErr } = await supabaseAdmin.storage
    .from('yumiko-audio')
    .upload(yumikoAudioKey, mp3Buffer, { contentType: 'audio/mpeg', upsert: true });

  if (yumikoAudioUploadErr) return res.status(500).json({ error: yumikoAudioUploadErr.message || 'Error uploading Yumiko audio.' });

  const ttsSeconds = Math.max(1, Math.round(replyText.split(/\s+/).filter(Boolean).length / 2.5));

  const { error: yumikoUpdateErr } = await supabaseAdmin
    .from('messages')
    .update({ audio_out_path: yumikoAudioKey, tts_seconds: ttsSeconds })
    .eq('id', yumikoMsgId)
    .eq('user_id', userId);

  if (yumikoUpdateErr) return res.status(500).json({ error: yumikoUpdateErr.message || 'Error updating Yumiko audio message.' });

  const { data: userSigned, error: userSignedErr } = await supabaseAdmin.storage.from('user-audio').createSignedUrl(userAudioKey, 3600);
  if (userSignedErr) return res.status(500).json({ error: userSignedErr.message || 'Error creating user audio signed URL.' });

  const { data: yumikoSigned, error: yumikoSignedErr } = await supabaseAdmin.storage.from('yumiko-audio').createSignedUrl(yumikoAudioKey, 3600);
  if (yumikoSignedErr) return res.status(500).json({ error: yumikoSignedErr.message || 'Error creating Yumiko audio signed URL.' });

  return res.status(200).json({
    user_message_id: userMsgId,
    yumiko_message_id: yumikoMsgId,
    transcript,
    reply_text: replyText,
    audio_in_key: userAudioKey,
    audio_out_key: yumikoAudioKey,
    audio_in_signed_url: userSigned.signedUrl,
    audio_out_signed_url: yumikoSigned.signedUrl,
    tts_seconds: ttsSeconds
  });
}

module.exports = async function handler(req, res) {
  const action = getAction(req);

  try {
    switch (action) {
      case 'yumiko':
        req.body = await getJsonBody(req);
        return yumikoHandler(req, res);
      case 'regenerate-last':
        req.body = await getJsonBody(req);
        return regenerateLastHandler(req, res);
      case 'reset-chat':
        req.body = await getJsonBody(req);
        return resetChatHandler(req, res);
      case 'set-active-skin':
        req.body = await getJsonBody(req);
        return setActiveSkinHandler(req, res);
      case 'get-active-skin':
        return getActiveSkinHandler(req, res);
      case 'inventario':
        return inventarioHandler(req, res);
      case 'gacha-pull':
        req.body = await getJsonBody(req);
        return gachaPullHandler(req, res);
      case 'tirar-skin':
        req.body = await getJsonBody(req);
        return tirarSkinHandler(req, res);
      case 'tirar-skin-premium':
        req.body = await getJsonBody(req);
        return tirarSkinPremiumHandler(req, res);
      case 'tirar-multiple':
        req.body = await getJsonBody(req);
        return tirarMultipleHandler(req, res);
      case 'tirar-multiple-premium':
        req.body = await getJsonBody(req);
        return tirarMultiplePremiumHandler(req, res);
      case 'voice-message':
        return voiceMessageHandler(req, res);
      default:
        return res.status(404).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('router fatal error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
