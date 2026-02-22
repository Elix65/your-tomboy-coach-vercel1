const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mpAccessToken = process.env.MP_ACCESS_TOKEN;
const mpPlanId = process.env.MP_PLAN_ID;
const mpPreapprovalPlanId = process.env.MP_PREAPPROVAL_PLAN_ID;
const VOICE_PLAN = 'pacto_voz_triunfante';
const ACTIVE_VOICE_PLANS = ['voice_lite', 'voice_plus'];

function getMpAccessTokenPrefix(token) {
  if (!token) return 'MISSING';
  if (token.startsWith('TEST')) return 'TEST';
  if (token.startsWith('APP_USR')) return 'APP_USR';
  return 'OTHER';
}

async function parseMpResponseBody(response) {
  const raw = await response.text().catch(() => '');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

async function getAuthUserOrNull(supabaseAdmin, token) {
  if (!token) return null;
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return null;
  return userData.user;
}

function buildActiveSubscriptionQuery(supabaseAdmin, userId, { provider } = {}) {
  const nowIso = new Date().toISOString();

  let query = supabaseAdmin
    .from('subscriptions')
    .select('plan,status,provider,current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('plan', ACTIVE_VOICE_PLANS)
    .or(`current_period_end.is.null,current_period_end.gt.${nowIso}`)
    .limit(1);

  if (provider) {
    query = query.in('provider', [provider, 'mercadopago']);
  }

  return query;
}

async function getActiveVoiceSubscription(supabaseAdmin, userId, options = {}) {
  const { data: rows, error } = await buildActiveSubscriptionQuery(supabaseAdmin, userId, options);

  if (error) {
    throw new Error(error.message || 'Error checking subscription status.');
  }

  const subscriptions = Array.isArray(rows) ? rows : [];
  return subscriptions[0] || null;
}

function getAction(req) {
  if (req.query?.action) return req.query.action;
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('action');
}

function getMercadoPagoConfigError() {
  if (!mpAccessToken || !mpPlanId) {
    return 'Missing MP_ACCESS_TOKEN or MP_PLAN_ID.';
  }

  return null;
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


function estimateTtsSeconds(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 2.5));
}

async function createElevenLabsMp3({ text, apiKey, voiceId }) {
  const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2'
    })
  });

  if (!ttsResponse.ok) {
    const ttsError = await ttsResponse.text();
    throw new Error(`ElevenLabs TTS error: ${ttsError}`);
  }

  return Buffer.from(await ttsResponse.arrayBuffer());
}

