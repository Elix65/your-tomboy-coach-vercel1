const STORAGE_KEY = 'yumiko-widget-settings-v1';
const DEFAULT_SETTINGS = { mode: 'chat' };

const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');
const quitAppButton = document.getElementById('quit-app');
const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const shortcutsToggle = document.getElementById('shortcuts-enabled');

const widget = document.getElementById('yumiko-widget');
const avatar = document.getElementById('yumiko-avatar');
const chat = document.getElementById('yumiko-chat');
const bubble = document.getElementById('yumiko-bubble');
const input = document.getElementById('yumiko-input');
const send = document.getElementById('yumiko-send');
const chatLog = document.getElementById('chat-log');

const history = [];
let isThinking = false;

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

function setThinking(state) {
  isThinking = Boolean(state);
  if (input) input.disabled = isThinking;
  if (send) send.disabled = isThinking;
}

function notifyHostMode(mode) {
  window.yumikoOverlay?.setMode?.(mode);
}

function setMode(nextMode) {
  const mode = nextMode === 'focus' ? 'focus' : 'chat';
  settings.mode = mode;
  saveSettings();

  if (!widget || !chat || !bubble) return;

  widget.dataset.mode = mode;
  chat.hidden = mode !== 'chat';
  bubble.hidden = mode === 'chat';

  if (mode === 'chat') {
    input?.focus();
  }

  notifyHostMode(mode);
}

async function submitMessage() {
  if (!input || isThinking) return;
  const message = input.value.trim();
  if (!message) return;

  addMessage('user', message);
  history.push({ role: 'user', content: message });

  input.value = '';
  setThinking(true);
  const thinkingNode = addMessage('assistant', 'Pensando…', { thinking: true });

  try {
    const result = await window.yumikoOverlay?.chat?.sendMessage?.({ message, history: [...history] });
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

    history.push({ role: 'assistant', content: reply });
  } catch (error) {
    const fallback = 'Tuve un problema al responder. Probá de nuevo en un momento.';
    if (thinkingNode) {
      thinkingNode.classList.remove('thinking');
      const textNode = thinkingNode.querySelector('.chat-message');
      if (textNode) textNode.textContent = fallback;
    } else {
      addMessage('assistant', fallback);
    }
    console.error('[yumiko][widget] sendMessage failed:', error);
  } finally {
    setThinking(false);
    input?.focus();
  }
}

function syncHostState(state = {}) {
  if (overlayToggle) overlayToggle.checked = Boolean(state.overlayEnabled);
  if (clickThroughToggle) clickThroughToggle.checked = Boolean(state.clickThroughEnabled);
  if (shortcutsToggle) shortcutsToggle.checked = Boolean(state.shortcutsEnabled);

  if (state.mode) {
    setMode(state.mode);
  }
}

toggleSettingsButton?.addEventListener('click', () => {
  settingsPanel?.classList.toggle('open');
});

quitAppButton?.addEventListener('click', () => {
  if (typeof window.yumikoOverlay?.quit === 'function') {
    window.yumikoOverlay.quit();
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

avatar?.addEventListener('click', () => {
  setMode(settings.mode === 'focus' ? 'chat' : 'focus');
});

bubble?.addEventListener('click', () => setMode('chat'));
send?.addEventListener('click', submitMessage);

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitMessage();
  }
  if (event.key === 'Escape') {
    setMode('focus');
  }
});

window.yumikoWidget = {
  setMode,
  getSettings: () => ({ ...settings })
};

window.yumikoOverlay?.onStateUpdated?.(syncHostState);

window.yumikoOverlay?.getState?.()
  .then((state) => {
    syncHostState(state);
    if (!state?.mode) {
      setMode(settings.mode);
    }
  })
  .catch(() => setMode(settings.mode));

if (chatLog?.children.length === 0) {
  addMessage('assistant', '¡Hola! Soy Yumiko ✨ ¿En qué te ayudo hoy?');
}

setMode(settings.mode || 'chat');
