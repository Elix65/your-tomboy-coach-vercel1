const CHAT_TIMEOUT_MS = 12000;

function normalizeBaseUrl(baseUrl) {
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  return raw.replace(/\/$/, '');
}

function normalizeToken(token) {
  let normalized = typeof token === 'string' ? token.trim() : '';
  while ((normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function isJwtLike(token) {
  return typeof token === 'string' && token.split('.').length === 3;
}

function assertToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) {
    const error = new Error('No conectado. Abrí Settings > Vincular');
    error.code = 'AUTH_MISSING';
    throw error;
  }
  if (!isJwtLike(normalized)) {
    const error = new Error('AUTH_INVALID: access token format');
    error.code = 'AUTH_INVALID';
    throw error;
  }
  return normalized;
}

function withTimeout(signalTimeoutMs, requestFn) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), signalTimeoutMs);
  return requestFn(controller.signal).finally(() => clearTimeout(timeout));
}

function buildApiHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

async function parseJsonResponse(response, fallback = {}) {
  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

function buildHttpError({ response, requestUrl, responseBody }) {
  const bodyText = typeof responseBody === 'string' ? responseBody.trim() : '';
  const bodyPreview = bodyText ? bodyText.slice(0, 500) : '<empty>';

  console.error('[yumiko][chat] upstream request failed', {
    status: response.status,
    statusText: response.statusText,
    url: requestUrl || response.url,
    bodyPreview
  });

  const error = new Error(`HTTP ${response.status}: ${bodyText || response.statusText || 'Unknown error'}`);
  error.status = response.status;
  error.responseBody = bodyText;
  error.url = requestUrl || response.url;
  if (response.status === 401) {
    error.code = bodyText.includes('auth_missing') ? 'AUTH_MISSING' : 'AUTH_INVALID';
  }
  return error;
}

async function fetchHistory({ baseUrl, overlayAccessToken }) {
  const token = assertToken(overlayAccessToken);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const historyUrl = `${normalizedBaseUrl}/api/get-messages`;

  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(historyUrl, {
    method: 'GET',
    headers: buildApiHeaders(token),
    signal
  }));

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw buildHttpError({ response, requestUrl: historyUrl, responseBody });
  }

  const data = await parseJsonResponse(response, {});
  const messages = Array.isArray(data?.messages)
    ? data.messages
    : Array.isArray(data)
      ? data
      : [];

  return { messages };
}

async function sendMessage({ baseUrl, overlayAccessToken, message, contextMessages = [] }) {
  const token = assertToken(overlayAccessToken);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const sendUrl = `${normalizedBaseUrl}/api/yumiko`;

  const requestBody = {
    message,
    audio_mode: false,
    summary: '',
    messages: Array.isArray(contextMessages)
      ? contextMessages.filter((item) => item && typeof item.role === 'string' && typeof item.content === 'string')
      : []
  };

  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(sendUrl, {
    method: 'POST',
    headers: buildApiHeaders(token),
    body: JSON.stringify(requestBody),
    signal
  }));

  if (!response.ok) {
    const responseBody = await response.text();
    throw buildHttpError({ response, requestUrl: sendUrl, responseBody });
  }

  const data = await parseJsonResponse(response, {});
  const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';

  return {
    reply,
    yumikoMessageId: data?.yumiko_message_id || null,
    audioOutSignedUrl: data?.audio_out_signed_url || null
  };
}



async function updateNudgeSettings({ baseUrl, overlayAccessToken, enabled, intervalMinutes }) {
  const token = assertToken(overlayAccessToken);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const settingsUrl = `${normalizedBaseUrl}/api/overlay/nudge-settings`;

  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(settingsUrl, {
    method: 'POST',
    headers: buildApiHeaders(token),
    body: JSON.stringify({ enabled, interval_minutes: intervalMinutes }),
    signal
  }));

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw buildHttpError({ response, requestUrl: settingsUrl, responseBody });
  }

  return parseJsonResponse(response, {});
}

async function requestNudge({ baseUrl, overlayAccessToken, intervalMinutes }) {
  const token = assertToken(overlayAccessToken);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const nudgeUrl = `${normalizedBaseUrl}/api/overlay/nudge`;

  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(nudgeUrl, {
    method: 'POST',
    headers: buildApiHeaders(token),
    body: JSON.stringify({ interval_minutes: intervalMinutes }),
    signal
  }));

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw buildHttpError({ response, requestUrl: nudgeUrl, responseBody });
  }

  const data = await parseJsonResponse(response, {});
  return {
    message: typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : null,
    messageId: data?.message_id == null ? null : String(data.message_id),
    createdAt: typeof data?.created_at === 'string' ? data.created_at : null
  };
}

module.exports = {
  fetchHistory,
  sendMessage,
  requestNudge,
  updateNudgeSettings,
  normalizeToken
};
