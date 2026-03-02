const STORAGE_KEY = 'yumiko-widget-settings-v1';
const DEFAULT_SETTINGS = { mode: 'chat' };

const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');
const quitAppButton = document.getElementById('quit-app');
const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const shortcutsToggle = document.getElementById('shortcuts-enabled');
const authStatus = document.getElementById('auth-status');
const disconnectOverlayButton = document.getElementById('disconnect-overlay');

const widget = document.getElementById('yumiko-widget');
const avatar = document.getElementById('yumiko-avatar');
const chat = document.getElementById('yumiko-chat');
const bubble = document.getElementById('yumiko-bubble');
const input = document.getElementById('yumiko-input');
const send = document.getElementById('yumiko-send');
const chatLog = document.getElementById('chat-log');

let isThinking = false;
let contextCache = [];

const AUTH_HINT_MESSAGE = 'No hay token PRO. Conectá overlay con yumiko://auth?code=...';

function isAuthError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error?.code === 'string' ? error.code : '';
  return [message, code].some((value) => value.includes('AUTH_MISSING') || value.includes('AUTH_INVALID') || value.includes('No hay token'));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function addMessage(role, content, { thinking = false } = {}) {
  if (!chatLog) return null;
  const row = document.createElement('div');
  row.className = `chat-row ${role}${thinking ? ' thinking' : ''}`;

  const label = document.createElement('span');
  label.className = 'chat-role';
  label.textContent = role === 'user' ? 'Vos' : 'Yumiko';

  const text = document.createElement('p');
  text.className = 'chat-message';
  text.textContent = content;

  row.append(label, text);
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
  return row;
}

function clearMessages() {
  if (!chatLog) return;
  chatLog.innerHTML = '';
}

function renderMessages(messages = []) {
  clearMessages();
  messages.forEach(({ role, content }) => {
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      addMessage(role, content);
    }
  });

  if (chatLog?.children.length === 0) {
    addMessage('assistant', '¡Hola! Soy Yumiko ✨ ¿En qué te ayudo hoy?');
  }
}

function setThinking(state) {
  isThinking = Boolean(state);
  if (input) input.disabled = isThinking;
  if (send) send.disabled = isThinking;
}

function notifyHostMode(mode) {
  window.yumikoOverlay?.setMode?.(mode);
}

function setMode(nextMode, { source = 'ui' } = {}) {
  const mode = nextMode === 'focus' ? 'focus' : 'chat';
  if (settings.mode === mode && source !== 'state-sync') {
    console.info('[yumiko][route] setMode noop', { mode, source });
  } else {
    console.info('[yumiko][route] setMode', { previousMode: settings.mode, nextMode: mode, source });
  }

  settings.mode = mode;
  saveSettings();

  if (!widget || !chat || !bubble) return;

  widget.dataset.mode = mode;
  chat.hidden = mode !== 'chat';
  bubble.hidden = mode === 'chat';

  if (mode === 'chat') {
    input?.focus();
  }

  if (source === 'ui' || source === 'hotkey') {
    notifyHostMode(mode);
  }
}

async function loadChatHistory() {
  try {
    const result = await window.yumikoOverlay?.chat?.getHistory?.();

    const records = Array.isArray(result?.records)
      ? result.records
      : Array.isArray(result?.messages)
        ? result.messages
        : [];

    const messages = records.map(({ sender, role, content }) => ({
      role: sender === 'user' || role === 'user' ? 'user' : 'assistant',
      content: typeof content === 'string' ? content : ''
    })).filter((item) => item.content);

    contextCache = messages.slice(-20);
    renderMessages(messages);

    const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
    if (lastAssistant?.content && bubble) {
      bubble.textContent = lastAssistant.content;
    }

    console.info('[yumiko][widget] history loaded', {
      records: records.length,
      contextCache: contextCache.length
    });
  } catch (error) {
    if (isAuthError(error)) {
      console.warn('[yumiko][auth] AUTH_MISSING/AUTH_INVALID on widget getHistory');
    }
    console.error('[yumiko][widget] getHistory failed:', error);
    contextCache = [];
    if (isAuthError(error)) {
      renderMessages([]);
      addMessage('assistant', AUTH_HINT_MESSAGE);
      return;
    }
    renderMessages([]);
  }
}

