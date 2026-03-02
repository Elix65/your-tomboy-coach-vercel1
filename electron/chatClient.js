const CHAT_TIMEOUT_MS = 12000;

function normalizeBaseUrl(baseUrl) {
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  return raw.replace(/\/$/, '');
}

function withTimeout(signalTimeoutMs, requestFn) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), signalTimeoutMs);

  return requestFn(controller.signal)
    .finally(() => clearTimeout(timeout));
}

function buildHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchHistory({ baseUrl, token, conversationId, limit = 50 }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const historyUrl = new URL(`${normalizedBaseUrl}/api/yumiko/history`);
  if (conversationId) historyUrl.searchParams.set('conversationId', conversationId);
  historyUrl.searchParams.set('limit', String(limit));

  console.info('[yumiko][chatClient] GET history', {
    url: historyUrl.toString(),
    hasToken: Boolean(token),
    conversationId: conversationId || null,
    limit
  });

  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(historyUrl, {
    method: 'GET',
    headers: buildHeaders(token),
    signal
  }));

  if (!response.ok) {
    throw new Error(`History request failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  return {
    conversationId: data?.conversationId || conversationId || null,
    messages: Array.isArray(data?.messages) ? data.messages : []
  };
}

async function sendMessage({ baseUrl, token, conversationId, message }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const sendUrl = `${normalizedBaseUrl}/api/yumiko/send`;

  console.info('[yumiko][chatClient] POST send', {
    url: sendUrl,
    hasToken: Boolean(token),
    conversationId: conversationId || null,
    messageLength: typeof message === 'string' ? message.length : 0
  });

  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(sendUrl, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ conversationId, message }),
    signal
  }));

  if (!response.ok) {
    throw new Error(`Send request failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  return {
    conversationId: data?.conversationId || conversationId || null,
    reply: data?.reply,
    messages: Array.isArray(data?.messages) ? data.messages : undefined
  };
}

module.exports = {
  fetchHistory,
  sendMessage
};
