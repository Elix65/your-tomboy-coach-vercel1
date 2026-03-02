const CHAT_TIMEOUT_MS = 12000;
const DEFAULT_SUPABASE_URL = 'https://rlunygzxvpldfaanhxnj.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_LcfKHbQf88gNcxQkdEvEaA_Ll_twyUd';

function normalizeBaseUrl(baseUrl) {
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  return raw.replace(/\/$/, '');
}

function withTimeout(signalTimeoutMs, requestFn) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), signalTimeoutMs);
  return requestFn(controller.signal).finally(() => clearTimeout(timeout));
}

function assertToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    const error = new Error('No hay token. Conectá overlay con yumiko://auth?token=... o agregalo en Settings.');
    error.code = 'AUTH_MISSING';
    throw error;
  }
}

function buildApiHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

function resolveSupabaseConfig() {
  return {
    supabaseUrl: normalizeBaseUrl(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
  };
}

async function parseJsonResponse(response, fallback = {}) {
  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

async function fetchHistory({ baseUrl, token }) {
  assertToken(token);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const historyUrl = `${normalizedBaseUrl}/api/get-messages`;

  console.info('[yumiko][chatClient] GET history', { url: historyUrl, hasToken: true });

  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(historyUrl, {
    method: 'GET',
    headers: buildApiHeaders(token),
    signal
  }));

  if (!response.ok) {
    throw new Error(`History request failed (HTTP ${response.status})`);
  }

  const data = await parseJsonResponse(response, {});
  const messages = Array.isArray(data?.messages)
    ? data.messages
    : Array.isArray(data)
      ? data
      : [];

  return { messages };
}

async function getUserId({ supabaseUrl, supabaseAnonKey, token }) {
  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`
    },
    signal
  }));

  if (!response.ok) {
    const error = new Error(`Supabase auth user failed (HTTP ${response.status})`);
    error.code = response.status === 401 ? 'AUTH_INVALID' : 'SUPABASE_AUTH_FAILED';
    throw error;
  }

  const data = await parseJsonResponse(response, {});
  if (!data?.id) {
    throw new Error('Supabase auth user response missing id');
  }
  return data.id;
}

async function getOrCreateDefaultConversation({ supabaseUrl, supabaseAnonKey, token, userId }) {
  const queryUrl = `${supabaseUrl}/rest/v1/conversations?user_id=eq.${encodeURIComponent(userId)}&is_default=eq.true&select=id`;
  const commonHeaders = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const existingResponse = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(queryUrl, {
    method: 'GET',
    headers: commonHeaders,
    signal
  }));

  if (!existingResponse.ok) {
    if ([404, 406].includes(existingResponse.status)) {
      console.warn('[yumiko][chatClient] conversations table/query unavailable, continuing without conversation_id', {
        status: existingResponse.status
      });
      return null;
    }
    throw new Error(`Fetch default conversation failed (HTTP ${existingResponse.status})`);
  }

  const rows = await parseJsonResponse(existingResponse, []);
  if (Array.isArray(rows) && rows[0]?.id) {
    return rows[0].id;
  }

  const createResponse = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(`${supabaseUrl}/rest/v1/conversations`, {
    method: 'POST',
    headers: {
      ...commonHeaders,
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ user_id: userId, is_default: true }),
    signal
  }));

  if (!createResponse.ok) {
    if ([404, 406].includes(createResponse.status)) {
      console.warn('[yumiko][chatClient] cannot create default conversation, continuing without conversation_id', {
        status: createResponse.status
      });
      return null;
    }
    throw new Error(`Create default conversation failed (HTTP ${createResponse.status})`);
  }

  const created = await parseJsonResponse(createResponse, []);
  const createdId = Array.isArray(created) ? created[0]?.id : created?.id;
  if (!createdId) {
    throw new Error('Create default conversation response missing id');
  }
  return createdId;
}

async function insertMessage({ supabaseUrl, supabaseAnonKey, token, payload }) {
  const response = await withTimeout(CHAT_TIMEOUT_MS, (signal) => fetch(`${supabaseUrl}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal
  }));

  if (!response.ok) {
    throw new Error(`Insert message failed (HTTP ${response.status})`);
  }
}

async function sendMessage({ baseUrl, token, message, contextMessages = [] }) {
  assertToken(token);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const sendUrl = `${normalizedBaseUrl}/api/yumiko`;
  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();

  console.info('[yumiko][chatClient] POST send', {
    url: sendUrl,
    hasToken: true,
    messageLength: typeof message === 'string' ? message.length : 0,
    contextMessages: Array.isArray(contextMessages) ? contextMessages.length : 0
  });

  const userId = await getUserId({ supabaseUrl, supabaseAnonKey, token });
  const conversationId = await getOrCreateDefaultConversation({ supabaseUrl, supabaseAnonKey, token, userId });

  const userMessagePayload = {
    user_id: userId,
    sender: 'user',
    content: message
  };

  if (conversationId) {
    userMessagePayload.conversation_id = conversationId;
  }

  try {
    await insertMessage({
      supabaseUrl,
      supabaseAnonKey,
      token,
      payload: userMessagePayload
    });
  } catch (error) {
    if (!conversationId || !String(error?.message || '').includes('HTTP 4')) {
      throw error;
    }

    console.warn('[yumiko][chatClient] insert with conversation_id failed, retrying without conversation_id', {
      conversationId,
      reason: error.message
    });

    const fallbackPayload = {
      user_id: userId,
      sender: 'user',
      content: message
    };
    await insertMessage({
      supabaseUrl,
      supabaseAnonKey,
      token,
      payload: fallbackPayload
    });
  }

  const requestBody = {
    message,
    audio_mode: false,
    summary: null,
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
    throw new Error(`Send request failed (HTTP ${response.status})`);
  }

  const data = await parseJsonResponse(response, {});
  const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';

  if (!data?.yumiko_message_id && reply) {
    const yumikoPayload = {
      user_id: userId,
      sender: 'yumiko',
      content: reply,
      conversation_id: conversationId
    };

    if (typeof data?.audio_out_signed_url === 'string' && data.audio_out_signed_url) {
      yumikoPayload.audio_url = data.audio_out_signed_url;
    }

    try {
      await insertMessage({
        supabaseUrl,
        supabaseAnonKey,
        token,
        payload: yumikoPayload
      });
    } catch (error) {
      if (conversationId && String(error?.message || '').includes('HTTP 4')) {
        const fallbackPayload = {
          user_id: userId,
          sender: 'yumiko',
          content: reply
        };
        if (typeof data?.audio_out_signed_url === 'string' && data.audio_out_signed_url) {
          fallbackPayload.audio_url = data.audio_out_signed_url;
        }
        await insertMessage({
          supabaseUrl,
          supabaseAnonKey,
          token,
          payload: fallbackPayload
        });
      } else {
        throw error;
      }
    }
  }

  return {
    conversationId,
    reply,
    yumikoMessageId: data?.yumiko_message_id || null,
    audioOutSignedUrl: data?.audio_out_signed_url || null
  };
}

module.exports = {
  fetchHistory,
  sendMessage
};