async function submitMessage() {
  if (!input || isThinking) return;
  const message = input.value.trim();
  if (!message) return;

  addMessage('user', message);
  contextCache.push({ role: 'user', content: message });
  contextCache = contextCache.slice(-20);
  input.value = '';
  setThinking(true);
  const thinkingNode = addMessage('assistant', 'Pensando…', { thinking: true });
  if (bubble) bubble.textContent = 'Pensando…';

  try {
    const result = await window.yumikoOverlay?.chat?.sendMessage?.({
      message,
      contextMessages: contextCache.slice(-20)
    });

    const reply = typeof result?.reply === 'string' && result.reply.trim()
      ? result.reply.trim()
      : 'Me quedé sin palabras por un segundo. ¿Me repetís eso?';

    if (thinkingNode) {
      thinkingNode.classList.remove('thinking');
      const textNode = thinkingNode.querySelector('.chat-message');
      if (textNode) textNode.textContent = reply;
    } else {
      addMessage('assistant', reply);
    }

    contextCache.push({ role: 'assistant', content: reply });
    contextCache = contextCache.slice(-20);
    if (bubble) bubble.textContent = reply;
  } catch (error) {
    const fallback = isAuthError(error)
      ? 'No pude autenticarte (AUTH_MISSING/AUTH_INVALID). Volvé a vincular tu cuenta desde Settings.'
      : 'Tuve un problema al responder. Probá de nuevo en un momento.';
    if (thinkingNode) {
      thinkingNode.classList.remove('thinking');
      const textNode = thinkingNode.querySelector('.chat-message');
      if (textNode) textNode.textContent = fallback;
    } else {
      addMessage('assistant', fallback);
    }
    if (bubble) bubble.textContent = fallback;
    if (isAuthError(error)) {
      console.warn('[yumiko][auth] AUTH_MISSING/AUTH_INVALID on widget sendMessage');
    }
    console.error('[yumiko][widget] sendMessage failed:', error);
  } finally {
    setThinking(false);
  }
}

function renderAuthState(state = {}) {
  if (!authStatus) return;
  if (state.overlayAccountEmail) {
    authStatus.textContent = `Conectado como ${state.overlayAccountEmail}`;
  } else {
    authStatus.textContent = 'No conectado';
  }
}

function syncHostState(state = {}) {
  renderAuthState(state);
  if (overlayToggle) overlayToggle.checked = Boolean(state.overlayEnabled);
  if (clickThroughToggle) clickThroughToggle.checked = Boolean(state.clickThroughEnabled);
  if (shortcutsToggle) shortcutsToggle.checked = Boolean(state.shortcutsEnabled);

  if (state.mode && state.mode !== settings.mode) {
    setMode(state.mode, { source: 'state-sync' });
  }
}

toggleSettingsButton?.addEventListener('click', () => {
  settingsPanel?.classList.toggle('open');
});

quitAppButton?.addEventListener('click', (event) => {
  if (event.shiftKey && typeof window.yumikoOverlay?.quit === 'function') {
    console.info('[yumiko][window] quit requested from X + Shift');
    window.yumikoOverlay.quit();
    return;
  }

  console.info('[yumiko][window] hide requested from X');
  if (typeof window.yumikoOverlay?.closeWindow === 'function') {
    window.yumikoOverlay.closeWindow();
    return;
  }

  window.close();
});

overlayToggle?.addEventListener('change', () => {
  window.yumikoOverlay?.setOverlayEnabled?.(overlayToggle.checked);
});

clickThroughToggle?.addEventListener('change', () => {
  window.yumikoOverlay?.setClickThroughEnabled?.(clickThroughToggle.checked);
});

shortcutsToggle?.addEventListener('change', () => {
  window.yumikoOverlay?.setShortcutsEnabled?.(shortcutsToggle.checked);
});

disconnectOverlayButton?.addEventListener('click', async () => {
  disconnectOverlayButton.disabled = true;
  try {
    const nextState = await window.yumikoOverlay?.disconnectOverlay?.();
    syncHostState(nextState || {});
    renderMessages([]);
    addMessage('assistant', 'Sesión PRO desconectada. Volvé a vincular con yumiko://auth?code=...');
  } catch (error) {
    console.error('[yumiko][auth] disconnect failed', error);
  } finally {
    disconnectOverlayButton.disabled = false;
  }
});

avatar?.addEventListener('click', () => {
  setMode(settings.mode === 'focus' ? 'chat' : 'focus', { source: 'ui' });
});

bubble?.addEventListener('click', () => setMode('chat', { source: 'ui' }));
send?.addEventListener('click', submitMessage);

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitMessage();
  }
  if (event.key === 'Escape') {
    setMode('focus', { source: 'ui' });
  }
});

window.yumikoWidget = {
  setMode: (mode) => setMode(mode, { source: 'state-sync' }),
  getSettings: () => ({ ...settings })
};

window.addEventListener('DOMContentLoaded', () => {
  window.yumikoOverlay?.onStateUpdated?.(syncHostState);

  window.yumikoOverlay?.getState?.()
    .then((state) => {
      syncHostState(state);
      if (!state?.mode) {
        setMode('chat', { source: 'state-sync' });
      }
    })
    .catch(() => setMode('chat', { source: 'state-sync' }));

  setMode('chat', { source: 'state-sync' });
  loadChatHistory();
});