async function mpInitPointHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const mpConfigError = getMercadoPagoConfigError();
  if (mpConfigError) {
    return res.status(500).json({ error: mpConfigError });
  }

  const response = await fetch(`https://api.mercadopago.com/preapproval_plan/${mpPlanId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mpAccessToken}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(500).json({ error: data?.message || 'Mercado Pago preapproval_plan fetch failed.' });
  }

  return res.status(200).json({ init_point: data?.init_point || null, plan_id: mpPlanId });
}

async function mpSyncVoiceHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const mpConfigError = getMercadoPagoConfigError();
  if (mpConfigError) {
    return res.status(500).json({ error: mpConfigError });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const body = req.body || {};
  const isTestToken = mpAccessToken.startsWith('TEST-');
  const hasBodyPayerEmail = typeof body.payer_email === 'string' && body.payer_email.trim().length > 0;
  if (hasBodyPayerEmail && !isTestToken) {
    return res.status(400).json({ error: 'payer_email is allowed only with TEST- Mercado Pago tokens.' });
  }

  const payerEmail = hasBodyPayerEmail ? body.payer_email.trim() : userData.user.email;
  if (!payerEmail) {
    return res.status(400).json({ error: 'Missing payer email.' });
  }

  const searchUrl = `https://api.mercadopago.com/preapproval/search?payer_email=${encodeURIComponent(payerEmail)}&preapproval_plan_id=${encodeURIComponent(mpPlanId)}`;
  const mpResponse = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mpAccessToken}`
    }
  });

  const mpData = await mpResponse.json().catch(() => ({}));
  if (!mpResponse.ok) {
    return res.status(500).json({ error: mpData?.message || 'Mercado Pago preapproval search failed.' });
  }

  const results = Array.isArray(mpData?.results) ? mpData.results : [];
  const authorizedSub = results.find((item) => item?.status === 'authorized');
  const statusFound = authorizedSub?.status || results[0]?.status || null;
  const finalStatus = authorizedSub ? 'authorized' : (statusFound || 'none');

  const { error: upsertErr } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: userData.user.id,
      plan: mpPlanId,
      provider: 'mercadopago',
      status: finalStatus,
      current_period_start: null,
      current_period_end: null
    }, { onConflict: 'user_id' });

  if (upsertErr) {
    return res.status(500).json({ error: upsertErr.message || 'Error upserting subscriptions.' });
  }

  return res.status(200).json({
    ok: true,
    voice_enabled: finalStatus === 'authorized',
    status_found: statusFound,
    payer_email_used: payerEmail
  });
}

async function mpWebhookHandler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const secret = process.env.MP_WEBHOOK_SECRET || '';
    return res.status(200).json({
      ok: true,
      alive: true,
      secret_present: Boolean(secret),
      secret_len: secret.length,
      secret_fp: crypto.createHash('sha256').update(secret).digest('hex').slice(0, 10)
    });
  }

  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, alive: true });
  }

  const u = new URL(req.url, 'https://dummy.local');
  const dataIdUrlRaw = u.searchParams.get('data.id') || u.searchParams.get('id') || '';
  const dataIdUrl = /^[a-z0-9]+$/i.test(dataIdUrlRaw) && !/^\d+$/.test(dataIdUrlRaw)
    ? dataIdUrlRaw.toLowerCase()
    : dataIdUrlRaw;
  const xSignature = String(req.headers['x-signature'] || '');
  const xRequestId = String(req.headers['x-request-id'] || '');
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('MP_WEBHOOK_SECRET_MISSING');
    return res.status(500).json({ error: 'MP_WEBHOOK_SECRET_MISSING' });
  }

  const body = await getJsonBody(req);
  const bodyDataId = body?.data?.id || body?.id || '';
  const topic = body?.type || body?.topic || body?.entity || null;
  const signatureParts = xSignature
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const ts = signatureParts.find((part) => part.startsWith('ts='))?.split('=')[1] || '';
  const v1 = signatureParts.find((part) => part.startsWith('v1='))?.split('=')[1] || '';

  if (!ts || !v1) {
    return res.status(400).json({ error: 'MISSING_SIGNATURE_HEADERS' });
  }

  if (!dataIdUrl && !bodyDataId) {
    return res.status(400).json({ error: 'MISSING_EVENT_ID' });
  }

  const templateParts = [];
  if (dataIdUrl) templateParts.push(`id:${dataIdUrl}`);
  if (xRequestId) templateParts.push(`request-id:${xRequestId}`);
  if (ts) templateParts.push(`ts:${ts}`);
  const template = `${templateParts.join(';')};`;

  const computed = crypto
    .createHmac('sha256', webhookSecret)
    .update(template)
    .digest('hex');
  const v1Lower = v1.toLowerCase();
  const computedLower = computed.toLowerCase();

  const providedDigest = Buffer.from(v1Lower, 'hex');
  const expectedDigest = Buffer.from(computedLower, 'hex');
  const signatureOk = providedDigest.length === expectedDigest.length
    && crypto.timingSafeEqual(providedDigest, expectedDigest);

  if (process.env.MP_WEBHOOK_DEBUG === 'true') {
    console.log('mp webhook signature debug', {
      url: req.url,
      dataIdUrl,
      bodyDataId,
      xRequestId,
      ts,
      template,
      v1: v1Lower,
      computed: computedLower
    });
  }

  if (!signatureOk) {
    console.warn('mercadopago webhook invalid signature', {
      id: dataIdUrl || bodyDataId,
      topic,
      xRequestId,
      ts
    });

    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  res.status(200).json({ ok: true });

  void (async () => {
    let eventId = null;
    let eventTopic = null;
    try {
      console.log('mercadopago webhook diagnostic env', {
        mp_access_token_prefix: getMpAccessTokenPrefix(mpAccessToken),
        mp_plan_id: mpPlanId || null
      });
      console.log('mercadopago webhook accepted', {
        id: dataIdUrl || bodyDataId,
        topic,
        xRequestId,
        ts
      });
      eventTopic = topic;
      const eventType = String(topic || '').toLowerCase();
      const isPreapprovalEvent = eventType.includes('preapproval') || eventType.includes('subscription');

      if (!isPreapprovalEvent) {
        console.log('mercadopago webhook non-preapproval event payload', { topic, id: dataIdUrl || bodyDataId, body });
        return;
      }

      if (!mpAccessToken) {
        console.warn('mercadopago webhook missing MP_ACCESS_TOKEN, skipping confirm call', { id: dataIdUrl || bodyDataId, topic });
        return;
      }

      eventId = dataIdUrl || bodyDataId;

      if (!mpPlanId) {
        console.warn('mercadopago webhook plan diagnostic skipped: missing MP_PLAN_ID');
      } else {
        const planResponse = await fetch(`https://api.mercadopago.com/preapproval_plan/${encodeURIComponent(mpPlanId)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${mpAccessToken}`
          }
        });
        const planData = await parseMpResponseBody(planResponse);
        console.log('mercadopago webhook plan diagnostic result', {
          status: planResponse.status,
          requested_plan_id: mpPlanId,
          returned_plan_id: planData?.id || null
        });

        if (!planResponse.ok) {
          console.error('mercadopago webhook plan diagnostic failed', {
            status: planResponse.status,
            body: planData
          });
        }
      }

      const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(eventId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mpAccessToken}`
        }
      });

      const mpData = await parseMpResponseBody(mpResponse);
      if (!mpResponse.ok) {
        console.error('mercadopago webhook preapproval fetch failed', {
          id: eventId,
          topic,
          status: mpResponse.status,
          body: mpData
        });
        return;
      }

      console.log('mercadopago webhook preapproval confirmed', {
        id: eventId,
        topic,
        payer_email: mpData?.payer_email || null,
        status: mpData?.status || null,
        preapproval_plan_id: mpData?.preapproval_plan_id || null,
        external_reference: mpData?.external_reference || null
      });

      const externalReference = String(mpData?.external_reference || '').trim();
      if (!externalReference) {
        console.warn('mercadopago webhook missing external_reference, skipping activation', { id: eventId, topic });
        return;
      }

      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) {
        console.warn('mercadopago webhook missing supabase env vars, skipping activation', { id: eventId, topic });
        return;
      }

      const startAt = mpData?.date_created || mpData?.next_payment_date || null;
      const endAt = mpData?.next_payment_date || null;
      const { error: upsertErr } = await supabaseAdmin
        .from('subscriptions')
        .upsert({
          user_id: externalReference,
          plan: VOICE_PLAN,
          provider: 'mercadopago',
          status: 'active',
          current_period_start: startAt,
          current_period_end: endAt
        }, { onConflict: 'user_id,plan' });

      if (upsertErr) {
        console.error('mercadopago webhook subscription upsert failed', {
          id: eventId,
          topic,
          user_id: externalReference,
          error: upsertErr.message
        });
        return;
      }

      console.log('mercadopago webhook subscription activated', {
        id: eventId,
        topic,
        user_id: externalReference,
        plan: VOICE_PLAN,
        current_period_start: startAt,
        current_period_end: endAt
      });
    } catch (error) {
      console.error('mercadopago webhook async processing error', {
        message: error?.message || error,
        id: eventId,
        topic: eventTopic
      });
    }
  })();
}

async function subscriptionStatusHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }

  const user = await getAuthUserOrNull(supabaseAdmin, token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const provider = req.query?.provider ? String(req.query.provider) : null;
    const matchedSubscription = await getActiveVoiceSubscription(supabaseAdmin, user.id, { provider });
    const active = Boolean(matchedSubscription);
    return res.status(200).json({
      ok: true,
      active,
      matched_plan: matchedSubscription?.plan,
      status: matchedSubscription?.status || 'inactive'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error checking subscription status.' });
  }
}

async function mpCreateSubscriptionHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!mpAccessToken || !mpPreapprovalPlanId) {
    return res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN or MP_PREAPPROVAL_PLAN_ID.' });
  }

  console.log('mp create subscription diagnostic env', {
    mp_access_token_prefix: getMpAccessTokenPrefix(mpAccessToken),
    mp_plan_id: mpPlanId || null,
    mp_preapproval_plan_id: mpPreapprovalPlanId || null
  });

  if (!mpPlanId) {
    console.warn('mp create subscription plan diagnostic skipped: missing MP_PLAN_ID');
  } else {
    const planResponse = await fetch(`https://api.mercadopago.com/preapproval_plan/${encodeURIComponent(mpPlanId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${mpAccessToken}`
      }
    });
    const planData = await parseMpResponseBody(planResponse);
    console.log('mp create subscription plan diagnostic result', {
      status: planResponse.status,
      requested_plan_id: mpPlanId,
      returned_plan_id: planData?.id || null
    });

    if (!planResponse.ok) {
      console.error('mp create subscription plan diagnostic failed', {
        status: planResponse.status,
        body: planData
      });
    }
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }

  const user = await getAuthUserOrNull(supabaseAdmin, token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mpAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      preapproval_plan_id: mpPreapprovalPlanId,
      external_reference: user.id,
      back_url: 'https://21-moon.com/?mp_return=1'
    })
  });

  const mpData = await parseMpResponseBody(mpResponse);
  if (!mpResponse.ok) {
    console.error('mp create subscription failed', {
      status: mpResponse.status,
      body: mpData
    });
    return res.status(500).json({ error: mpData?.message || 'Mercado Pago subscription creation failed.' });
  }

  return res.status(200).json({ init_point: mpData?.init_point || null, id: mpData?.id || null });
}

