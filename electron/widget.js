console.log('SOURCE_WIDGET_JS_RUNNING', {
  href: window.location.href,
  isPackagedLikely: window.location.href.includes('app.asar')
});

const STORAGE_KEY = 'yumiko-widget-settings-v1';
const MINI_SCALE_KEY = 'yumiko_mini_scale_v1';
const DEFAULT_SETTINGS = {
  mode: 'focus',
  autoMessageEnabled: false,
  autoMessageIntervalMinutes: 20
};
const AUTO_MESSAGE_INTERVAL_OPTIONS = [1, 2, 5, 10, 20];
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
const AUTO_MESSAGE_MIN_TICK_MS = 5 * 1000;
const AUTO_MESSAGE_MAX_TICK_MS = 10 * 1000;
const DEV_AUTO_MESSAGE_LOG = true;
const AUTO_ACTIVITY_MODE_KEY = 'yumiko_auto_message_recent_activity_mode';
const AUTO_ACTIVITY_WEAK_WINDOW_KEY = 'yumiko_auto_message_weak_activity_ms';
const DEFAULT_CHAT_HOTKEY = 'Control+Shift+J';

const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');
const quitAppButton = document.getElementById('quit-app');
const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const shortcutsToggle = document.getElementById('shortcuts-enabled');
const chatHotkeyInput = document.getElementById('chat-hotkey');
const chatHotkeySaveButton = document.getElementById('chat-hotkey-save');
const chatHotkeyResetButton = document.getElementById('chat-hotkey-reset');
const chatHotkeyError = document.getElementById('chat-hotkey-error');
const authStatus = document.getElementById('auth-status');
const authActionButton = document.getElementById('auth-action');
const autoMessageToggle = document.getElementById('auto-message-enabled');
const autoMessageIntervalSelect = document.getElementById('auto-message-interval');

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
const bubbleLayer = document.getElementById('yumiko-bubble-layer');
const bubble = document.getElementById('yumiko-bubble');
const bubbleText = bubble?.querySelector('.bubble-text');

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
    parsed.autoMessageEnabled = Boolean(parsed.autoMessageEnabled);
    const parsedInterval = Number(parsed.autoMessageIntervalMinutes);
    parsed.autoMessageIntervalMinutes = AUTO_MESSAGE_INTERVAL_OPTIONS.includes(parsedInterval) ? parsedInterval : 20;
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
let bubbleHideTimer = null;
let bubbleRepositionRaf = null;

