const crypto = require('crypto');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const {
  sendArrivalAdminNotification,
  shouldSendArrivalAdminNotification
} = require('../lib/arrivalNotificationEmail');
const { getSupabaseAdminClient, getSupabaseAdminEnvState } = require('../lib/supabaseAdmin');
const { buildYumikoSystemMessages } = require('../lib/yumikoPrompt');
const { buildYumikoConversationContext } = require('../lib/conversationContext');
const { generateAutoNudge } = require('../lib/nudgeEngine');
const { persistMessage } = require('../lib/messageStore');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mpAccessToken = process.env.MP_ACCESS_TOKEN;
const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;
const mpPlanId = process.env.MP_PLAN_ID;
const mpPreapprovalPlanId = process.env.MP_PREAPPROVAL_PLAN_ID;
const overlayJwtSecret = process.env.OVERLAY_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
const mpAdminBypassEnabled = process.env.MP_ADMIN_BYPASS === '1';
const MP_ADMIN_TEST_USER_ID = 'a5429e17-43e2-4922-9560-ab914f63283e';
const DEFAULT_ARRIVAL_ADMIN_UID = 'a5429e17-43e2-4922-9560-ab914f63283e';
const VOICE_PLAN = 'pacto_voz_triunfante';
const ACTIVE_VOICE_PLANS = ['voice_lite', 'voice_plus'];
const OVERLAY_CODE_TTL_MS = 2 * 60 * 1000;
const OVERLAY_ACCESS_TTL_SECONDS = 15 * 60;
const OVERLAY_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const OVERLAY_NUDGE_INTERVAL_OPTIONS = [1, 2, 5, 10, 20];
const ARRIVAL_ADMIN_SELECT = '*';
const ARRIVAL_ADMIN_MUTABLE_STATUSES = ['approved', 'invited', 'account_enabled'];
const DIRECT_CHECKOUT_SOURCE = 'public_direct_checkout';
const DIRECT_CHECKOUT_MP_URL = 'https://mpago.li/2knhqJD';
const DIRECT_CHECKOUT_PAYPAL_URL = 'https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=4QRV84VRFED6L';

function getArrivalAdminUserIds() {
  const configured = String(process.env.ARRIVAL_ADMIN_UIDS || process.env.ARRIVAL_ADMIN_UID || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length) {
    return configured;
  }

  return [DEFAULT_ARRIVAL_ADMIN_UID];
}

function isArrivalAdminUser(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return false;
  return getArrivalAdminUserIds().includes(normalizedUserId);
}

function normalizeMpErrorMessage(mpData) {
  return String(mpData?.message || mpData?.error || '').trim().toLowerCase();
}

function isPayerEqualsCollectorError({ status, mpData }) {
  if (status !== 400) return false;
  const normalized = normalizeMpErrorMessage(mpData);
  return normalized.includes('payer and collector cannot be the same user');
}

function canUseMpAdminBypass(userId) {
  return Boolean(mpAdminBypassEnabled && userId === MP_ADMIN_TEST_USER_ID);
}

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

function logOverlayAuth(status, errorMessage, extra = {}) {
  const payload = {
    status,
    error: errorMessage ? String(errorMessage) : null,
    ...extra
  };
  const logger = status >= 400 ? console.error : console.info;
  logger('[yumiko][auth]', payload);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}


function decodeBase64UrlJson(segment) {
  const normalized = String(segment || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const text = Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  return JSON.parse(text);
}

function verifyOverlayJwt(token) {
  if (!overlayJwtSecret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', overlayJwtSecret)
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (expectedSignature !== signature) return null;

  const payload = decodeBase64UrlJson(encodedPayload);
  const expMs = Number(payload?.exp || 0) * 1000;
  if (!Number.isFinite(expMs) || expMs <= Date.now()) return null;

  return payload;
}

function buildTokenDebug(token, tokenType = 'unknown') {
  const raw = typeof token === 'string' ? token.trim() : '';
  return {
    tokenType,
    tokenDotCount: raw ? raw.split('.').length - 1 : 0,
    tokenLength: raw.length
  };
}

async function resolveOverlayOrSupabaseAuth(supabaseAdmin, req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('auth_missing');
    error.httpStatus = 401;
    error.errorCode = 'auth_missing';
    error.tokenDebug = buildTokenDebug(token);
    throw error;
  }

  const overlayPayload = verifyOverlayJwt(token);
  if (overlayPayload?.sub) {
    const userId = String(overlayPayload.sub);
    const deviceId = typeof overlayPayload.device_id === 'string' ? overlayPayload.device_id : null;
    const nowIso = new Date().toISOString();

    let query = supabaseAdmin
      .from('overlay_refresh_tokens')
      .select('id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', nowIso)
      .limit(1);

    query = deviceId ? query.eq('device_id', deviceId) : query.is('device_id', null);

    const { data: activeRows, error: activeErr } = await query;
    if (activeErr) {
      const error = new Error('token_issue');
      error.httpStatus = 500;
      error.errorCode = 'token_issue';
      error.tokenDebug = buildTokenDebug(token, 'overlay');
      error.user_id = userId;
      error.device_id = deviceId;
      throw error;
    }

    if (!Array.isArray(activeRows) || activeRows.length === 0) {
      const error = new Error('invalid_token');
      error.httpStatus = 401;
      error.errorCode = 'invalid_token';
      error.tokenDebug = buildTokenDebug(token, 'overlay');
      error.user_id = userId;
      error.device_id = deviceId;
      throw error;
    }

    return {
      userId,
      deviceId,
      tokenType: 'overlay',
      tokenDebug: buildTokenDebug(token, 'overlay')
    };
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    const message = String(userErr?.message || '').toLowerCase();
    const status = Number(userErr?.status || 0);
    const isSupabaseAuthFailed = status === 403 || message.includes('jwt');
    const error = new Error(isSupabaseAuthFailed ? 'supabase_auth_failed' : 'invalid_token');
    error.httpStatus = isSupabaseAuthFailed ? 403 : 401;
    error.errorCode = isSupabaseAuthFailed ? 'supabase_auth_failed' : 'invalid_token';
    error.tokenDebug = buildTokenDebug(token, 'supabase');
    throw error;
  }

  return {
    userId: userData.user.id,
    deviceId: null,
    tokenType: 'supabase',
    tokenDebug: buildTokenDebug(token, 'supabase')
  };
}

async function getAuthUserOrNull(supabaseAdmin, token) {
  if (!token) return null;
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return null;
  return userData.user;
}

async function requireArrivalAdminAccess(supabaseAdmin, req) {
  const auth = await resolveOverlayOrSupabaseAuth(supabaseAdmin, req);

  if (!isArrivalAdminUser(auth.userId)) {
    const error = new Error('arrival_admin_forbidden');
    error.httpStatus = 403;
    error.errorCode = 'arrival_admin_forbidden';
    error.userId = auth.userId;
    throw error;
  }

  return auth;
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
  const url = getRequestUrl(req);
  return url.searchParams.get('action');
}

function getRequestUrl(req) {
  return new URL(req.url, 'https://21-moon.com');
}

function getMercadoPagoConfigError() {
  if (!mpAccessToken) {
    return 'Missing MP_ACCESS_TOKEN.';
  }

  if (!mpPlanId) {
    return 'Missing MP_PLAN_ID.';
  }

  return null;
}

function isPreapprovalEventType({ topic, type, entity }) {
  const normalized = [topic, type, entity]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return normalized.some((value) => value === 'subscription_preapproval' || value === 'preapproval');
}

function getFirstHeaderValue(headerValue) {
  if (Array.isArray(headerValue)) {
    return String(headerValue[0] || '').trim();
  }
  return String(headerValue || '').trim();
}

function parseMpSignatureHeader(signatureHeader) {
  if (!signatureHeader) return {};

  return String(signatureHeader)
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, chunk) => {
      const [rawKey, ...valueParts] = chunk.split('=');
      const key = String(rawKey || '').trim().toLowerCase();
      const value = valueParts.join('=').trim();
      if (key) acc[key] = value;
      return acc;
    }, {});
}