async function yumikoHandler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Yumiko API está viva' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message, profile, messages: incomingMessages, summary, audio_mode: audioModeRaw } = req.body || {};

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
    let audioMode = audioModeRaw === true;

    const supabaseAdmin = getSupabaseAdmin();
    if (audioMode && !supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
    }

    let userId = null;
    let audioAllowed = false;
    if (audioMode && supabaseAdmin) {
      const token = getBearerToken(req);
      const user = await getAuthUserOrNull(supabaseAdmin, token);

      if (user) {
        userId = user.id;

        try {
          const matchedSubscription = await getActiveVoiceSubscription(supabaseAdmin, userId);
          audioAllowed = Boolean(matchedSubscription);
        } catch (subErr) {
          return res.status(500).json({ error: subErr.message || 'Error validating voice subscription.' });
        }

        if (!audioAllowed) {
          return res.status(402).json({ error: 'subscription_required', plan: VOICE_PLAN });
        }
      } else {
        audioMode = false;
      }
    }

    if (!audioMode) {
      return res.status(200).json({ reply, audio_allowed: audioAllowed });
    }

    const elevenKey = process.env.ELEVENLABS_API_KEY;
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!elevenKey || !elevenVoiceId) {
      return res.status(500).json({ error: 'Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID.' });
    }
    const { data: insertedMsg, error: yumikoInsertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        user_id: userId,
        sender: 'yumiko',
        content: reply,
        message_type: 'text'
      })
      .select('id')
      .single();

    if (yumikoInsertErr || !insertedMsg?.id) {
      return res.status(500).json({ error: yumikoInsertErr?.message || 'Error inserting Yumiko message.' });
    }

    const yumikoMessageId = insertedMsg.id;
    const mp3Buffer = await createElevenLabsMp3({ text: reply, apiKey: elevenKey, voiceId: elevenVoiceId });
    const audioOutKey = `${userId}/${yumikoMessageId}.mp3`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('yumiko-audio')
      .upload(audioOutKey, mp3Buffer, { contentType: 'audio/mpeg', upsert: true });

    if (uploadErr) {
      return res.status(500).json({ error: uploadErr.message || 'Error uploading Yumiko audio.' });
    }

    const ttsSeconds = estimateTtsSeconds(reply);
    const { error: updateErr } = await supabaseAdmin
      .from('messages')
      .update({
        audio_out_path: audioOutKey,
        tts_seconds: ttsSeconds,
        message_type: 'audio'
      })
      .eq('id', yumikoMessageId)
      .eq('user_id', userId);

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message || 'Error updating Yumiko audio metadata.' });
    }

    const { data: signedData, error: signedErr } = await supabaseAdmin.storage.from('yumiko-audio').createSignedUrl(audioOutKey, 3600);
    if (signedErr) {
      return res.status(500).json({ error: signedErr.message || 'Error creating Yumiko audio signed URL.' });
    }

    return res.status(200).json({
      reply,
      yumiko_message_id: yumikoMessageId,
      audio_out_signed_url: signedData?.signedUrl,
      audio_out_key: audioOutKey,
      tts_seconds: ttsSeconds,
      audio_allowed: audioAllowed
    });
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