function clampToViewport(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function positionBubble() {
  if (!bubbleLayer || !bubble || !mini || settings.mode !== 'focus') return;

  const yumikoRect = (img?.getBoundingClientRect?.() || mini.getBoundingClientRect());
  if (!yumikoRect || yumikoRect.width <= 0 || yumikoRect.height <= 0) return;

  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleWidth = Math.max(170, Math.round(bubbleRect.width || 210));
  const bubbleHeight = Math.max(56, Math.round(bubbleRect.height || 92));

  const desiredLeft = (yumikoRect.left + (yumikoRect.width * 0.5)) - (bubbleWidth * 0.5);
  const desiredTop = yumikoRect.top + (yumikoRect.height * 0.64);

  const minLeft = 10;
  const maxLeft = Math.max(minLeft, window.innerWidth - bubbleWidth - 10);
  const minTop = Math.min(
    Math.max(10, yumikoRect.top + (yumikoRect.height * 0.48)),
    Math.max(10, window.innerHeight - bubbleHeight - 10)
  );
  const maxTop = Math.max(minTop, window.innerHeight - bubbleHeight - 10);

  const nextLeft = clampToViewport(desiredLeft, minLeft, maxLeft);
  const nextTop = clampToViewport(desiredTop, minTop, maxTop);

  bubbleLayer.style.left = `${nextLeft}px`;
  bubbleLayer.style.top = `${nextTop}px`;

  const positionedRect = bubble.getBoundingClientRect();
  console.info('[yumiko][bubble] show:positioned', {
    top: nextTop,
    left: nextLeft,
    width: bubbleWidth,
    height: bubbleHeight,
    maxWidth: bubble.style.maxWidth || null,
    boundingRect: {
      top: positionedRect.top,
      left: positionedRect.left,
      right: positionedRect.right,
      bottom: positionedRect.bottom,
      width: positionedRect.width,
      height: positionedRect.height
    }
  });
}

function scheduleBubblePosition() {
  if (!bubble || !bubbleLayer) return;
  if (bubbleRepositionRaf != null) window.cancelAnimationFrame(bubbleRepositionRaf);
  bubbleRepositionRaf = window.requestAnimationFrame(() => {
    bubbleRepositionRaf = null;
    positionBubble();
  });
}
let autoMessageScheduler = null;
let isNudgeInFlight = false;
let lastStrongUserActivityAt = Date.now();
let lastWeakUserActivityAt = 0;

function getRecentActivityMode() {
  if (window.location.search.includes('auto_message_mode=ignore') || localStorage.getItem(AUTO_ACTIVITY_MODE_KEY) === 'ignore') {
    return 'ignore';
  }
  if (window.location.search.includes('auto_message_mode=relaxed') || localStorage.getItem(AUTO_ACTIVITY_MODE_KEY) === 'relaxed') {
    return 'relaxed';
  }
  return 'normal';
}

function getWeakActivityWindowMs(intervalMs, mode) {
  const configuredMs = Number(localStorage.getItem(AUTO_ACTIVITY_WEAK_WINDOW_KEY));
  if (Number.isFinite(configuredMs) && configuredMs >= 0) {
    return configuredMs;
  }
  if (mode === 'relaxed') {
    return Math.min(7 * 1000, Math.round(intervalMs * 0.08));
  }
  return Math.min(20 * 1000, Math.round(intervalMs * 0.2));
}

function logAutoMessageDebug(label, payload = {}) {
  if (!DEV_AUTO_MESSAGE_LOG) return;
  console.info(`[yumiko][auto-message][debug] ${label}`, payload);
}

function clearAutoMessageScheduler() {
  if (autoMessageScheduler) {
    window.clearTimeout(autoMessageScheduler);
    autoMessageScheduler = null;
  }
}

function getBubbleComputedStyleSnapshot() {
  if (!bubble) return {};
  const computed = window.getComputedStyle(bubble);
  return {
    opacity: computed.opacity,
    visibility: computed.visibility,
    display: computed.display,
    zIndex: computed.zIndex
  };
}

function getAutoMessageDueInfo() {
  const intervalMinutes = Number(settings.autoMessageIntervalMinutes) || 20;
  const intervalMs = intervalMinutes * 60 * 1000;
  const mode = getRecentActivityMode();
  const strongThresholdMs = mode === 'ignore'
    ? 0
    : mode === 'relaxed'
      ? Math.min(20 * 1000, Math.round(intervalMs * 0.25))
      : intervalMs;
  const weakThresholdMs = mode === 'ignore' ? 0 : getWeakActivityWindowMs(intervalMs, mode);

  const strongDueAt = lastStrongUserActivityAt + strongThresholdMs;
  const weakDueAt = lastWeakUserActivityAt + weakThresholdMs;
  const now = Date.now();
  return {
    now,
    intervalMinutes,
    mode,
    intervalMs,
    strongThresholdMs,
    weakThresholdMs,
    strongDueAt,
    weakDueAt,
    strongRemainingMs: strongDueAt - now,
    weakRemainingMs: weakDueAt - now
  };
}

function getAutoMessageSkipReason() {
  if (!settings.autoMessageEnabled) return 'disabled';
  if (settings.mode === 'chat') return 'chat-open';
  if (isNudgeInFlight) return 'nudge-in-flight';

  const { strongRemainingMs, weakRemainingMs } = getAutoMessageDueInfo();
  if (strongRemainingMs > 0) return 'recent-user-activity:strong';
  if (weakRemainingMs > 0) return 'recent-user-activity:weak';
  return '';
}

function scheduleNextAutoMessageTick({ reason = 'unknown' } = {}) {
  clearAutoMessageScheduler();

  const {
    now,
    mode,
    strongDueAt,
    weakDueAt,
    strongRemainingMs,
    weakRemainingMs
  } = getAutoMessageDueInfo();
  const skipReason = getAutoMessageSkipReason();
  const remainingMs = skipReason === 'recent-user-activity:weak' ? weakRemainingMs : strongRemainingMs;
  const delayMs = skipReason.startsWith('recent-user-activity')
    ? clamp(remainingMs, AUTO_MESSAGE_MIN_TICK_MS, AUTO_MESSAGE_MAX_TICK_MS)
    : AUTO_MESSAGE_MIN_TICK_MS;

  autoMessageScheduler = window.setTimeout(runAutoMessageSchedulerTick, delayMs);

  logAutoMessageDebug('scheduler-scheduled', {
    reason,
    recentActivityMode: mode,
    schedulerTickInMs: delayMs,
    now: new Date(now).toISOString(),
    lastStrongUserActivityAt: new Date(lastStrongUserActivityAt).toISOString(),
    lastWeakUserActivityAt: lastWeakUserActivityAt ? new Date(lastWeakUserActivityAt).toISOString() : null,
    strongDueTime: new Date(strongDueAt).toISOString(),
    weakDueTime: new Date(weakDueAt).toISOString(),
    strongRemainingMs,
    weakRemainingMs,
    skipReason: skipReason || 'none'
  });
}

async function runAutoMessageSchedulerTick() {
  autoMessageScheduler = null;

  const {
    now,
    mode,
    strongDueAt,
    weakDueAt,
    strongRemainingMs,
    weakRemainingMs
  } = getAutoMessageDueInfo();
  const skipReason = getAutoMessageSkipReason();
  logAutoMessageDebug('scheduler-tick', {
    schedulerTick: 'run',
    recentActivityMode: mode,
    now: new Date(now).toISOString(),
    lastStrongUserActivityAt: new Date(lastStrongUserActivityAt).toISOString(),
    lastWeakUserActivityAt: lastWeakUserActivityAt ? new Date(lastWeakUserActivityAt).toISOString() : null,
    strongDueTime: new Date(strongDueAt).toISOString(),
    weakDueTime: new Date(weakDueAt).toISOString(),
    strongRemainingMs,
    weakRemainingMs,
    skipReason: skipReason || 'none'
  });

  if (skipReason) {
    if (skipReason.startsWith('recent-user-activity')) {
      const remainingMs = skipReason === 'recent-user-activity:weak' ? weakRemainingMs : strongRemainingMs;
      logAutoMessageDebug('skip-recent-user-activity', {
        skipReason,
        remainingMsUntilAllowed: Math.max(0, remainingMs),
        lastStrongUserActivityAt: new Date(lastStrongUserActivityAt).toISOString(),
        lastWeakUserActivityAt: lastWeakUserActivityAt ? new Date(lastWeakUserActivityAt).toISOString() : null
      });
    }
    scheduleNextAutoMessageTick({ reason: `skip:${skipReason}` });
    return;
  }

  await requestAutoNudge();
  scheduleNextAutoMessageTick({ reason: 'post-request' });
}


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
        window.yumikoOverlay.setWindowSize({ width, height, preservePosition: true });
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
        window.yumikoOverlay.setWindowSize({ width: cachedW, height: cachedH, preservePosition: true });
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
    window.yumikoOverlay.setWindowSize({ width, height, preservePosition: true });
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
    preservePosition: true
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

function hideBubble(reason = 'unspecified') {
  window.clearTimeout(bubbleHideTimer);
  bubbleHideTimer = null;
  if (!bubble) return;
  console.info(`[yumiko][bubble] hide reason=${reason}`, {
    mode: settings.mode
  });
  console.info('[yumiko][bubble] hide', {
    reason,
    mode: settings.mode,
    className: bubble.className,
    computedStyle: getBubbleComputedStyleSnapshot()
  });
  bubble.classList.remove('visible');
  bubble.classList.add('hidden');
  console.info('[yumiko][bubble] show:classes', {
    phase: 'hide',
    className: bubble.className,
    computedStyle: getBubbleComputedStyleSnapshot()
  });
}

function showBubble(text, duration = 8000) {
  if (!bubble || !bubbleText) return;
  const safeText = typeof text === 'string' ? text.trim() : '';
  if (!safeText) {
    hideBubble('empty-text');
    return;
  }

  console.info('[yumiko][bubble] show:start', {
    text: safeText,
    duration,
    className: bubble.className,
    mode: settings.mode
  });

  window.clearTimeout(bubbleHideTimer);
  bubbleText.textContent = safeText;
  bubble.classList.remove('hidden');
  scheduleBubblePosition();
  bubble.classList.add('visible');
  console.info('[yumiko][bubble] show:classes', {
    phase: 'show',
    className: bubble.className,
    computedStyle: getBubbleComputedStyleSnapshot()
  });

  const timeoutMs = Number.isFinite(Number(duration)) ? Number(duration) : 8000;
  bubbleHideTimer = window.setTimeout(() => {
    hideBubble('timeout');
  }, Math.max(1000, timeoutMs));
}

function markUserActivity({ event = 'unknown', strength = 'strong' } = {}) {
  const now = Date.now();
  if (strength === 'weak') {
    lastWeakUserActivityAt = now;
  } else {
    lastStrongUserActivityAt = now;
    lastWeakUserActivityAt = now;
  }

  const dueInfo = getAutoMessageDueInfo();
  logAutoMessageDebug('user-activity-updated', {
    event,
    strength,
    now: new Date(now).toISOString(),
    recentActivityMode: dueInfo.mode,
    lastStrongUserActivityAt: new Date(lastStrongUserActivityAt).toISOString(),
    lastWeakUserActivityAt: lastWeakUserActivityAt ? new Date(lastWeakUserActivityAt).toISOString() : null,
    strongDueTime: new Date(dueInfo.strongDueAt).toISOString(),
    weakDueTime: new Date(dueInfo.weakDueAt).toISOString(),
    strongRemainingMs: dueInfo.strongRemainingMs,
    weakRemainingMs: dueInfo.weakRemainingMs
  });
  scheduleNextAutoMessageTick({ reason: `user-activity:${strength}:${event}` });
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

function focusChatInputReliable({ reason = 'unknown', sendAck = false } = {}) {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      if (!input) return;
      console.info('[yumiko][renderer] input focus attempted', { reason });
      input.focus();
      const end = input.value?.length || 0;
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(end, end);
      }
      const focused = document.activeElement === input;
      console.info('[yumiko][renderer] input focus success', { reason, focused });
      if (sendAck) {
        window.yumikoOverlay?.chatReady?.();
      }
    }, 0);
  });
}

