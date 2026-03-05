const STORAGE_KEY = 'yumiko-widget-settings-v1';
const MINI_SCALE_KEY = 'yumiko_mini_scale_v1';
const DEFAULT_SETTINGS = { mode: 'focus' };
const CHAT_WINDOW_SIZE = { width: 560, height: 380 };
const MINI_SCALE_MIN = 0.35;
const MINI_SCALE_MAX = 1;
const MINI_BASE_FALLBACK = { width: 360, height: 520 };
const MINI_BOUNDS_PADDING = 16;
const MINI_MIN_WIDTH = 280;
const MINI_MIN_HEIGHT = 320;
const MINI_RETRY_LIMIT = 10;
const MINI_MIN_SIZE_RETRY_LIMIT = 5;
const DEV_FIT_LOG = window.location.search.includes('dev=1') || localStorage.getItem('yumiko_debug_fit') === '1';

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
const miniActions = document.querySelector('.mini-actions');
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
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();
const storedUserScale = parseFloat(localStorage.getItem(MINI_SCALE_KEY) || '1');
let userScale = clamp(Number.isFinite(storedUserScale) ? storedUserScale : 1, MINI_SCALE_MIN, MINI_SCALE_MAX);
let effectiveScale = userScale;
let resizeObserver;
let fitTimeout = null;
let lastFitRequest = { mode: '', width: 0, height: 0 };
let miniBaseSize = null;
let fitRetryCount = 0;
let minSizeRetryCount = 0;
let lastGoodFocusFitSize = null;
let ignoreNextResize = false;

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyScale(source = 'unknown', { shouldRequestFit = true } = {}) {
  const baseSize = getBaseSize();
  const baseW = baseSize?.baseW || miniBaseSize?.width;
  const baseH = baseSize?.baseH || miniBaseSize?.height;
  let fitScale = MINI_SCALE_MAX;

  if (baseW > 0 && baseH > 0) {
    fitScale = clamp(Math.min(window.innerWidth / baseW, window.innerHeight / baseH), MINI_SCALE_MIN, MINI_SCALE_MAX);
  }

  const nextEffectiveScale = Number(Math.min(userScale, fitScale).toFixed(2));
  const scaleChanged = Math.abs(nextEffectiveScale - effectiveScale) > 0.001;

  effectiveScale = nextEffectiveScale;
  document.documentElement.style.setProperty('--mini-scale', String(effectiveScale));

  if (miniBaseSize?.width > 0 && miniBaseSize?.height > 0 && mini) {
    mini.style.width = `${Math.ceil(miniBaseSize.width * effectiveScale)}px`;
    mini.style.height = `${Math.ceil(miniBaseSize.height * effectiveScale)}px`;
  }

  updateFocusMinimumSize();
  if (shouldRequestFit && (source === 'user' || scaleChanged)) {
    requestFitDebounced(`scale:${source}`);
  }
}

function setMiniScale(nextScale, { persist = true, shouldRequestFit = true } = {}) {
  const safeScale = clamp(Number(nextScale) || 1, MINI_SCALE_MIN, MINI_SCALE_MAX);
  userScale = Number(safeScale.toFixed(2));

  if (persist) localStorage.setItem(MINI_SCALE_KEY, String(userScale));
  applyScale('user', { shouldRequestFit });
}

function getCurrentScale() {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--mini-scale');
  const parsed = parseFloat(cssValue);
  return clamp(Number.isFinite(parsed) ? parsed : effectiveScale || 1, MINI_SCALE_MIN, MINI_SCALE_MAX);
}

function getUnionRect() {
  const rects = [mini, miniActions]
    .map((node) => node?.getBoundingClientRect?.())
    .filter((rect) => rect && rect.width > 0 && rect.height > 0);

  if (!rects.length) return null;

  const union = rects.reduce((acc, rect) => ({
    left: Math.min(acc.left, rect.left),
    top: Math.min(acc.top, rect.top),
    right: Math.max(acc.right, rect.right),
    bottom: Math.max(acc.bottom, rect.bottom)
  }));

  return {
    ...union,
    width: Math.max(0, union.right - union.left),
    height: Math.max(0, union.bottom - union.top)
  };
}

