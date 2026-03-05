const STORAGE_KEY = 'yumiko-widget-settings-v1';
const DEFAULT_SETTINGS = { mode: 'focus', miniScale: 1 };
const CHAT_WINDOW_SIZE = { width: 560, height: 380 };
const MINI_SCALE_MIN = 0.6;
const MINI_SCALE_MAX = 1.2;

const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');
const quitAppButton = document.getElementById('quit-app');
const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const shortcutsToggle = document.getElementById('shortcuts-enabled');
const authStatus = document.getElementById('auth-status');
const authActionButton = document.getElementById('auth-action');

const widget = document.getElementById('yumiko-widget');
const mini = document.getElementById('yumiko-mini');
const miniWrap = document.getElementById('mini-wrap');
const miniChatButton = document.getElementById('mini-chat');
const miniMicButton = document.getElementById('mini-mic');
const chat = document.getElementById('yumiko-chat');
const img = document.getElementById('yumiko-character');
const input = document.getElementById('yumiko-input');
const send = document.getElementById('yumiko-send');
const chatLog = document.getElementById('chat-log');

let isThinking = false;
let contextCache = [];
let overlayConnected = false;
let restoreClickThroughOnFocus = false;
let currentAuthState = { connected: false, user_id: '', device_id: '', device_name: '' };
let isAuthExchangeInProgress = false;
const processedAuthCodes = new Set();

const AUTH_MISSING_MESSAGE = 'No conectado. Abrí Settings > Vincular';
const AUTH_INVALID_MESSAGE = 'Sesión expirada. Vinculá de nuevo';

function getAuthErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = error instanceof Error ? error.message : String(error);

  if (code === 'AUTH_MISSING' || message.includes('AUTH_MISSING') || message.includes(AUTH_MISSING_MESSAGE)) {
    return 'AUTH_MISSING';
  }
  if (code === 'AUTH_INVALID' || message.includes('AUTH_INVALID')) {
    return 'AUTH_INVALID';
  }
  return '';
}

function formatHttpErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  const httpMatch = message.match(/HTTP\s+(\d+):?\s*([\s\S]*)/i);
  if (!httpMatch) return '';

  const status = httpMatch[1];
  const body = (httpMatch[2] || '').trim().replace(/\s+/g, ' ');
  const shortBody = body ? body.slice(0, 200) : 'Sin detalle';
  return `Error HTTP ${status}: ${shortBody}`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    parsed.mode = toUiMode(parsed.mode);
    parsed.miniScale = clamp(Number(parsed.miniScale) || 1, MINI_SCALE_MIN, MINI_SCALE_MAX);
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();
let resizeObserver;
let fitTimeout = null;
let lastFitRequest = { mode: '', width: 0, height: 0 };

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyMiniScale(nextScale, { persist = true } = {}) {
  const safeScale = clamp(Number(nextScale) || 1, MINI_SCALE_MIN, MINI_SCALE_MAX);
  settings.miniScale = Number(safeScale.toFixed(2));
  document.documentElement.style.setProperty('--mini-scale', String(settings.miniScale));
  if (persist) saveSettings();
}

function requestFit() {
  if (!window.yumikoOverlay?.setWindowSize || !widget) return;

  if (settings.mode === 'focus') {
    const rect = miniWrap?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (lastFitRequest.mode === 'focus' && lastFitRequest.width === width && lastFitRequest.height === height) return;

    lastFitRequest = { mode: 'focus', width, height };
    window.yumikoOverlay.setWindowSize({ width, height, anchor: 'bottom-right' });
    return;
  }

  if (lastFitRequest.mode === 'chat'
    && lastFitRequest.width === CHAT_WINDOW_SIZE.width
    && lastFitRequest.height === CHAT_WINDOW_SIZE.height) {
    return;
  }

  lastFitRequest = { mode: 'chat', width: CHAT_WINDOW_SIZE.width, height: CHAT_WINDOW_SIZE.height };
  window.yumikoOverlay.setWindowSize({
    width: CHAT_WINDOW_SIZE.width,
    height: CHAT_WINDOW_SIZE.height,
    anchor: 'bottom-right'
  });
}