function setMode(nextMode, { source = 'ui' } = {}) {
  const mode = toUiMode(nextMode);
  const previousMode = settings.mode;
  if (settings.mode === mode && source !== 'state-sync') {
    console.info('[yumiko][route] setMode noop', { mode, source });
  } else {
    console.info('[yumiko][route] setMode', { previousMode: settings.mode, nextMode: mode, source });
  }

  if (previousMode !== mode) {
    console.info('[yumiko][mode] change', {
      previousMode,
      nextMode: mode,
      source
    });
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
    hideBubble();
    markUserActivity({ event: 'open-chat-mode', strength: 'strong' });
    hideBubble('chat-open');
    markUserActivity();
    focusChatInputReliable({ reason: `setMode:${source}` });
  } else {
    closeSettingsPanel();
    scheduleBubblePosition();
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

function normalizeHistoryRecords(result) {
  const records = Array.isArray(result?.records)
    ? result.records
    : Array.isArray(result?.messages)
      ? result.messages
      : [];

  return records
    .map(({ sender, role, content }) => ({
      role: sender === 'user' || role === 'user' ? 'user' : 'assistant',
      content: typeof content === 'string' ? content.trim() : ''
    }))
    .filter((item) => item.content);
}

function findLatestAssistantAfterBaseline(messages, baselineSize, baselineTail) {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  const latestAssistant = [...messages].reverse().find((item) => item?.role === 'assistant' && item.content);
  if (!latestAssistant?.content) return '';

  if (messages.length > baselineSize) {
    return latestAssistant.content;
  }

  if (!baselineTail.includes(latestAssistant.content)) {
    return latestAssistant.content;
  }

  return '';
}

async function submitMessage() {
  if (!input || isThinking) return;
  const message = input.value.trim();
  if (!message) return;

  markUserActivity({ event: 'submit-message', strength: 'strong' });
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

    if (settings.mode === 'focus') {
      showBubble(reply);
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

async function persistAutoMessageSettings() {
  try {
    await window.yumikoOverlay?.chat?.updateNudgeSettings?.({
      enabled: settings.autoMessageEnabled,
      intervalMinutes: settings.autoMessageIntervalMinutes
    });
  } catch (error) {
    console.warn('[yumiko][auto-message] settings sync failed', error);
  }
}

function syncAutoMessageControls() {
  if (autoMessageToggle) autoMessageToggle.checked = Boolean(settings.autoMessageEnabled);
  if (autoMessageIntervalSelect) {
    autoMessageIntervalSelect.value = String(settings.autoMessageIntervalMinutes || 20);
  }
}

async function requestAutoNudge() {
  if (isNudgeInFlight || !window.yumikoOverlay?.chat?.requestNudge) return;
  isNudgeInFlight = true;
  try {
    const baselineContextSize = contextCache.length;
    const baselineAssistantTail = contextCache
      .filter((item) => item?.role === 'assistant' && typeof item.content === 'string' && item.content.trim())
      .slice(-5)
      .map((item) => item.content.trim());

    console.info('[yumiko][nudge] real-flow:start', {
      now: new Date().toISOString(),
      mode: settings.mode,
      autoMessageEnabled: settings.autoMessageEnabled,
      intervalMinutes: settings.autoMessageIntervalMinutes,
      baselineContextSize,
      baselineAssistantTail
    });

    const result = await window.yumikoOverlay.chat.requestNudge({
      intervalMinutes: settings.autoMessageIntervalMinutes
    });
    let message = typeof result?.message === 'string' && result.message.trim()
      ? result.message.trim()
      : '';

    let messageSource = message ? 'request-nudge-response' : 'history-confirmation';

    if (!message) {
      const historyResult = await window.yumikoOverlay?.chat?.getHistory?.();
      const historyMessages = normalizeHistoryRecords(historyResult);
      message = findLatestAssistantAfterBaseline(historyMessages, baselineContextSize, baselineAssistantTail);
      if (historyMessages.length > 0) {
        contextCache = historyMessages.slice(-20);
      }
      if (!message) {
        messageSource = 'none';
      }
    }

    console.info('[yumiko][nudge] real-flow:result', {
      response: result,
      message: message || null,
      messageSource
    });

    if (message) {
      const resolvedMode = toUiMode(settings.mode);
      const bubbleDuration = 10000;
      console.info('[yumiko][bubble] auto-show dispatched', {
        message,
        duration: bubbleDuration,
        mode: resolvedMode
      });

      if (resolvedMode === 'chat') {
        console.info('[yumiko][bubble] auto-show skipped reason=mode-chat', {
          message,
          mode: resolvedMode
        });
      } else {
        console.info('[yumiko][bubble] auto-show executed', {
          message,
          duration: bubbleDuration,
          mode: resolvedMode
        });
        showBubble(message, bubbleDuration);
      }
      if (!contextCache.some((item, index) => (
        item?.role === 'assistant'
        && item?.content === message
        && index >= Math.max(0, contextCache.length - 5)
      ))) {
        contextCache.push({ role: 'assistant', content: message });
        contextCache = contextCache.slice(-20);
      }
      if (resolvedMode === 'chat') {
        addMessage('assistant', message);
      }
    } else {
      console.info('[yumiko][bubble] auto-show skipped reason=empty-message', {
        mode: toUiMode(settings.mode),
        message: result?.message ?? null
      });
    }
  } catch (error) {
    console.warn('[yumiko][auto-message] nudge failed', error);
  } finally {
    isNudgeInFlight = false;
  }
}

function startAutoMessageScheduler() {
  scheduleNextAutoMessageTick({ reason: 'start' });
}

function renderChatHotkeyError(message = '') {
  if (!chatHotkeyError) return;
  const text = typeof message === 'string' ? message.trim() : '';
  chatHotkeyError.textContent = text;
  chatHotkeyError.hidden = !text;
}

async function persistChatHotkey(hotkey) {
  const normalized = typeof hotkey === 'string' && hotkey.trim() ? hotkey.trim() : DEFAULT_CHAT_HOTKEY;
  const result = await window.yumikoOverlay?.setChatHotkey?.(normalized);
  if (chatHotkeyInput) {
    chatHotkeyInput.value = result?.hotkey || normalized;
  }
  renderChatHotkeyError(result?.error || '');
}

function syncHostState(state = {}) {
  console.info('[yumiko][renderer] state updated', { authState: state?.authState });
  renderAuthState(state);
  if (overlayToggle) overlayToggle.checked = Boolean(state.overlayEnabled);
  if (clickThroughToggle) clickThroughToggle.checked = Boolean(state.clickThroughPreferred ?? state.clickThroughEnabled);
  if (shortcutsToggle) shortcutsToggle.checked = Boolean(state.shortcutsEnabled);
  if (chatHotkeyInput) chatHotkeyInput.value = state.chatHotkey || DEFAULT_CHAT_HOTKEY;
  renderChatHotkeyError(state.shortcutRegistrationError || '');

  if (state.mode) {
    setMode(state.mode, { source: 'state-sync' });
  }

  syncAutoMessageControls();
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

chatHotkeySaveButton?.addEventListener('click', async () => {
  try {
    await persistChatHotkey(chatHotkeyInput?.value || DEFAULT_CHAT_HOTKEY);
  } catch (error) {
    renderChatHotkeyError(error instanceof Error ? error.message : String(error));
  }
});

chatHotkeyInput?.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  try {
    await persistChatHotkey(chatHotkeyInput?.value || DEFAULT_CHAT_HOTKEY);
  } catch (error) {
    renderChatHotkeyError(error instanceof Error ? error.message : String(error));
  }
});

chatHotkeyResetButton?.addEventListener('click', async () => {
  try {
    await persistChatHotkey(DEFAULT_CHAT_HOTKEY);
  } catch (error) {
    renderChatHotkeyError(error instanceof Error ? error.message : String(error));
  }
});

autoMessageToggle?.addEventListener('change', () => {
  settings.autoMessageEnabled = autoMessageToggle.checked;
  saveSettings();
  markUserActivity({ event: 'toggle-auto-message-enabled', strength: 'weak' });
  persistAutoMessageSettings();
});

autoMessageIntervalSelect?.addEventListener('change', () => {
  const nextValue = Number(autoMessageIntervalSelect.value);
  settings.autoMessageIntervalMinutes = AUTO_MESSAGE_INTERVAL_OPTIONS.includes(nextValue) ? nextValue : 20;
  saveSettings();
  markUserActivity({ event: 'change-auto-message-interval', strength: 'weak' });
  persistAutoMessageSettings();
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
  markUserActivity({ event: 'mini-chat-button', strength: 'strong' });
  setMode('chat', { source: 'ui' });
  focusChatInputReliable({ reason: 'mini-chat-button' });
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


window.addEventListener('mousedown', () => {
  markUserActivity({ event: 'window-mousedown', strength: 'weak' });
}, { capture: true });

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
  scheduleBubblePosition();
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
  requestFit,
  showBubble,
  hideBubble
};

window.addEventListener('DOMContentLoaded', () => {
  setSettingsPanelHidden(true);
  setMiniScale(userScale, { persist: false });
  syncAutoMessageControls();
  startAutoMessageScheduler();
  persistAutoMessageSettings();

  if (img) {
    if (img.complete) {
      requestFitDebounced();
      scheduleBubblePosition();
    } else {
      img.addEventListener('load', () => {
        requestFitDebounced();
        scheduleBubblePosition();
      }, { once: true });
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      requestFitDebounced();
      scheduleBubblePosition();
    });
    if (mini) resizeObserver.observe(mini);
    if (miniWrap) resizeObserver.observe(miniWrap);
    if (miniActions) resizeObserver.observe(miniActions);
    if (chat) resizeObserver.observe(chat);
  }

  window.yumikoOverlay?.onStateUpdated?.(syncHostState);
  window.yumikoOverlay?.onFocusInput?.(() => {
    setMode('chat', { source: 'state-sync' });
    focusChatInputReliable({ reason: 'main:focus-input' });
  });
  window.yumikoOverlay?.onOpenChatFromHotkey?.((payload) => {
    const alreadyInChat = Boolean(payload?.alreadyInChat);
    console.info('[yumiko][renderer] chat mode entered', { source: 'hotkey', alreadyInChat });
    setMode('chat', { source: 'hotkey' });
    focusChatInputReliable({ reason: alreadyInChat ? 'hotkey:already-chat' : 'hotkey:open-chat', sendAck: true });
  });
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
  scheduleBubblePosition();
  miniBaseSize = measureMiniBaseSize();
  if (miniBaseSize?.shouldResetScale) {
    setMiniScale(1);
  } else {
    applyScale('init', { shouldRequestFit: false });
  }
  loadChatHistory();
});