function isMpWebhookSignatureValid({ secret, manifest, signatureV1 }) {
  if (!secret || !manifest || !signatureV1) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(String(signatureV1).toLowerCase(), 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function buildMpWebhookManifest({ idFromUrl, requestId, ts }) {
  return `id:${String(idFromUrl || '').trim()};request-id:${String(requestId || '').trim()};ts:${String(ts || '').trim()};`;
}

async function fetchMpPreapproval(preapprovalId) {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mpAccessToken}`
    }
  });

  const data = await parseMpResponseBody(response);
  return { response, data };
}

async function upsertVoiceEnabledSetting(supabaseAdmin, userId, voiceEnabled) {
  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: userId, voice_enabled: Boolean(voiceEnabled) }, { onConflict: 'user_id' });

  if (error) {
    throw new Error(error.message || 'Error upserting user_settings.voice_enabled.');
  }
}

async function upsertMpPreapprovalStatus(supabaseAdmin, { preapprovalId, userId, status }) {
  const { error } = await supabaseAdmin
    .from('mp_preapprovals')
    .upsert({ preapproval_id: preapprovalId, user_id: userId, status: status || null }, { onConflict: 'preapproval_id' });

  if (error) {
    throw new Error(error.message || 'Error upserting mp_preapprovals.');
  }
}

async function findUserIdByPreapprovalId(supabaseAdmin, preapprovalId) {
  const { data, error } = await supabaseAdmin
    .from('mp_preapprovals')
    .select('user_id')
    .eq('preapproval_id', preapprovalId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Error reading mp_preapprovals mapping.');
  }

  return data?.user_id ? String(data.user_id) : null;
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

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signOverlayJwt(payload, expiresInSeconds) {
  if (!overlayJwtSecret) {
    throw new Error('Missing OVERLAY_JWT_SECRET.');
  }

  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedBody = base64Url(JSON.stringify(body));
  const unsigned = `${encodedHeader}.${encodedBody}`;
  const signature = crypto
    .createHmac('sha256', overlayJwtSecret)
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsigned}.${signature}`;
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sanitizeSupabaseError(error) {
  if (!error) return null;
  return {
    message: error?.message ? String(error.message) : null,
    details: error?.details ? String(error.details) : null,
    hint: error?.hint ? String(error.hint) : null,
    code: error?.code ? String(error.code) : null
  };
}

function isSupabaseSchemaCacheError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('could not find the column')
  );
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSupabaseOpWithSchemaReloadRetry({ supabaseAdmin, operationName, operation }) {
  let result = await operation();

  if (!result?.error || !isSupabaseSchemaCacheError(result.error)) {
    return { ...result, retried: false };
  }

  logOverlayAuth(500, `${operationName}_schema_cache_retry`, {
    supabase: sanitizeSupabaseError(result.error)
  });

  const { error: reloadErr } = await supabaseAdmin.rpc('pgrst_reload');
  if (reloadErr) {
    logOverlayAuth(500, `${operationName}_schema_cache_reload_failed`, {
      supabase: sanitizeSupabaseError(reloadErr)
    });
  }

  await sleepMs(300);
  result = await operation();
  return { ...result, retried: true };
}

function createOverlayCode() {
  return crypto.randomBytes(32).toString('base64url');
}

function createRefreshTokenRaw() {
  return crypto.randomBytes(32).toString('base64url');
}

async function issueOverlayTokens({ supabaseAdmin, userId, deviceId, deviceName }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessToken = signOverlayJwt({ sub: userId, device_id: deviceId || null, device_name: deviceName || null, iat: nowSeconds }, OVERLAY_ACCESS_TTL_SECONDS);
  const refreshToken = createRefreshTokenRaw();
  const refreshTokenHash = hashSecret(refreshToken);
  const refreshExpiresAt = new Date(Date.now() + OVERLAY_REFRESH_TTL_SECONDS * 1000).toISOString();
  const refreshTokenRow = {
    user_id: userId,
    device_id: deviceId || null,
    device_name: deviceName || null,
    refresh_token_hash: refreshTokenHash,
    expires_at: refreshExpiresAt,
    revoked_at: null
  };

  let { error } = await runSupabaseOpWithSchemaReloadRetry({
    supabaseAdmin,
    operationName: 'overlay_refresh_tokens_upsert',
    operation: () =>
      supabaseAdmin
        .from('overlay_refresh_tokens')
        .upsert(refreshTokenRow, { onConflict: 'user_id,device_id' })
  });

  if (error && String(error?.code) === '23505') {
    const fallbackUpdate = await runSupabaseOpWithSchemaReloadRetry({
      supabaseAdmin,
      operationName: 'overlay_refresh_tokens_fallback_update',
      operation: () => {
        let query = supabaseAdmin
          .from('overlay_refresh_tokens')
          .update({
            refresh_token_hash: refreshTokenHash,
            expires_at: refreshExpiresAt,
            device_name: deviceName || null,
            revoked_at: null
          })
          .eq('user_id', userId);

        query = deviceId ? query.eq('device_id', deviceId) : query.is('device_id', null);
        return query;
      }
    });
    if (fallbackUpdate.error) {
      error = fallbackUpdate.error;
    } else {
      error = null;
    }
  }

  if (error) {
    const wrapped = new Error(error.message || 'Error storing overlay refresh token.');
    wrapped.code = String(error?.code || '');
    wrapped.supabase = sanitizeSupabaseError(error);
    throw wrapped;
  }

  return {
    overlay_access_token: accessToken,
    overlay_refresh_token: refreshToken,
    expires_in: OVERLAY_ACCESS_TTL_SECONDS
  };
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = await getJsonBody(req);
    const u = getRequestUrl(req);
    const signatureHeader = getFirstHeaderValue(req.headers['x-signature']);
    const requestIdHeader = getFirstHeaderValue(req.headers['x-request-id']);
    const { ts, v1 } = parseMpSignatureHeader(signatureHeader);

    const idForManifest = String(u.searchParams.get('data.id') || body?.data?.id || '').trim();
    const manifest = buildMpWebhookManifest({ idFromUrl: idForManifest, requestId: requestIdHeader, ts });
    if (mpWebhookSecret && !isMpWebhookSignatureValid({
      secret: mpWebhookSecret,
      manifest,
      signatureV1: v1
    })) {
      console.warn('mercadopago webhook invalid signature', {
        hasSecret: Boolean(mpWebhookSecret),
        hasSignatureHeader: Boolean(signatureHeader),
        hasRequestIdHeader: Boolean(requestIdHeader),
        hasTs: Boolean(ts),
        hasV1: Boolean(v1),
        manifest
      });
      return res.status(200).json({ ok: false });
    }

    const eventId = String(body?.data?.id || u.searchParams.get('data.id') || '').trim();

    const topic = body?.topic || u.searchParams.get('topic') || null;
    const type = body?.type || u.searchParams.get('type') || null;
    const entity = body?.entity || u.searchParams.get('entity') || null;

    if (!isPreapprovalEventType({ topic, type, entity })) {
      console.log('mercadopago webhook ignored non-preapproval event', { topic, type, entity, id: eventId || null });
      return res.status(200).json({ ok: true });
    }

    if (!eventId) {
      console.warn('mercadopago webhook missing preapproval id', { topic, type, entity, body });
      return res.status(200).json({ ok: true });
    }

    if (!mpAccessToken) {
      console.warn('mercadopago webhook missing MP_ACCESS_TOKEN');
      return res.status(200).json({ ok: true });
    }

    const { response: mpResponse, data: mpData } = await fetchMpPreapproval(eventId);
    if (!mpResponse.ok) {
      console.warn('mercadopago webhook preapproval verification skipped', { id: eventId, status: mpResponse.status, body: mpData });
      return res.status(200).json({ ok: true, verified: false });
    }

    const status = String(mpData?.status || '').toLowerCase() || null;
    let userId = String(mpData?.external_reference || '').trim();
    const supabaseAdmin = getSupabaseAdmin();

    if (!supabaseAdmin) {
      console.error('mercadopago webhook missing Supabase env vars');
      return res.status(200).json({ ok: true });
    }

    if (!userId) {
      userId = await findUserIdByPreapprovalId(supabaseAdmin, eventId);
    }

    if (!userId) {
      console.warn('mercadopago webhook preapproval has no user mapping', {
        id: eventId,
        status,
        external_reference: mpData?.external_reference || null
      });
      return res.status(200).json({ ok: true, verified: true });
    }

    await upsertMpPreapprovalStatus(supabaseAdmin, {
      preapprovalId: eventId,
      userId,
      status
    });
    await upsertVoiceEnabledSetting(supabaseAdmin, userId, status === 'active');

    return res.status(200).json({ ok: true, verified: true });
  } catch (error) {
    console.warn('mercadopago webhook fatal', { message: error?.message || String(error) });
    return res.status(200).json({ ok: true });
  }
}