async function getMessagesHandler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' });

    const userId = userData.user.id;
    const { data: rows, error: messagesErr } = await supabaseAdmin
      .from('messages')
      .select('id,sender,content,created_at,message_type,audio_out_path,tts_seconds')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (messagesErr) return res.status(500).json({ error: messagesErr.message || 'Error reading messages.' });

    const messages = [];
    for (const row of rows || []) {
      const message = { ...row };
      if (row.audio_out_path) {
        const { data: signedData, error: signedErr } = await supabaseAdmin.storage
          .from('yumiko-audio')
          .createSignedUrl(row.audio_out_path, 3600);

        if (signedErr) return res.status(500).json({ error: signedErr.message || 'Error creating audio signed URL.' });
        message.audio_url = signedData?.signedUrl || null;
      }
      messages.push(message);
    }

    return res.status(200).json({ messages });
  } catch (e) {
    console.error('get-messages error:', e?.message || e);
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
      case 'get-messages':
        return getMessagesHandler(req, res);
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
      case 'mp-init-point':
        return mpInitPointHandler(req, res);
      case 'mp-sync-voice':
        req.body = await getJsonBody(req);
        return mpSyncVoiceHandler(req, res);
      case 'subscription-status':
        return subscriptionStatusHandler(req, res);
      case 'mp-create-subscription':
        req.body = await getJsonBody(req);
        return mpCreateSubscriptionHandler(req, res);
      case 'mp-webhook':
        req.body = await getJsonBody(req);
        return mpWebhookHandler(req, res);
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