function getBaseSize() {
  const unionRect = getUnionRect();
  const scale = getCurrentScale();
  if (!unionRect || hasUnsafeCalculatedSize(unionRect.width, unionRect.height) || !Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const baseW = unionRect.width / scale;
  const baseH = unionRect.height / scale;
  if (hasUnsafeCalculatedSize(baseW, baseH)) return null;

  return { baseW, baseH, scale };
}

function measureMiniBaseSize() {
  const baseSize = getBaseSize();
  if (!baseSize) return { ...MINI_BASE_FALLBACK, shouldResetScale: true };

  return {
    width: Math.ceil(baseSize.baseW),
    height: Math.ceil(baseSize.baseH),
    shouldResetScale: false
  };
}

function hasUnsafeCalculatedSize(width, height) {
  return !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0;
}

function scheduleFitRetry(reason = 'retry') {
  if (fitRetryCount >= MINI_RETRY_LIMIT) {
    console.warn('[yumiko][fit] retry limit reached', { reason, fitRetryCount });
    return;
  }

  fitRetryCount += 1;
  window.setTimeout(() => requestFit({ reason, retry: fitRetryCount }), 50);
}

function requestFit({ reason = 'unknown', retry = 0 } = {}) {
  if (!window.yumikoOverlay?.setWindowSize || !widget) return;

  if (settings.mode === 'focus') {
    updateFocusMinimumSize();

    const unionRect = getUnionRect();
    if (!unionRect) {
      if (lastGoodFocusFitSize) {
        const { width, height } = lastGoodFocusFitSize;
        lastFitRequest = { mode: 'focus', width, height };
        ignoreNextResize = true;
        window.yumikoOverlay.setWindowSize({ width, height, anchor: 'bottom-right' });
      }
      scheduleFitRetry(`${reason}:missing-bounds`);
      return;
    }

    const unionW = Math.ceil(unionRect.width);
    const unionH = Math.ceil(unionRect.height);
    const rawWidth = Math.ceil(unionW + (MINI_BOUNDS_PADDING * 2));
    const rawHeight = Math.ceil(unionH + (MINI_BOUNDS_PADDING * 2));

    if (hasUnsafeCalculatedSize(rawWidth, rawHeight)) {
      console.warn('[yumiko][fit] invalid measured focus bounds', {
        rawWidth,
        rawHeight,
        unionW,
        unionH,
        reason,
        retry
      });
      if (lastGoodFocusFitSize) {
        const { width: cachedW, height: cachedH } = lastGoodFocusFitSize;
        lastFitRequest = { mode: 'focus', width: cachedW, height: cachedH };
        ignoreNextResize = true;
        window.yumikoOverlay.setWindowSize({ width: cachedW, height: cachedH, anchor: 'bottom-right' });
      }
      if (fitRetryCount < 2) {
        scheduleFitRetry(`${reason}:invalid-bounds`);
      }
      return;
    }

    const width = Math.max(rawWidth, MINI_MIN_WIDTH);
    const height = Math.max(rawHeight, MINI_MIN_HEIGHT);
    if (lastFitRequest.mode === 'focus' && lastFitRequest.width === width && lastFitRequest.height === height) return;

    fitRetryCount = 0;
    lastGoodFocusFitSize = { width, height };
    lastFitRequest = { mode: 'focus', width, height };

    if (DEV_FIT_LOG) {
      console.log('[fit]', {
        mode: settings.mode,
        userScale,
        effectiveScale,
        unionW,
        unionH,
        winW: width,
        winH: height
      });
    }

    ignoreNextResize = true;
    window.yumikoOverlay.setWindowSize({ width, height, anchor: 'bottom-right' });
    return;
  }

  window.yumikoOverlay?.setMinimumSize?.({ width: 0, height: 0 });

  if (lastFitRequest.mode === 'chat'
    && lastFitRequest.width === CHAT_WINDOW_SIZE.width
    && lastFitRequest.height === CHAT_WINDOW_SIZE.height) {
    return;
  }

  lastFitRequest = { mode: 'chat', width: CHAT_WINDOW_SIZE.width, height: CHAT_WINDOW_SIZE.height };
  ignoreNextResize = true;
  window.yumikoOverlay.setWindowSize({
    width: CHAT_WINDOW_SIZE.width,
    height: CHAT_WINDOW_SIZE.height,
    anchor: 'bottom-right'
  });
}

function requestFitDebounced(reason = 'debounced') {
  window.clearTimeout(fitTimeout);
  fitTimeout = window.setTimeout(() => requestFit({ reason }), 50);
}

function updateFocusMinimumSize() {
  if (settings.mode !== 'focus') return;

  const setFocusMinSize = window.yumikoOverlay?.setFocusMinSize || window.yumikoOverlay?.setMinimumSize;
  if (!setFocusMinSize) return;

  const baseSize = getBaseSize();
  const baseWidth = baseSize?.baseW || 0;
  const baseHeight = baseSize?.baseH || 0;

  if (hasUnsafeCalculatedSize(baseWidth, baseHeight)) {
    if (minSizeRetryCount >= MINI_MIN_SIZE_RETRY_LIMIT) {
      console.warn('[yumiko][fit] minimum size measurement failed after retries');
      return;
    }

    minSizeRetryCount += 1;
    window.requestAnimationFrame(() => updateFocusMinimumSize());
    return;
  }

  const minW = Math.ceil((baseWidth * MINI_SCALE_MIN) + (MINI_BOUNDS_PADDING * 2));
  const minH = Math.ceil((baseHeight * MINI_SCALE_MIN) + (MINI_BOUNDS_PADDING * 2));

  if (hasUnsafeCalculatedSize(minW, minH)) {
    return;
  }

  minSizeRetryCount = 0;
  setFocusMinSize({ width: minW, height: minH });
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
    input?.focus();
  } else {
    closeSettingsPanel();
  }

  if (source === 'ui' || source === 'hotkey') {
    notifyHostMode(mode);
  }

  if (mode === 'focus') {
    window.requestAnimationFrame(() => {
      setMiniScale(userScale, { persist: false });
    });
  } else {
    requestFitDebounced();
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
  if (clickThroughToggle) clickThroughToggle.checked = Boolean(state.clickThroughPreferred ?? state.clickThroughEnabled);
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
  window.yumikoOverlay?.setClickThroughEnabled?.(clickThroughToggle.checked);
  if (settings.mode === 'chat') {
    addMessage('assistant', 'Se aplicará al cerrar el chat (ESC)');
  }
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

function adjustMiniScale(delta) {
  if (settings.mode !== 'focus') return;
  setMiniScale((userScale || 1) + delta);
}

function panicResetRendererState() {
  console.info('PANIC RESET');
  localStorage.removeItem('miniScale');
  localStorage.removeItem(MINI_SCALE_KEY);
  settings = { ...settings, mode: 'focus' };
  setMiniScale(1, { persist: true });
  setMode('focus', { source: 'panic-reset' });

  const schedulePanicFit = () => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => requestFitDebounced('panic')));
  };

  if (img && !img.complete) {
    img.addEventListener('load', schedulePanicFit, { once: true });
    window.setTimeout(schedulePanicFit, 150);
    return;
  }

  schedulePanicFit();
}