async function mpVerifyHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
  }

  if (!mpAccessToken) {
    return res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN.' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }

  const user = await getAuthUserOrNull(supabaseAdmin, token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const body = await getJsonBody(req);
  if (body?.admin_bypass_activate === true) {
    if (!canUseMpAdminBypass(user.id)) {
      return res.status(403).json({ error: 'Admin bypass is not available for this user.' });
    }

    await upsertVoiceEnabledSetting(supabaseAdmin, user.id, true);
    return res.status(200).json({
      status: 'active',
      voice_enabled: true,
      bypass_mode: true
    });
  }

  const preapprovalId = String(body?.preapproval_id || '').trim();
  if (!preapprovalId) {
    return res.status(400).json({ error: 'Missing preapproval_id' });
  }

  const { response: mpResponse, data: mpData } = await fetchMpPreapproval(preapprovalId);
  if (!mpResponse.ok) {
    console.error('mp verify preapproval fetch failed', { preapproval_id: preapprovalId, status: mpResponse.status, body: mpData });
    return res.status(500).json({ error: mpData?.message || 'Mercado Pago preapproval fetch failed.' });
  }

  const status = String(mpData?.status || '').toLowerCase() || 'unknown';
  const mappedUserId = String(mpData?.external_reference || user.id || '').trim() || user.id;
  const voiceEnabled = status === 'active';

  await upsertMpPreapprovalStatus(supabaseAdmin, {
    preapprovalId,
    userId: mappedUserId,
    status
  });

  await upsertVoiceEnabledSetting(supabaseAdmin, mappedUserId, voiceEnabled);

  return res.status(200).json({ status, voice_enabled: voiceEnabled });
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

  if (!mpAccessToken) {
    return res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN.' });
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

  const mpPayload = {
    reason: 'Pacto Voz Triunfante',
    external_reference: String(user.id),
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 7000,
      currency_id: 'ARS'
    },
    back_url: 'https://21-moon.com/pacto-lunar-voz-triunfante.html?mp=success'
  };

  if (user.email) {
    mpPayload.payer_email = user.email;
  }

  const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mpAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(mpPayload)
  });

  const mpData = await parseMpResponseBody(mpResponse);
  if (!mpResponse.ok) {
    console.error('mp create subscription failed', {
      status: mpResponse.status,
      body: mpData
    });

    if (isPayerEqualsCollectorError({ status: mpResponse.status, mpData })) {
      return res.status(400).json({
        error_code: 'PAYER_EQUALS_COLLECTOR',
        user_message: 'No podés suscribirte con la misma cuenta de Mercado Pago que cobra. Abrí el link con otra cuenta (comprador) o usá un usuario de prueba.'
      });
    }

    return res.status(400).json({
      error: mpData?.message || mpData?.error || 'Mercado Pago preapproval creation failed.',
      details: mpData
    });
  }

  const preapprovalId = String(mpData?.id || '').trim();
  const status = mpData?.status || null;

  console.log('[MP preapproval created]', {
    id: preapprovalId || null,
    status,
    external_reference: mpData?.external_reference || String(user.id)
  });

  if (preapprovalId) {
    try {
      await upsertMpPreapprovalStatus(supabaseAdmin, {
        preapprovalId,
        userId: user.id,
        status
      });
    } catch (error) {
      console.error('mp create subscription failed to persist preapproval', {
        preapproval_id: preapprovalId,
        user_id: user.id,
        message: error?.message || String(error)
      });
    }
  }

  return res.status(200).json({
    init_point: mpData?.init_point || mpData?.sandbox_init_point || null,
    preapproval_id: preapprovalId || null,
    status
  });
}