function requestFitDebounced() {
  window.clearTimeout(fitTimeout);
  fitTimeout = window.setTimeout(requestFit, 50);
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

function toHostMode(uiMode) {
  return uiMode === 'chat' ? 'chat' : 'focus';
}

function toUiMode(anyMode) {
  if (anyMode === 'chat' || anyMode === 'expand') return 'chat';
  return 'focus';
}

function notifyHostMode(mode) {
  window.yumikoOverlay?.setMode?.(toHostMode(mode));
}

function removeOutsideClickListener() {
  document.removeEventListener('mousedown', onOutsideClick, true);
}

function closeSettingsPanel() {
  setSettingsPanelHidden(true);
}

function setSettingsPanelHidden(nextHidden) {
  if (!settingsPanel) return;

  settingsPanel.hidden = Boolean(nextHidden);
  toggleSettingsButton?.setAttribute('aria-expanded', String(!settingsPanel.hidden));

  if (settingsPanel.hidden) {
    removeOutsideClickListener();
    return;
  }

  document.addEventListener('mousedown', onOutsideClick, { capture: true });
}

function onOutsideClick(event) {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (settingsPanel?.contains(target) || toggleSettingsButton?.contains(target)) return;
  closeSettingsPanel();
}

function setMode(nextMode, { source = 'ui' } = {}) {
  const mode = toUiMode(nextMode);
  if (settings.mode === mode && source !== 'state-sync') {
    console.info('[yumiko][route] setMode noop', { mode, source });
  } else {
    console.info('[yumiko][route] setMode', { previousMode: settings.mode, nextMode: mode, source });
  }

  settings.mode = mode;
  saveSettings();

  if (widget) {
    widget.dataset.mode = mode;
  }
  if (quitAppButton) {
    quitAppButton.hidden = mode === 'focus';
  }

  if (mode === 'chat') {
    if (chat) {
      chat.hidden = false;
      chat.setAttribute('aria-hidden', 'false');
    }
    if (mini) {
      mini.hidden = true;
      mini.setAttribute('aria-hidden', 'true');
    }
  } else {
    if (chat) {
      chat.hidden = true;
      chat.setAttribute('aria-hidden', 'true');
    }
    if (mini) {
      mini.hidden = false;
      mini.setAttribute('aria-hidden', 'false');
    }
  }

  if (mode === 'chat') {
    if (clickThroughToggle?.checked) {
      clickThroughToggle.checked = false;
      window.yumikoOverlay?.setClickThroughEnabled?.(false);
      restoreClickThroughOnFocus = true;
    }
    input?.focus();
  } else {
    closeSettingsPanel();
    if (restoreClickThroughOnFocus && clickThroughToggle) {
      clickThroughToggle.checked = true;
      window.yumikoOverlay?.setClickThroughEnabled?.(true);
      restoreClickThroughOnFocus = false;
    }
  }

  if (source === 'ui' || source === 'hotkey') {
    notifyHostMode(mode);
  }

  requestFitDebounced();
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

    console.info('[yumiko][widget] history loaded', {
      records: records.length,
      contextCache: contextCache.length
    });
  } catch (error) {
    const authCode = getAuthErrorCode(error);
    if (authCode) {
      console.warn(`[yumiko][auth] ${authCode} on widget getHistory`);
    }
    console.error('[yumiko][widget] getHistory failed:', error);
    contextCache = [];
    if (authCode) {
      renderMessages([]);
      addMessage('assistant', authCode === 'AUTH_INVALID' ? AUTH_INVALID_MESSAGE : AUTH_MISSING_MESSAGE);
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
  } catch (error) {
    const authCode = getAuthErrorCode(error);
    const httpErrorMessage = formatHttpErrorMessage(error);
    const fallback = authCode === 'AUTH_INVALID'
      ? AUTH_INVALID_MESSAGE
      : authCode === 'AUTH_MISSING'
        ? AUTH_MISSING_MESSAGE
        : (httpErrorMessage || 'Tuve un problema al responder. Probá de nuevo en un momento.');

    if (thinkingNode) {
      thinkingNode.classList.remove('thinking');
      const textNode = thinkingNode.querySelector('.chat-message');
      if (textNode) textNode.textContent = fallback;
    } else {
      addMessage('assistant', fallback);
    }
    if (authCode) {
      console.warn(`[yumiko][auth] ${authCode} on widget sendMessage`);
    }
    console.error('[yumiko][chat] sendMessage failed:', error);
  } finally {
    setThinking(false);
  }
}

function abbreviateUserId(value) {
  if (typeof value !== 'string' || value.length < 10) return value || '';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function renderAuthState(state = {}) {
  const nextAuthState = state?.authState && typeof state.authState === 'object'
    ? state.authState
    : state;

  currentAuthState = {
    connected: Boolean(nextAuthState?.connected),
    user_id: typeof nextAuthState?.user_id === 'string' ? nextAuthState.user_id : '',
    device_id: typeof nextAuthState?.device_id === 'string' ? nextAuthState.device_id : '',
    device_name: typeof nextAuthState?.device_name === 'string' ? nextAuthState.device_name : ''
  };

  overlayConnected = currentAuthState.connected;

  if (authStatus) {
    authStatus.textContent = overlayConnected
      ? `Conectado (${abbreviateUserId(currentAuthState.user_id) || 'sin user_id'})`
      : 'No conectado';
  }

  if (authActionButton) {
    authActionButton.textContent = overlayConnected ? 'Desconectar' : 'Vincular';
    authActionButton.disabled = isAuthExchangeInProgress;
  }
}

async function exchangeCode(code) {
  const trimmedCode = typeof code === 'string' ? code.trim() : '';
  if (!trimmedCode || processedAuthCodes.has(trimmedCode) || isAuthExchangeInProgress) {
    return;
  }

  processedAuthCodes.add(trimmedCode);
  isAuthExchangeInProgress = true;
  if (authActionButton) authActionButton.disabled = true;

  addMessage('assistant', 'Recibí code, vinculando…');

  try {
    await window.yumikoOverlay?.exchangeAuthCode?.({
      code: trimmedCode,
      deviceId: currentAuthState.device_id,
      deviceName: currentAuthState.device_name
    });
    const nextState = await window.yumikoOverlay?.getState?.();
    syncHostState(nextState || {});
    if (nextState?.authState?.connected) {
      addMessage('assistant', 'Vinculado ✅');
    }
  } catch (error) {
    const reason = typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim()
      : 'error_desconocido';
    addMessage('assistant', `No pude vincular: ${reason}`);
    console.error('[yumiko][auth] auth code exchange failed', { reason });
  } finally {
    isAuthExchangeInProgress = false;
    renderAuthState({ authState: currentAuthState });
  }
}

function syncHostState(state = {}) {
  console.info('[yumiko][renderer] state updated', { authState: state?.authState });
  renderAuthState(state);
  if (overlayToggle) overlayToggle.checked = Boolean(state.overlayEnabled);
  if (clickThroughToggle) clickThroughToggle.checked = Boolean(state.clickThroughEnabled);
  if (shortcutsToggle) shortcutsToggle.checked = Boolean(state.shortcutsEnabled);

  if (state.mode) {
    setMode(state.mode, { source: 'state-sync' });
  }
}

toggleSettingsButton?.addEventListener('click', () => {
  setSettingsPanelHidden(!settingsPanel?.hidden);
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
  if (settings.mode === 'chat' && clickThroughToggle.checked) {
    clickThroughToggle.checked = false;
    restoreClickThroughOnFocus = false;
    addMessage('assistant', 'Click-through solo funciona en modo mini. Cerrá el chat (ESC) para activarlo.');
    window.yumikoOverlay?.setClickThroughEnabled?.(false);
    return;
  }

  window.yumikoOverlay?.setClickThroughEnabled?.(clickThroughToggle.checked);
});

shortcutsToggle?.addEventListener('change', () => {
  window.yumikoOverlay?.setShortcutsEnabled?.(shortcutsToggle.checked);
});

authActionButton?.addEventListener('click', async () => {
  authActionButton.disabled = true;
  try {
    if (!overlayConnected) {
      await window.yumikoOverlay?.openOverlayConnect?.();
      return;
    }

    await window.yumikoOverlay?.disconnect?.();
    const nextState = await window.yumikoOverlay?.getState?.();
    syncHostState(nextState || {});
    renderMessages([]);
    addMessage('assistant', AUTH_MISSING_MESSAGE);
  } catch (error) {
    console.error('[yumiko][auth] auth action failed', error);
  } finally {
    if (authActionButton) authActionButton.disabled = isAuthExchangeInProgress;
  }
});

miniChatButton?.addEventListener('click', () => {
  setMode('chat', { source: 'ui' });
  input?.focus();
});

miniMicButton?.addEventListener('click', () => {
  miniMicButton.title = 'Próximamente';
  console.info('[yumiko][mic] Próximamente');
});

window.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();

  const direction = event.deltaY < 0 ? 0.05 : -0.05;
  applyMiniScale((settings.miniScale || 1) + direction);
  requestFitDebounced();
}, { passive: false });

