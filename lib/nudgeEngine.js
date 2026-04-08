const { buildYumikoSystemMessages } = require('./yumikoPrompt');

const GENERIC_LINES = [
  '¿Seguimos un ratito?',
  'Mini empujoncito: volvemos cuando quieras.',
  'Acá estoy para seguir cuando te sirva.',
  '¿Querés retomar con un paso cortito?',
  'Si querés, lo retomamos juntas.'
];

function normalizeComparableText(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampText(text, maxLen = 120) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function pickFallbackNudge(context, lastMessage = '', avoidMessages = []) {
  const avoidSet = new Set(
    [lastMessage, ...avoidMessages]
      .map((item) => normalizeComparableText(item))
      .filter(Boolean)
  );

  if (context?.activeTopic) {
    const contextual = clampText(`¿Seguimos con lo de ${context.activeTopic}?`, 120);
    if (!avoidSet.has(normalizeComparableText(contextual))) {
      return contextual;
    }
  }

  const pool = GENERIC_LINES.filter((line) => !avoidSet.has(normalizeComparableText(line)));
  const candidates = pool.length ? pool : GENERIC_LINES;
  return candidates[Math.floor(Math.random() * candidates.length)] || GENERIC_LINES[0];
}

function pickNonDuplicateNudge(message = '', { context, lastMessage = '', avoidMessages = [] } = {}) {
  const normalized = normalizeComparableText(message);
  const avoidSet = new Set(
    [lastMessage, ...avoidMessages]
      .map((item) => normalizeComparableText(item))
      .filter(Boolean)
  );
  if (!normalized || avoidSet.has(normalized)) {
    return pickFallbackNudge(context, lastMessage, avoidMessages);
  }
  return message;
}

async function generateAutoNudge({ apiKey, context, session, summary = '', lastMessage = '', contextMessages = [], avoidMessages = [] } = {}) {
  console.info('[yumiko][auto-nudge] generation start', {
    hasApiKey: Boolean(apiKey),
    activeTopic: context?.activeTopic || '',
    hasPendingQuestion: Boolean(context?.hasPendingQuestion)
  });

  if (!apiKey) {
    const fallbackMessage = pickFallbackNudge(context, lastMessage, avoidMessages);
    console.info('[yumiko][auto-nudge] generation result', { mode: 'fallback-no-key', message: fallbackMessage });
    return fallbackMessage;
  }

  const messages = [
    ...buildYumikoSystemMessages({ mode: 'auto-nudge', session, summary }),
    ...((Array.isArray(contextMessages) && contextMessages.length ? contextMessages : (context?.modelMessages || [])).slice(-12)),
    {
      role: 'system',
      content: `Contexto compartido: tema_activo=${context?.activeTopic || 'ninguno'} | pregunta_abierta=${context?.openLoopQuestion || 'ninguna'} | pista_continuidad=${context?.continuityHint || 'ninguna'}`
    },
    {
      role: 'system',
      content: `Evitá repetir estos mensajes recientes (ni variantes casi iguales): ${(avoidMessages || []).slice(-4).join(' || ') || 'ninguno'}`
    }
  ];

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'deepseek-chat', messages })
    });

    const data = await response.json();
    const content = clampText(data?.choices?.[0]?.message?.content || '', 120);
    if (!response.ok || !content) {
      throw new Error(data?.error?.message || 'empty_auto_nudge');
    }

    const uniqueMessage = pickNonDuplicateNudge(content, { context, lastMessage, avoidMessages });
    console.info('[yumiko][auto-nudge] generation result', { mode: 'llm', message: uniqueMessage });
    return uniqueMessage;
  } catch (error) {
    const fallbackMessage = pickFallbackNudge(context, lastMessage, avoidMessages);
    console.warn('[yumiko][auto-nudge] generation fallback', { error: error?.message || String(error) });
    console.info('[yumiko][auto-nudge] generation result', { mode: 'fallback-error', message: fallbackMessage });
    return fallbackMessage;
  }
}

module.exports = {
  generateAutoNudge
};