window.addEventListener('wheel', (event) => {
  if (!event.ctrlKey || widget?.dataset.mode !== 'focus') return;
  event.preventDefault();
  adjustMiniScale(event.deltaY < 0 ? 0.05 : -0.05);
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    panicResetRendererState();
    return;
  }

  if (!event.ctrlKey || settings.mode !== 'focus') return;

  if (event.key === '0') {
    event.preventDefault();
    setMiniScale(1);
    return;
  }

  if (event.key === '+' || event.key === '=' || event.key === '/') {
    event.preventDefault();
    adjustMiniScale(0.05);
    return;
  }

  if (event.key === '-') {
    event.preventDefault();
    adjustMiniScale(-0.05);
  }
});

window.addEventListener('resize', () => {
  if (settings.mode !== 'focus') return;

  if (ignoreNextResize) {
    ignoreNextResize = false;
    return;
  }

  updateFocusMinimumSize();
  const previousScale = effectiveScale;
  applyScale('resize', { shouldRequestFit: false });

  if (Math.abs(previousScale - effectiveScale) > 0.001) {
    requestFitDebounced('resize:auto-fit');
    return;
  }

  requestFitDebounced('resize');
});

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
  setMiniScale(userScale, { persist: false });

  if (img) {
    if (img.complete) {
      requestFitDebounced();
    } else {
      img.addEventListener('load', requestFitDebounced, { once: true });
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => requestFitDebounced());
    if (mini) resizeObserver.observe(mini);
    if (miniWrap) resizeObserver.observe(miniWrap);
    if (miniActions) resizeObserver.observe(miniActions);
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
  window.addEventListener('yumiko:panic-reset', () => {
    panicResetRendererState();
  });
  window.addEventListener('yumiko:mini-scale', (event) => {
    const payload = event?.detail || {};
    if (payload.set != null) {
      setMiniScale(payload.set);
      return;
    }
    if (payload.delta != null) {
      setMiniScale(userScale + payload.delta);
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
  miniBaseSize = measureMiniBaseSize();
  if (miniBaseSize?.shouldResetScale) {
    setMiniScale(1);
  } else {
    applyScale('init', { shouldRequestFit: false });
  }
  loadChatHistory();
});