async function yumikoHandler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Yumiko API está viva' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message, profile, messages: incomingMessages, summary, audio_mode: audioModeRaw, client_trace_id: clientTraceId } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Falta el campo 'message' en el cuerpo." });
    }

    const apiKey = process.env.DEEPSEEK_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta la variable de entorno DEEPSEEK_KEY.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
    }

    let auth;
    try {
      auth = await resolveOverlayOrSupabaseAuth(supabaseAdmin, req);
    } catch (authError) {
      console.warn('[yumiko][auth]', {
        ...buildTokenDebug(getBearerToken(req), authError?.tokenDebug?.tokenType || 'unknown'),
        user_id: authError?.user_id || null,
        device_id: authError?.device_id || null,
        status: authError?.errorCode || 'invalid_token'
      });
      return res.status(authError?.httpStatus || 401).json({ error: authError?.errorCode || 'invalid_token' });
    }

    const userId = auth.userId;

    console.info('[yumiko][save-path][backend] yumikoHandler auth resolved', {
      userId,
      tokenType: auth.tokenType,
      deviceId: auth.deviceId || null,
      messageLength: String(message || '').length,
      clientTraceId: clientTraceId || null
    });

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
    const sessionContext = {
      name: global.yumikoSession.name,
      meta: global.yumikoSession.meta,
      day: dia
    };

    let audioMode = audioModeRaw === true;

    let audioAllowed = false;
    if (audioMode) {
      try {
        const matchedSubscription = await getActiveVoiceSubscription(supabaseAdmin, userId);
        audioAllowed = Boolean(matchedSubscription);
      } catch (subErr) {
        return res.status(500).json({ error: subErr.message || 'Error validating voice subscription.' });
      }

      if (!audioAllowed) {
        return res.status(402).json({ error: 'subscription_required', plan: VOICE_PLAN });
      }
    }

    console.info('[yumiko][save-path][backend] persisting user message', {
      userId,
      sender: 'user',
      payload: {
        user_id: userId,
        sender: 'user',
        content: message,
        message_type: 'text'
      },
      clientTraceId: clientTraceId || null
    });
    const userInserted = await persistMessage(supabaseAdmin, {
      userId,
      sender: 'user',
      content: message,
      messageType: 'text'
    });
    console.info('[yumiko][save-path][backend] user message persisted', {
      userId,
      sender: 'user',
      insertedMessageId: userInserted?.id || null,
      insertedAt: userInserted?.created_at || null,
      clientTraceId: clientTraceId || null
    });

    const conversationContext = await buildYumikoConversationContext({ supabaseAdmin, userId, limit: 30 });
    const frontendContextMessages = Array.isArray(incomingMessages)
      ? incomingMessages
        .filter((msg) => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string')
        .slice(-10)
      : [];

    const modelMessages = conversationContext.modelMessages.length > 0
      ? conversationContext.modelMessages
      : frontendContextMessages;

    const messages = [
      ...buildYumikoSystemMessages({ mode: 'chat-reply', session: sessionContext, summary }),
      ...modelMessages,
      {
        role: 'system',
        content: `Contexto compartido: tema_activo=${conversationContext.activeTopic || 'ninguno'} | pregunta_abierta=${conversationContext.openLoopQuestion || 'ninguna'} | pista_continuidad=${conversationContext.continuityHint || 'ninguna'}`
      }
    ];

    if (!messages.some((msg) => msg.role === 'user')) {
      messages.push({ role: 'user', content: message });
    }

    console.info('[yumiko][chat-reply] generation start', {
      userId,
      modelMessageCount: messages.length,
      activeTopic: conversationContext.activeTopic || '',
      hasPendingQuestion: Boolean(conversationContext.hasPendingQuestion)
    });

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
    console.info('[yumiko][chat-reply] generation result', {
      userId,
      replyLength: String(reply).length,
      mode: 'chat-reply'
    });

    if (!audioMode) {
      console.info('[yumiko][save-path][backend] persisting assistant message', {
        userId,
        sender: 'yumiko',
        audioMode
      });
      const yumikoInserted = await persistMessage(supabaseAdmin, {
        userId,
        sender: 'yumiko',
        content: reply,
        messageType: 'text'
      });
      console.info('[yumiko][save-path][backend] assistant message persisted', {
        userId,
        sender: 'yumiko',
        insertedMessageId: yumikoInserted?.id || null,
        insertedAt: yumikoInserted?.created_at || null,
        clientTraceId: clientTraceId || null
      });

      console.info('[yumiko][auth]', {
        ...auth.tokenDebug,
        user_id: userId,
        device_id: auth.deviceId,
        status: 'ok'
      });

      return res.status(200).json({
        reply,
        user_message_id: userInserted?.id || null,
        yumiko_message_id: yumikoInserted?.id || null,
        audio_allowed: audioAllowed,
        token_type: auth.tokenType
      });
    }

    const elevenKey = process.env.ELEVENLABS_API_KEY;
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!elevenKey || !elevenVoiceId) {
      return res.status(500).json({ error: 'Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID.' });
    }
    const insertedMsg = await persistMessage(supabaseAdmin, {
      userId,
      sender: 'yumiko',
      content: reply,
      messageType: 'text'
    });
    console.info('[yumiko][save-path][backend] assistant message persisted', {
      userId,
      sender: 'yumiko',
      insertedMessageId: insertedMsg?.id || null,
      insertedAt: insertedMsg?.created_at || null,
      clientTraceId: clientTraceId || null
    });

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

    console.info('[yumiko][auth]', {
      ...auth.tokenDebug,
      user_id: userId,
      device_id: auth.deviceId,
      status: 'ok'
    });

    return res.status(200).json({
      reply,
      user_message_id: userInserted?.id || null,
      yumiko_message_id: yumikoMessageId,
      audio_out_signed_url: signedData?.signedUrl,
      audio_out_key: audioOutKey,
      tts_seconds: ttsSeconds,
      audio_allowed: audioAllowed,
      token_type: auth.tokenType
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

    let auth;
    try {
      auth = await resolveOverlayOrSupabaseAuth(supabaseAdmin, req);
    } catch (authError) {
      return res.status(authError?.httpStatus || 401).json({ error: authError?.errorCode || 'invalid_token' });
    }

    const userId = auth.userId;
    console.info('[yumiko][read-path][backend] reading public.messages', {
      userId,
      limit: 100,
      orderBy: 'created_at desc (then reversed in-memory)'
    });

    const { data: rows, error: messagesErr } = await supabaseAdmin
      .from('messages')
      .select('id,sender,content,created_at,message_type,audio_out_path,tts_seconds')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (messagesErr) {
      console.error('[yumiko][read-path][backend] read failed', {
        userId,
        error: messagesErr.message || String(messagesErr),
        code: messagesErr.code || null,
        details: messagesErr.details || null,
        hint: messagesErr.hint || null
      });
      return res.status(500).json({ error: messagesErr.message || 'Error reading messages.' });
    }

    const orderedRows = Array.isArray(rows) ? [...rows].reverse() : [];
    console.info('[yumiko][read-path][backend] read success', {
      userId,
      fetchedRows: Array.isArray(rows) ? rows.length : 0,
      returnedRows: orderedRows.length,
      newestCreatedAt: rows?.[0]?.created_at || null,
      oldestCreatedAt: rows?.[rows.length - 1]?.created_at || null
    });

    const messages = [];
    for (const row of orderedRows) {
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

    console.info('[yumiko][auth]', { ...auth.tokenDebug, user_id: userId, device_id: auth.deviceId, status: 'ok' });
    return res.status(200).json({ messages });
  } catch (e) {
    console.error('get-messages error:', e?.message || e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function setActiveSkinHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    let supabaseAdmin;
    try {
      supabaseAdmin = getSupabaseAdminClient();
    } catch (clientError) {
      return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
    }

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

    let auth;
    try {
      auth = await resolveOverlayOrSupabaseAuth(supabaseAdmin, req);
    } catch (authError) {
      return res.status(authError?.httpStatus || 401).json({ error: authError?.errorCode || 'invalid_token' });
    }

    const userId = auth.userId;
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

async function overlayLinkStartHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    let supabaseAdmin;
    try {
      supabaseAdmin = getSupabaseAdminClient();
    } catch (clientError) {
      return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
    }

    const token = getBearerToken(req);
    const user = await getAuthUserOrNull(supabaseAdmin, token);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const code = createOverlayCode();
    const expiresAt = new Date(Date.now() + OVERLAY_CODE_TTL_MS).toISOString();

    const { error } = await supabaseAdmin
      .from('overlay_links')
      .insert({
        code_hash: hashSecret(code),
        user_id: user.id,
        expires_at: expiresAt
      });

    if (error) return res.status(500).json({ error: error.message || 'Error creating overlay link.' });

    return res.status(200).json({
      deepLink: `yumiko://auth?code=${encodeURIComponent(code)}`
    });
  } catch (error) {
    console.error('overlay-link-start fatal:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function overlayLinkExchangeHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const envState = getSupabaseAdminEnvState();
    const missingEnv = [];
    if (!process.env.SUPABASE_URL) missingEnv.push('SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!process.env.OVERLAY_JWT_SECRET) missingEnv.push('OVERLAY_JWT_SECRET');

    const hasOverlayJwtSecret = Boolean(process.env.OVERLAY_JWT_SECRET);
    const isDebugRequest = getRequestUrl(req).searchParams.get('debug') === '1';
    const isOverlayDebugEnabled = process.env.OVERLAY_DEBUG === '1';

    if (isDebugRequest && isOverlayDebugEnabled) {
      logOverlayAuth(200, 'overlay_exchange_env_state', {
        supabaseHost: envState.supabaseUrlHost,
        hasServiceRoleKey: envState.hasServiceRoleKey,
        hasOverlayJwtSecret
      });
      return res.status(200).json({
        ok: true,
        debug: true,
        env_state: {
          supabase_url_host: envState.supabaseUrlHost,
          has_service_role_key: envState.hasServiceRoleKey,
          has_overlay_jwt_secret: hasOverlayJwtSecret
        }
      });
    }

    if (missingEnv.length > 0) {
      logOverlayAuth(500, 'token_issue_missing_env', {
        missing: missingEnv,
        supabaseHost: envState.supabaseUrlHost,
        hasServiceRoleKey: envState.hasServiceRoleKey,
        hasOverlayJwtSecret
      });
      return res.status(500).json({ ok: false, error: 'token_issue', missing: missingEnv });
    }

    let supabaseAdmin;
    try {
      supabaseAdmin = getSupabaseAdminClient();
    } catch (clientError) {
      const statusCode = clientError?.statusCode || 500;
      logOverlayAuth(statusCode, clientError?.message || 'supabase_admin_init_failed', {
        supabaseHost: envState.supabaseUrlHost,
        hasServiceRoleKey: envState.hasServiceRoleKey,
        hasOverlayJwtSecret
      });
      return res.status(statusCode).json({ error: clientError?.message || 'Supabase admin init failed.' });
    }

    const { error: schemaCheckError } = await runSupabaseOpWithSchemaReloadRetry({
      supabaseAdmin,
      operationName: 'overlay_refresh_tokens_schema_check',
      operation: () =>
        supabaseAdmin
          .from('overlay_refresh_tokens')
          .select('id')
          .limit(1)
    });

    if (schemaCheckError) {
      logOverlayAuth(500, 'overlay_schema_check_failed', {
        supabaseHost: envState.supabaseUrlHost,
        hasServiceRoleKey: envState.hasServiceRoleKey,
        hasOverlayJwtSecret,
        supabase: sanitizeSupabaseError(schemaCheckError)
      });
      return res.status(500).json({ error: 'Failed to verify overlay_refresh_tokens availability.' });
    }

    const body = await getJsonBody(req);
    const {
      code,
      deviceId: bodyDeviceId,
      deviceName: bodyDeviceName,
      device_id: legacyDeviceId,
      device_name: legacyDeviceName
    } = body || {};
    const deviceId = bodyDeviceId || legacyDeviceId || null;
    const deviceName = bodyDeviceName || legacyDeviceName || null;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const nowIso = new Date().toISOString();
    const codeHash = hashSecret(code);

    const { data: link, error: linkErr } = await runSupabaseOpWithSchemaReloadRetry({
      supabaseAdmin,
      operationName: 'overlay_links_select',
      operation: () =>
        supabaseAdmin
          .from('overlay_links')
          .select('id,user_id,expires_at,used_at')
          .eq('code_hash', codeHash)
          .is('used_at', null)
          .gt('expires_at', nowIso)
          .maybeSingle()
    });

    if (linkErr) {
      logOverlayAuth(500, linkErr.message || 'code_lookup_failed', {
        supabaseHost: envState.supabaseUrlHost,
        hasServiceRoleKey: envState.hasServiceRoleKey,
        hasOverlayJwtSecret,
        supabase: sanitizeSupabaseError(linkErr)
      });
      return res.status(500).json({ error: linkErr.message || 'Error validating code.' });
    }
    if (!link) {
      logOverlayAuth(400, 'invalid_code', {
        code_hash_prefix: String(codeHash).slice(0, 10)
      });
      return res.status(400).json({ ok: false, error: 'invalid_code' });
    }

    let tokens;
    try {
      tokens = await issueOverlayTokens({
        supabaseAdmin,
        userId: link.user_id,
        deviceId,
        deviceName
      });
    } catch (tokenError) {
      if (String(tokenError?.code) === '23505') {
        try {
          tokens = await issueOverlayTokens({
            supabaseAdmin,
            userId: link.user_id,
            deviceId,
            deviceName
          });
          logOverlayAuth(200, 'overlay exchange unique_violation_recovered', {
            user_id: link.user_id,
            device_id: deviceId,
            supabase: sanitizeSupabaseError(tokenError?.supabase)
          });
        } catch (retryError) {
          const retrySupabaseError = sanitizeSupabaseError(retryError?.supabase);
          logOverlayAuth(500, retryError?.message || 'token_issue_retry_failed', {
            supabaseHost: envState.supabaseUrlHost,
            hasServiceRoleKey: envState.hasServiceRoleKey,
            hasOverlayJwtSecret,
            supabase: retrySupabaseError
          });
          return res.status(500).json({
            ok: false,
            error: 'token_issue',
            supabase: retrySupabaseError
          });
        }
      } else {
        const supabaseError = sanitizeSupabaseError(tokenError?.supabase);
        logOverlayAuth(500, tokenError?.message || 'token_issue', {
          supabaseHost: envState.supabaseUrlHost,
          hasServiceRoleKey: envState.hasServiceRoleKey,
          hasOverlayJwtSecret,
          supabase: supabaseError
        });
        return res.status(500).json({
          ok: false,
          error: 'token_issue',
          supabase: supabaseError
        });
      }
    }

    const consumedAtIso = new Date().toISOString();
    const { error: consumeErr } = await runSupabaseOpWithSchemaReloadRetry({
      supabaseAdmin,
      operationName: 'overlay_links_consume',
      operation: () =>
        supabaseAdmin
          .from('overlay_links')
          .update({ used_at: consumedAtIso, device_id: deviceId, device_name: deviceName })
          .eq('id', link.id)
          .is('used_at', null)
          .gt('expires_at', consumedAtIso)
    });

    if (consumeErr) {
      logOverlayAuth(400, 'invalid_code_consume_conflict', {
        userId: link.user_id,
        device_id: deviceId
      });
      return res.status(400).json({ ok: false, error: 'invalid_code' });
    }

    const accessToken = tokens.overlay_access_token;
    const refreshToken = tokens.overlay_refresh_token || null;

    logOverlayAuth(200, 'overlay exchange success', {
      user_id: link.user_id,
      device_id: deviceId,
      access_token_preview: accessToken ? `${accessToken.slice(0, 12)}...` : null,
      refresh_token_preview: refreshToken ? `${refreshToken.slice(0, 8)}...` : null
    });

    return res.status(200).json({
      ok: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: OVERLAY_ACCESS_TTL_SECONDS,
      user_id: link.user_id,
      device_id: deviceId || null
    });
  } catch (error) {
    logOverlayAuth(500, error?.message || 'overlay-link-exchange fatal', {
      supabase: sanitizeSupabaseError(error?.supabase)
    });
    return res.status(500).json({ error: 'Internal error' });
  }
}


async function overlayTokenRefreshHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    let supabaseAdmin;
    try {
      supabaseAdmin = getSupabaseAdminClient();
    } catch (clientError) {
      return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
    }

    const { refresh_token: refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Missing refresh_token' });

    const nowIso = new Date().toISOString();
    const tokenHash = hashSecret(refreshToken);

    const { data: stored, error: tokenErr } = await supabaseAdmin
      .from('overlay_refresh_tokens')
      .select('id,user_id,device_id,device_name,expires_at,revoked_at')
      .eq('refresh_token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr) return res.status(500).json({ error: tokenErr.message || 'Error checking refresh token.' });
    if (!stored || stored.revoked_at) return res.status(401).json({ error: 'Invalid refresh token' });
    if (new Date(stored.expires_at).getTime() <= Date.now()) return res.status(401).json({ error: 'Refresh token expired' });

    const accessToken = signOverlayJwt({ sub: stored.user_id, device_id: stored.device_id || null }, OVERLAY_ACCESS_TTL_SECONDS);

    return res.status(200).json({
      overlay_access_token: accessToken,
      access_token: accessToken,
      expires_in: OVERLAY_ACCESS_TTL_SECONDS,
      expires_at: new Date(Date.now() + OVERLAY_ACCESS_TTL_SECONDS * 1000).toISOString(),
      refreshed_at: nowIso,
      user_id: stored.user_id,
      device_id: stored.device_id || null
    });
  } catch (error) {
    console.error('overlay-token-refresh fatal:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function overlayRevokeDeviceHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    let supabaseAdmin;
    try {
      supabaseAdmin = getSupabaseAdminClient();
    } catch (clientError) {
      return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
    }

    const token = getBearerToken(req);
    const user = await getAuthUserOrNull(supabaseAdmin, token);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const { device_id: deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'Missing device_id' });

    const revokedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('overlay_refresh_tokens')
      .update({ revoked_at: revokedAt })
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
      .is('revoked_at', null);

    if (error) return res.status(500).json({ error: error.message || 'Error revoking device.' });

    return res.status(200).json({ ok: true, revoked_at: revokedAt });
  } catch (error) {
    console.error('overlay-revoke-device fatal:', error);
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



async function overlayNudgeSettingsHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
    }

    let auth;
    try {
      auth = await resolveOverlayOrSupabaseAuth(supabaseAdmin, req);
    } catch (authError) {
      return res.status(authError?.httpStatus || 401).json({ error: authError?.errorCode || 'invalid_token' });
    }

    const userId = auth.userId;
    const deviceId = auth.deviceId || 'default';
    const enabled = Boolean(req.body?.enabled);
    const requestedInterval = Number(req.body?.interval_minutes);
    const intervalMinutes = OVERLAY_NUDGE_INTERVAL_OPTIONS.includes(requestedInterval) ? requestedInterval : 20;

    const { error: upsertErr } = await supabaseAdmin
      .from('overlay_nudge_settings')
      .upsert({
        user_id: userId,
        device_id: deviceId,
        enabled,
        interval_minutes: intervalMinutes
      }, { onConflict: 'user_id,device_id' });

    if (upsertErr) return res.status(500).json({ error: upsertErr.message || 'Error updating overlay nudge settings.' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('overlay-nudge-settings fatal:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function overlayNudgeHandler(req, res) {
  let failedAt = 'overlayNudgeHandler:start';
  try {
    failedAt = 'overlayNudgeHandler:validateMethod';
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    failedAt = 'overlayNudgeHandler:getSupabaseAdmin';
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
    }

    let auth;
    try {
      failedAt = 'resolveOverlayOrSupabaseAuth';
      auth = await resolveOverlayOrSupabaseAuth(supabaseAdmin, req);
    } catch (authError) {
      return res.status(authError?.httpStatus || 401).json({ error: authError?.errorCode || 'invalid_token' });
    }

    const userId = auth.userId;
    const deviceId = auth.deviceId || 'default';
    const requestedInterval = Number(req.body?.interval_minutes);
    const intervalMinutes = OVERLAY_NUDGE_INTERVAL_OPTIONS.includes(requestedInterval) ? requestedInterval : 20;

    failedAt = 'overlayNudgeSettings:read';
    const { data: settingsRow, error: settingsErr } = await supabaseAdmin
      .from('overlay_nudge_settings')
      .select('enabled,interval_minutes,last_sent_at,last_nudge_bucket,last_nudge_message')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .maybeSingle();

    if (settingsErr) return res.status(500).json({ error: settingsErr.message || 'Error reading overlay nudge settings.' });

    const enabled = settingsRow?.enabled ?? true;
    const persistedInterval = Number(settingsRow?.interval_minutes);
    const effectiveInterval = OVERLAY_NUDGE_INTERVAL_OPTIONS.includes(persistedInterval) ? persistedInterval : intervalMinutes;

    const now = Date.now();
    const lastSentAtMs = settingsRow?.last_sent_at ? Date.parse(settingsRow.last_sent_at) : 0;
    const elapsedMs = Number.isFinite(lastSentAtMs) ? now - lastSentAtMs : Number.MAX_SAFE_INTEGER;
    const shouldSend = enabled && elapsedMs >= effectiveInterval * 60 * 1000;

    const upsertPayload = {
      user_id: userId,
      device_id: deviceId,
      enabled,
      interval_minutes: intervalMinutes
    };

    console.info('[yumiko][auto-nudge] request:start', {
      userId,
      deviceId,
      enabled,
      requestedInterval,
      intervalMinutes,
      effectiveInterval,
      now: new Date(now).toISOString(),
      lastSentAt: settingsRow?.last_sent_at || null,
      elapsedMs
    });

    if (!shouldSend) {
      const skipReason = !enabled ? 'disabled' : 'interval-not-elapsed';
      console.info('[yumiko][auto-nudge] skipped reason=' + skipReason, {
        enabled,
        elapsedMs,
        requiredMs: effectiveInterval * 60 * 1000,
        effectiveInterval
      });
      await supabaseAdmin
        .from('overlay_nudge_settings')
        .upsert(upsertPayload, { onConflict: 'user_id,device_id' });
      return res.status(200).json({ message: null });
    }

    const sessionContext = {
      name: global.yumikoSession.name,
      meta: global.yumikoSession.meta,
      day: calcularDia(global.yumikoSession.challengeStart)
    };

    failedAt = 'buildYumikoConversationContext';
    const conversationContext = await buildYumikoConversationContext({ supabaseAdmin, userId, limit: 30 });

    console.info('[yumiko][auto-nudge] previous last_nudge_bucket=' + String(settingsRow?.last_nudge_bucket || ''));
    console.info('[yumiko][auto-nudge] previous last_nudge_message=' + String(settingsRow?.last_nudge_message || ''));

    failedAt = 'generateAutoNudge';
    const message = await generateAutoNudge({
      apiKey: process.env.DEEPSEEK_KEY,
      context: conversationContext,
      session: sessionContext,
      summary: '',
      lastMessage: String(settingsRow?.last_nudge_message || '').trim()
    });

    const bucket = conversationContext.activeTopic ? 'context-shared-topic' : 'context-generic';

    failedAt = 'persistMessage';
    const insertedMessage = await persistMessage(supabaseAdmin, {
      userId,
      sender: 'yumiko',
      content: message,
      messageType: 'text'
    });

    failedAt = 'overlayNudgeSettings:upsert';
    const { error: upsertErr } = await supabaseAdmin
      .from('overlay_nudge_settings')
      .upsert({
        ...upsertPayload,
        last_sent_at: new Date(now).toISOString(),
        last_nudge_bucket: bucket,
        last_nudge_message: message
      }, { onConflict: 'user_id,device_id' });

    if (upsertErr) return res.status(500).json({ error: upsertErr.message || 'Error updating overlay nudge settings.' });

    console.info('[yumiko][auto-nudge] result', {
      sent: true,
      bucket,
      message,
      effectiveInterval
    });

    return res.status(200).json({
      message,
      message_id: insertedMessage?.id || null,
      created_at: insertedMessage?.created_at || null
    });
  } catch (error) {
    console.error('[yumiko][overlay-nudge] fatal', {
      failedAt,
      message: error?.message || String(error),
      stack: error?.stack || null,
      errorName: error?.name || null
    });
    return res.status(500).json({ error: 'Internal error' });
  }
}


function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (['XX', 'ZZ', 'T1'].includes(code)) return null;
  return code;
}

function resolveRequestCountryCode(req) {
  const candidates = [
    req.headers['x-vercel-ip-country'],
    req.headers['cf-ipcountry'],
    req.headers['cloudfront-viewer-country'],
    req.headers['x-country-code'],
    req.headers['x-country']
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCountryCode(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function resolveDirectCheckoutTarget(req) {
  const countryCode = resolveRequestCountryCode(req);
  const recommendedProvider = countryCode === 'AR' ? 'mercadopago' : 'paypal';
  const alternativeProvider = recommendedProvider === 'mercadopago' ? 'paypal' : 'mercadopago';
  const paymentUrls = {
    mercadopago: DIRECT_CHECKOUT_MP_URL,
    paypal: DIRECT_CHECKOUT_PAYPAL_URL
  };

  return {
    countryCode,
    recommendedProvider,
    alternativeProvider,
    paymentUrls,
    paymentProvider: recommendedProvider,
    paymentUrl: paymentUrls[recommendedProvider]
  };
}

async function saveDirectCheckoutLead(supabaseAdmin, { email, countryCode, paymentProvider, paymentUrl }) {
  const payload = {
    email,
    country_code: countryCode,
    payment_provider: paymentProvider,
    payment_url: paymentUrl,
    source: DIRECT_CHECKOUT_SOURCE
  };

  const { error, status, statusText } = await supabaseAdmin
    .from('checkout_leads')
    .upsert(payload, { onConflict: 'email' });

  if (error) {
    console.error('checkout-leads upsert failed:', {
      message: error.message || 'unknown_error',
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null,
      payload
    });

    const wrappedError = new Error(error.message || 'Error saving checkout lead.');
    wrappedError.cause = error;
    throw wrappedError;
  }

  const result = {
    email,
    country_code: countryCode,
    payment_provider: paymentProvider,
    payment_url: paymentUrl,
    source: DIRECT_CHECKOUT_SOURCE,
    upsert_status: status || null,
    upsert_status_text: statusText || null
  };

  console.info('checkout-leads upsert succeeded:', result);
  return result;
}

function sanitizeArrivalRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    account_enabled: row.status === 'account_enabled' || row.status === 'active' || Boolean(row.account_enabled_at)
  };
}

function isArrivalApprovedStatus(status) {
  return ['approved', 'invited', 'account_enabled', 'active'].includes(String(status || '').trim().toLowerCase());
}

function normalizeArrivalEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeOptionalText(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function sanitizeArrivalAdminRow(row, req) {
  if (!row) return null;

  const origin = String(req.headers.origin || '').trim() || 'https://21-moon.com';
  const inviteUrl = new URL('/invitation.html', origin);
  inviteUrl.searchParams.set('token', row.invite_token);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    desired_experience: row.desired_experience,
    desired_moments: row.desired_moments,
    optional_note: row.optional_note,
    internal_note: row.internal_note || null,
    status: row.status,
    invite_token: row.invite_token,
    invite_url: inviteUrl.toString(),
    approved_at: row.approved_at,
    invited_at: row.invited_at,
    account_enabled_at: row.account_enabled_at,
    auth_user_id: row.auth_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeArrivalAdminStatus(status) {
  return String(status || '').trim().toLowerCase();
}

async function findArrivalRequestByEmail(supabaseAdmin, email) {
  const { data, error } = await supabaseAdmin
    .from('arrival_requests')
    .select('id,name,email,status,invite_token,approved_at,invited_at,account_enabled_at,auth_user_id')
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Error reading arrival_requests by email.');
  }

  return data || null;
}

async function findArrivalRequestByToken(supabaseAdmin, token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  const { data, error } = await supabaseAdmin
    .from('arrival_requests')
    .select('id,name,email,status,invite_token,approved_at,invited_at,account_enabled_at,auth_user_id')
    .ilike('invite_token', normalizedToken)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Error reading arrival_requests by token.');
  }

  return data || null;
}

async function arrivalRequestHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch (clientError) {
    return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
  }

  try {
    const source = String(req.body?.source || '').trim();
    const name = String(req.body?.name || '').trim().slice(0, 24);
    const email = normalizeArrivalEmail(req.body?.email || '');
    const directCheckoutBranch = source === DIRECT_CHECKOUT_SOURCE;
    const { supabaseUrlHost } = getSupabaseAdminEnvState();

    console.info('arrival-request input:', {
      source,
      directCheckoutBranch,
      supabaseHost: supabaseUrlHost
    });

    if (directCheckoutBranch) {
      console.info('arrival-request direct checkout branch entered:', {
        source,
        supabaseHost: supabaseUrlHost
      });

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'invalid_email', error_description: 'Necesito un email válido para abrir tu acceso.' });
      }

      const {
        countryCode,
        recommendedProvider,
        alternativeProvider,
        paymentUrls,
        paymentProvider,
        paymentUrl
      } = resolveDirectCheckoutTarget(req);
      let savedDirectCheckoutLead;
      try {
        savedDirectCheckoutLead = await saveDirectCheckoutLead(supabaseAdmin, {
          email,
          countryCode,
          paymentProvider,
          paymentUrl
        });
      } catch (error) {
        console.error('arrival-request direct checkout save failed:', {
          source,
          directCheckoutBranch,
          supabaseHost: supabaseUrlHost,
          message: error?.message || 'unknown_error',
          code: error?.cause?.code || null,
          details: error?.cause?.details || null,
          hint: error?.cause?.hint || null,
          email
        });
        throw error;
      }

      console.info('arrival-request saveDirectCheckoutLead result:', savedDirectCheckoutLead);
      console.info('arrival-request direct checkout returning success:', {
        email,
        payment_url: paymentUrl,
        payment_provider: paymentProvider,
        country_code: countryCode
      });

      return res.status(200).json({
        ok: true,
        success: true,
        email,
        country_code: countryCode,
        recommended_provider: recommendedProvider,
        alternative_provider: alternativeProvider,
        payment_provider: paymentProvider,
        payment_url: paymentUrl,
        payment_urls: paymentUrls
      });
    }

    const desiredExperience = String(req.body?.desired_experience || '').trim().slice(0, 280);
    const desiredMoments = String(req.body?.desired_moments || '').trim().slice(0, 280);
    const optionalNote = normalizeOptionalText(req.body?.optional_note, 420);

    if (name.length < 2) {
      return res.status(400).json({ error: 'missing_name', error_description: 'Decime tu nombre para poder recibir tu llegada.' });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'invalid_email', error_description: 'Necesito un email válido para poder escribirte si tu llegada es aprobada.' });
    }

    if (!desiredExperience) {
      return res.status(400).json({ error: 'missing_desired_experience', error_description: 'Contame qué te gustaría encontrar en Yumiko.' });
    }

    if (!desiredMoments) {
      return res.status(400).json({ error: 'missing_desired_moments', error_description: 'Contame en qué momentos te gustaría sentir su presencia.' });
    }

    const existing = await findArrivalRequestByEmail(supabaseAdmin, email);
    const nextStatus = existing && isArrivalApprovedStatus(existing.status) ? existing.status : 'requested';
    const updatePayload = {
      name,
      email,
      desired_experience: desiredExperience,
      desired_moments: desiredMoments,
      optional_note: optionalNote,
      status: nextStatus
    };

    const shouldNotifyAdmin = shouldSendArrivalAdminNotification(existing);
    let saved;
    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from('arrival_requests')
        .update(updatePayload)
        .eq('id', existing.id)
        .select('id,name,email,status,invite_token,approved_at,invited_at,account_enabled_at,auth_user_id')
        .single();

      if (error) {
        return res.status(500).json({ error: error.message || 'Error updating arrival request.' });
      }
      saved = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('arrival_requests')
        .insert({
          ...updatePayload,
          status: 'requested'
        })
        .select('id,name,email,status,invite_token,approved_at,invited_at,account_enabled_at,auth_user_id')
        .single();

      if (error) {
        return res.status(500).json({ error: error.message || 'Error saving arrival request.' });
      }
      saved = data;
    }

    if (shouldNotifyAdmin && saved?.id) {
      sendArrivalAdminNotification({
        arrivalRequest: {
          id: saved.id,
          name,
          email,
          desired_experience: desiredExperience,
          desired_moments: desiredMoments,
          optional_note: optionalNote,
          status: saved.status || 'requested'
        },
        req
      }).catch((notificationError) => {
        console.error('arrival-request notification failed:', {
          message: notificationError?.message || 'unknown_error',
          status: notificationError?.status || null,
          responseData: notificationError?.responseData || null,
          arrivalRequestId: saved.id,
          email
        });
      });
    }

    return res.status(200).json({
      ok: true,
      request: sanitizeArrivalRequest(saved)
    });
  } catch (error) {
    console.error('arrival-request fatal:', {
      message: error?.message || 'unknown_error',
      code: error?.cause?.code || null,
      details: error?.cause?.details || null,
      hint: error?.cause?.hint || null,
      stack: error?.stack || null
    });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function findArrivalRequestByManualAccess(supabaseAdmin, { email, code }) {
  const normalizedEmail = normalizeArrivalEmail(email);
  const normalizedCode = String(code || '').trim();
  if (!normalizedEmail || !normalizedCode) return null;

  const requestRow = await findArrivalRequestByToken(supabaseAdmin, normalizedCode);
  if (!requestRow) return null;

  if (normalizeArrivalEmail(requestRow.email) !== normalizedEmail) {
    return null;
  }

  return requestRow;
}

async function arrivalInviteHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch (clientError) {
    return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
  }

  try {
    const requestUrl = getRequestUrl(req);
    const token = String(req.query?.token || requestUrl.searchParams.get('token') || '').trim();
    const email = normalizeArrivalEmail(req.query?.email || requestUrl.searchParams.get('email') || '');
    const code = String(req.query?.code || requestUrl.searchParams.get('code') || '').trim();

    if (!token && (!email || !code)) {
      return res.status(400).json({ error: 'missing_invite_access' });
    }

    const requestRow = token
      ? await findArrivalRequestByToken(supabaseAdmin, token)
      : await findArrivalRequestByManualAccess(supabaseAdmin, { email, code });

    if (!requestRow || !isArrivalApprovedStatus(requestRow.status)) {
      return res.status(404).json({ error: 'invite_not_found' });
    }

    return res.status(200).json({
      ok: true,
      ...sanitizeArrivalRequest(requestRow)
    });
  } catch (error) {
    console.error('arrival-invite fatal:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function arrivalCompleteHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch (clientError) {
    return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
  }

  try {
    const token = String(req.body?.token || '').trim();
    const email = normalizeArrivalEmail(req.body?.email || '');
    const password = String(req.body?.password || '');

    if (!token) {
      return res.status(400).json({ error: 'missing_token', error_description: 'Hace falta una invitación privada válida.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'weak_password', error_description: 'Tu contraseña debe tener al menos 8 caracteres.' });
    }

    const requestRow = await findArrivalRequestByToken(supabaseAdmin, token);
    if (!requestRow || !isArrivalApprovedStatus(requestRow.status)) {
      return res.status(404).json({ error: 'invite_not_found', error_description: 'No pude reconocer esta invitación privada.' });
    }

    if (email && email !== normalizeArrivalEmail(requestRow.email)) {
      return res.status(400).json({ error: 'email_mismatch', error_description: 'Esta invitación fue preparada para otro email reservado.' });
    }

    if (requestRow.auth_user_id || requestRow.status === 'account_enabled' || requestRow.status === 'active') {
      return res.status(409).json({ error: 'account_already_enabled', error_description: 'Esta llegada ya fue habilitada.' });
    }

    const createdUser = await supabaseAdmin.auth.admin.createUser({
      email: requestRow.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: requestRow.name,
        arrival_request_id: requestRow.id
      }
    });

    if (createdUser.error || !createdUser.data?.user?.id) {
      return res.status(500).json({
        error: 'account_creation_failed',
        error_description: createdUser.error?.message || 'No pude habilitar este acceso.'
      });
    }

    const enabledAt = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from('arrival_requests')
      .update({
        auth_user_id: createdUser.data.user.id,
        status: 'account_enabled',
        account_enabled_at: enabledAt,
        invited_at: requestRow.status === 'approved' ? enabledAt : requestRow.invited_at || enabledAt,
        approved_at: requestRow.approved_at || enabledAt
      })
      .eq('id', requestRow.id);

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message || 'Error updating arrival request status.' });
    }

    return res.status(200).json({
      ok: true,
      user_id: createdUser.data.user.id,
      email: requestRow.email,
      status: 'account_enabled'
    });
  } catch (error) {
    console.error('arrival-complete fatal:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function arrivalAdminListHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch (clientError) {
    return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
  }

  try {
    const auth = await requireArrivalAdminAccess(supabaseAdmin, req);
    const requestUrl = getRequestUrl(req);
    const status = normalizeArrivalAdminStatus(req.query?.status || requestUrl.searchParams.get('status') || '');
    const search = String(req.query?.search || requestUrl.searchParams.get('search') || '').trim();

    let query = supabaseAdmin
      .from('arrival_requests')
      .select(ARRIVAL_ADMIN_SELECT)
      .order('created_at', { ascending: false })
      .limit(200);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      const escapedSearch = search.replace(/[%_,]/g, ' ');
      query = query.or(`name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%`);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message || 'Error loading arrival requests.' });
    }

    return res.status(200).json({
      ok: true,
      admin_user_id: auth.userId,
      requests: Array.isArray(data) ? data.map((row) => sanitizeArrivalAdminRow(row, req)) : []
    });
  } catch (error) {
    const status = error?.httpStatus || 500;
    if (status === 401 || status === 403) {
      return res.status(status).json({ error: error?.errorCode || error?.message || 'arrival_admin_forbidden' });
    }
    console.error('arrival-admin-list fatal:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function arrivalAdminDetailHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch (clientError) {
    return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
  }

  try {
    await requireArrivalAdminAccess(supabaseAdmin, req);
    const requestUrl = getRequestUrl(req);
    const id = String(req.query?.id || requestUrl.searchParams.get('id') || '').trim();

    if (!id) {
      return res.status(400).json({ error: 'missing_arrival_request_id' });
    }

    const { data, error } = await supabaseAdmin
      .from('arrival_requests')
      .select(ARRIVAL_ADMIN_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message || 'Error loading arrival request.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'arrival_request_not_found' });
    }

    return res.status(200).json({
      ok: true,
      request: sanitizeArrivalAdminRow(data, req)
    });
  } catch (error) {
    const status = error?.httpStatus || 500;
    if (status === 401 || status === 403) {
      return res.status(status).json({ error: error?.errorCode || error?.message || 'arrival_admin_forbidden' });
    }
    console.error('arrival-admin-detail fatal:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function arrivalAdminUpdateHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch (clientError) {
    return res.status(clientError?.statusCode || 500).json({ error: clientError?.message || 'Supabase admin init failed.' });
  }

  try {
    await requireArrivalAdminAccess(supabaseAdmin, req);

    const id = String(req.body?.id || '').trim();
    const nextStatus = normalizeArrivalAdminStatus(req.body?.status || '');
    const internalNote = req.body?.internal_note === undefined
      ? undefined
      : normalizeOptionalText(req.body?.internal_note, 600);

    if (!id) {
      return res.status(400).json({ error: 'missing_arrival_request_id' });
    }

    if (!nextStatus && internalNote === undefined) {
      return res.status(400).json({ error: 'missing_arrival_admin_update' });
    }

    if (nextStatus && !ARRIVAL_ADMIN_MUTABLE_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: 'invalid_arrival_status' });
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('arrival_requests')
      .select(ARRIVAL_ADMIN_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (existingErr) {
      return res.status(500).json({ error: existingErr.message || 'Error reading arrival request.' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'arrival_request_not_found' });
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {};

    if (nextStatus) {
      updatePayload.status = nextStatus;

      if (nextStatus === 'approved') {
        updatePayload.approved_at = existing.approved_at || nowIso;
      }

      if (nextStatus === 'invited') {
        updatePayload.approved_at = existing.approved_at || nowIso;
        updatePayload.invited_at = existing.invited_at || nowIso;
      }

      if (nextStatus === 'account_enabled') {
        updatePayload.approved_at = existing.approved_at || nowIso;
        updatePayload.invited_at = existing.invited_at || nowIso;
        updatePayload.account_enabled_at = existing.account_enabled_at || nowIso;
      }
    }

    if (internalNote !== undefined) {
      updatePayload.internal_note = internalNote;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('arrival_requests')
      .update(updatePayload)
      .eq('id', id)
      .select(ARRIVAL_ADMIN_SELECT)
      .single();

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message || 'Error updating arrival request.' });
    }

    return res.status(200).json({
      ok: true,
      request: sanitizeArrivalAdminRow(updated, req)
    });
  } catch (error) {
    const status = error?.httpStatus || 500;
    if (status === 401 || status === 403) {
      return res.status(status).json({ error: error?.errorCode || error?.message || 'arrival_admin_forbidden' });
    }
    console.error('arrival-admin-update fatal:', error);
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
      case 'overlay-link-start':
        req.body = await getJsonBody(req);
        return overlayLinkStartHandler(req, res);
      case 'overlay-link-exchange':
        req.body = await getJsonBody(req);
        return overlayLinkExchangeHandler(req, res);
      case 'overlay-token-refresh':
      case 'overlay-link-refresh':
        req.body = await getJsonBody(req);
        return overlayTokenRefreshHandler(req, res);
      case 'overlay-revoke-device':
        req.body = await getJsonBody(req);
        return overlayRevokeDeviceHandler(req, res);
      case 'overlay-nudge':
        req.body = await getJsonBody(req);
        return overlayNudgeHandler(req, res);
      case 'overlay-nudge-settings':
        req.body = await getJsonBody(req);
        return overlayNudgeSettingsHandler(req, res);
      case 'arrival-request':
        req.body = await getJsonBody(req);
        return arrivalRequestHandler(req, res);
      case 'arrival-invite':
        return arrivalInviteHandler(req, res);
      case 'arrival-complete':
        req.body = await getJsonBody(req);
        return arrivalCompleteHandler(req, res);
      case 'arrival-admin-list':
        return arrivalAdminListHandler(req, res);
      case 'arrival-admin-detail':
        return arrivalAdminDetailHandler(req, res);
      case 'arrival-admin-update':
        req.body = await getJsonBody(req);
        return arrivalAdminUpdateHandler(req, res);
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
      case 'mp-verify':
        req.body = await getJsonBody(req);
        return mpVerifyHandler(req, res);
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