send?.addEventListener('click', submitMessage);

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitMessage();
  }
});

function handleEscapeToFocus(event) {
  if (event.key !== 'Escape' || settings.mode !== 'chat') return;
  event.preventDefault();
  setMode('focus', { source: 'hotkey' });
}

input?.addEventListener('keydown', handleEscapeToFocus);
window.addEventListener('keydown', handleEscapeToFocus);

window.yumikoWidget = {
  setMode: (mode) => setMode(mode, { source: 'state-sync' }),
  getSettings: () => ({ ...settings }),
  requestFit
};

window.addEventListener('DOMContentLoaded', () => {
  setSettingsPanelHidden(true);
  applyMiniScale(settings.miniScale, { persist: false });

  if (img) {
    if (img.complete) {
      requestFitDebounced();
    } else {
      img.addEventListener('load', requestFitDebounced, { once: true });
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => requestFitDebounced());
    if (miniWrap) resizeObserver.observe(miniWrap);
    if (chat) resizeObserver.observe(chat);
  }

  window.yumikoOverlay?.onStateUpdated?.(syncHostState);
  window.addEventListener('yumiko:auth-code', (event) => {
    const code = typeof event?.detail?.code === 'string' ? event.detail.code : '';
    exchangeCode(code);
  });
  window.addEventListener('yumiko:auth-result', (event) => {
    const message = typeof event?.detail?.message === 'string' ? event.detail.message : '';
    if (message) {
      addMessage('assistant', message);
    }
  });

  window.yumikoOverlay?.getState?.()
    .then((state) => {
      syncHostState(state);
      if (!state?.mode) {
        setMode('focus', { source: 'state-sync' });
      }
    })
    .catch(() => setMode('focus', { source: 'state-sync' }));

  setMode(settings.mode || 'focus', { source: 'state-sync' });
  requestFitDebounced();
  loadChatHistory();
});
