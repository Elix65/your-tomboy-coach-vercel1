const { getRecentMessages } = require('./messageStore');

const TRIVIAL_MESSAGE_RE = /^(ok(ay)?|dale|si|sí|jaja+|jeje+|jj+|xd+|uhm+|mmm+|listo|va|bien|genial|👍|👌|🙂|😂|🙏|gracias)[.!?\s]*$/i;

function clampText(text, maxLen = 120) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function isTrivialMessage(content) {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  return normalized.length <= 14 && TRIVIAL_MESSAGE_RE.test(normalized);
}

function extractTopic(content = '') {
  const source = String(content || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';

  const modelLike = source.match(/\b([A-ZÁÉÍÓÚÑ]{2,}|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:\s+[A-Z0-9ÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ+-]*){0,3}\b/g);
  if (Array.isArray(modelLike) && modelLike.length) {
    const best = modelLike.find((item) => /\d/.test(item)) || modelLike[0];
    return clampText(best, 40);
  }

  return clampText(source.split(' ').slice(0, 5).join(' '), 40);
}

function normalizeForModel(messages = []) {
  return messages
    .filter((msg) => msg && typeof msg.content === 'string' && (msg.sender === 'user' || msg.sender === 'yumiko'))
    .map((msg) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
}

async function buildYumikoConversationContext({ supabaseAdmin, userId, limit = 25 } = {}) {
  console.info('[yumiko][context] build start', { userId, limit });
  const recentMessages = await getRecentMessages(supabaseAdmin, { userId, limit, ascending: false });
  const chronological = [...recentMessages].reverse();

  const userMessages = [...chronological].reverse().filter((item) => item?.sender === 'user' && !isTrivialMessage(item?.content));
  const latestUser = userMessages[0] || null;
  const pendingQuestion = userMessages.find((item) => String(item?.content || '').includes('?'));

  const context = {
    recentMessages: chronological,
    modelMessages: normalizeForModel(chronological).slice(-20),
    activeTopic: latestUser ? extractTopic(latestUser.content) : '',
    openLoopQuestion: pendingQuestion ? clampText(pendingQuestion.content, 100) : '',
    hasPendingQuestion: Boolean(pendingQuestion),
    lastRelevantInteractionAt: latestUser?.created_at || chronological.at(-1)?.created_at || null,
    continuityHint: latestUser ? clampText(latestUser.content, 140) : ''
  };

  console.info('[yumiko][context] build result', {
    userId,
    recentCount: context.recentMessages.length,
    modelCount: context.modelMessages.length,
    activeTopic: context.activeTopic,
    hasPendingQuestion: context.hasPendingQuestion,
    lastRelevantInteractionAt: context.lastRelevantInteractionAt
  });

  return context;
}

module.exports = {
  buildYumikoConversationContext
};
