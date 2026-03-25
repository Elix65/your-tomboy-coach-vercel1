const STORAGE_KEY = 'yumiko-widget-settings-v1';
const DEFAULT_SETTINGS = {
  mode: 'focus',
  autoMessageEnabled: false,
  autoMessageIntervalMinutes: 20,
  sideImageMode: 'auto',
  overlayScale: 1
};
const AUTO_MESSAGE_INTERVAL_OPTIONS = [1, 2, 5, 10, 20];
const RECENT_FOCUS_REPLY_CARRY_WINDOW_MS = 7000;
const SCENE_WINDOW_SIZE = { width: 600, height: 700 };
const OVERLAY_SCALE_MIN = 0.75;
const OVERLAY_SCALE_MAX = 1.15;
const OVERLAY_SCALE_STEP = 0.05;
const MINI_BASE_FALLBACK = { width: 360, height: 520 };
const MINI_BOUNDS_PADDING_X = 6;
const MINI_BOUNDS_PADDING_Y = 4;
const MINI_MIN_WIDTH = 260;
const MINI_MIN_HEIGHT = 300;
const FOOTPRINT_PADDING = 10;
const MINI_RETRY_LIMIT = 10;
const MINI_MIN_SIZE_RETRY_LIMIT = 5;
const DEV_FIT_LOG = window.location.search.includes('dev=1') || localStorage.getItem('yumiko_debug_fit') === '1';
const AUTO_MESSAGE_MIN_TICK_MS = 5 * 1000;
const AUTO_MESSAGE_MAX_TICK_MS = 10 * 1000;
const DEV_AUTO_MESSAGE_LOG = false;
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
const sideImageModeSelect = document.getElementById('side-image-mode');
const overlayScaleInput = document.getElementById('overlay-scale');
const overlayScaleValue = document.getElementById('overlay-scale-value');
const overlayScaleResetButton = document.getElementById('overlay-scale-reset');
const selectShells = Array.from(document.querySelectorAll('.select-shell'));

const widget = document.getElementById('yumiko-widget');
const scene = document.getElementById('overlay-scene');
const mini = document.getElementById('yumiko-mini');
const miniWrap = document.getElementById('mini-wrap');
const miniActions = document.querySelector('.conversation-band__controls');
const miniChatButton = document.getElementById('mini-chat');
const miniMicButton = document.getElementById('mini-mic');
const chat = document.getElementById('yumiko-chat');
const img = document.getElementById('yumiko-character');
const input = document.getElementById('yumiko-input');
const send = document.getElementById('yumiko-send');
const chatLog = document.getElementById('chat-log');
const chatPanelTitle = document.getElementById('chat-panel-title');
const chatPanelStatus = document.getElementById('chat-panel-status');

const INTERACTIVE_ISLAND_SELECTOR = [
  '#yumiko-chat',
  '#settings-panel',
  '#toggle-settings',
  '#quit-app',
  '#yumiko-input',
  '#yumiko-send',
  '#mini-chat',
  '#mini-mic',
  '.panel-settings-btn',
  '.panel-btn',
  '.icon-btn',
  '.mini-btn',
  '.custom-select',
  '.custom-select__option',
  'button',
  'input',
  'select',
  'textarea',
  'a[href]',
  '#yumiko-mini',
  '#drag-region'
].join(', ');

let hostAllowsDynamicClickThrough = false;
let hoverInteractiveRegionActive = true;

const CHARACTER_SRC_WHEN_WINDOW_ON_LEFT = 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/fase-1.png';
const CHARACTER_SRC_WHEN_WINDOW_ON_RIGHT = 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/overlay1.png';
const SIDE_SWITCH_HYSTERESIS_PX = 48;

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
    parsed.sideImageMode = normalizeSideImageMode(parsed.sideImageMode);
    parsed.overlayScale = normalizeOverlayScale(parsed.overlayScale);
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeSideImageMode(value) {
  return value === 'left' || value === 'right' ? value : 'auto';
}


function normalizeOverlayScale(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.overlayScale;
  const clamped = clamp(parsed, OVERLAY_SCALE_MIN, OVERLAY_SCALE_MAX);
  return Number((Math.round(clamped / OVERLAY_SCALE_STEP) * OVERLAY_SCALE_STEP).toFixed(2));
}


let settings = loadSettings();
let userScale = normalizeOverlayScale(settings.overlayScale);
let effectiveScale = userScale;
let resizeObserver;
let fitTimeout = null;
let lastFitRequest = { mode: '', width: 0, height: 0 };
let miniBaseSize = null;
let fitRetryCount = 0;
let minSizeRetryCount = 0;
let lastGoodFocusFitSize = null;
let lastMeasuredFootprint = null;
let ignoreNextResize = false;
let assistantMessageSequence = 0;
let lastAssistantMessageId = '';
let lastAssistantMessageAt = 0;
let lastAssistantMessageText = '';
let pendingAssistantReplyAfterUserMessage = false;
let activeCharacterSide = null;
let pendingCharacterSwapToken = 0;
const preloadedCharacterImages = new Map();
let lastKnownBounds = null;
let lastLocalModeIntent = {
  mode: toUiMode(settings.mode),
  source: 'init',
  at: 0
};
const OVERLAY_BASE_SIZE = Object.freeze({
  width: SCENE_WINDOW_SIZE.width,
  height: SCENE_WINDOW_SIZE.height
});

function clampToViewport(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function preloadCharacterImage(src) {
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  if (!normalizedSrc) return Promise.resolve();
  if (preloadedCharacterImages.has(normalizedSrc)) {
    return preloadedCharacterImages.get(normalizedSrc);
  }

  const preloadPromise = new Promise((resolve) => {
    const preloadImg = new Image();
    preloadImg.decoding = 'async';
    preloadImg.src = normalizedSrc;
    const done = () => resolve();
    if (preloadImg.decode) {
      preloadImg.decode().then(done).catch(done);
      return;
    }
    preloadImg.addEventListener('load', done, { once: true });
    preloadImg.addEventListener('error', done, { once: true });
  });

  preloadedCharacterImages.set(normalizedSrc, preloadPromise);
  return preloadPromise;
}

function resolveCharacterSideFromBounds(bounds) {
  const width = Number(bounds?.width);
  const x = Number(bounds?.x);
  if (!Number.isFinite(width) || !Number.isFinite(x) || width <= 0) {
    return activeCharacterSide || 'right-screen';
  }

  const overlayCenterX = x + (width / 2);
  const screenCenterX = window.screen.availLeft + (window.screen.availWidth / 2);
  const delta = overlayCenterX - screenCenterX;

  if (activeCharacterSide === 'left-screen') {
    return delta > SIDE_SWITCH_HYSTERESIS_PX ? 'right-screen' : 'left-screen';
  }
  if (activeCharacterSide === 'right-screen') {
    return delta < -SIDE_SWITCH_HYSTERESIS_PX ? 'left-screen' : 'right-screen';
  }

  return delta < 0 ? 'left-screen' : 'right-screen';
}

function updateCharacterImageForBounds(bounds, { force = false } = {}) {
  if (!img) return;

  const sideImageMode = normalizeSideImageMode(settings.sideImageMode);
  const resolvedSide = sideImageMode === 'auto'
    ? resolveCharacterSideFromBounds(bounds)
    : (sideImageMode === 'left' ? 'left-screen' : 'right-screen');

  if (!force && resolvedSide === activeCharacterSide) return;

  const nextSrc = resolvedSide === 'left-screen'
    ? CHARACTER_SRC_WHEN_WINDOW_ON_LEFT
    : CHARACTER_SRC_WHEN_WINDOW_ON_RIGHT;
  const normalizedCurrent = img.currentSrc || img.src || '';

  const width = Number(bounds?.width);
  const x = Number(bounds?.x);
  const windowCenterX = Number.isFinite(width) && Number.isFinite(x) ? x + (width / 2) : null;
  const screenCenterX = window.screen.availLeft + (window.screen.availWidth / 2);
  console.info('[yumiko][image-side] resolve', {
    windowCenterX,
    screenCenterX,
    resolvedSide,
    sideImageMode,
    chosenImageSrc: nextSrc
  });

  if (!force && normalizedCurrent === nextSrc) {
    activeCharacterSide = resolvedSide;
    return;
  }

  activeCharacterSide = resolvedSide;
  const swapToken = ++pendingCharacterSwapToken;

  preloadCharacterImage(nextSrc).finally(() => {
    if (!img || swapToken !== pendingCharacterSwapToken) return;

    img.classList.add('is-swapping');
    window.requestAnimationFrame(() => {
      if (!img || swapToken !== pendingCharacterSwapToken) return;
      img.src = nextSrc;
      img.classList.remove('is-swapping');
    });
  });
}

function positionBubble() {
  return;
}

function scheduleBubblePosition() {
  return;
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
  return {};
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
  if (isNudgeInFlight) return 'nudge-in-flight';
  return '';
}

function scheduleNextAutoMessageTick({ reason = 'unknown' } = {}) {
  clearAutoMessageScheduler();
  const delayMs = AUTO_MESSAGE_MIN_TICK_MS;
  autoMessageScheduler = window.setTimeout(runAutoMessageSchedulerTick, delayMs);

  logAutoMessageDebug('scheduler-scheduled', {
    reason,
    schedulerTickInMs: delayMs,
    skipReason: getAutoMessageSkipReason() || 'none'
  });
}

async function runAutoMessageSchedulerTick() {
  autoMessageScheduler = null;
  const skipReason = getAutoMessageSkipReason();

  if (skipReason) {
    scheduleNextAutoMessageTick({ reason: `skip:${skipReason}` });
    return;
  }

  const nudgeResult = await requestAutoNudge();
  scheduleNextAutoMessageTick({ reason: 'post-request' });
}


function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyScale(source = 'unknown', { shouldRequestFit = true } = {}) {
  const baseW = OVERLAY_BASE_SIZE.width;
  const baseH = OVERLAY_BASE_SIZE.height;
  const shouldClampToViewport = source === 'resize';
  let fitScale = OVERLAY_SCALE_MAX;

  if (shouldClampToViewport && baseW > 0 && baseH > 0) {
    fitScale = clamp(Math.min(window.innerWidth / baseW, window.innerHeight / baseH), OVERLAY_SCALE_MIN, OVERLAY_SCALE_MAX);
  }

  const nextEffectiveScale = Number(Math.min(userScale, fitScale).toFixed(2));
  const scaleChanged = Math.abs(nextEffectiveScale - effectiveScale) > 0.001;

  effectiveScale = nextEffectiveScale;
  document.documentElement.style.setProperty('--overlay-scale', String(effectiveScale));

  updateFocusMinimumSize();
  if (shouldRequestFit && (source === 'user' || scaleChanged)) {
    requestFitDebounced(`scale:${source}`);
  }
}

function syncOverlayScaleControls() {
  const normalizedPercent = Math.round((normalizeOverlayScale(userScale) || 1) * 100);
  if (overlayScaleInput) overlayScaleInput.value = String(normalizedPercent);
  if (overlayScaleValue) overlayScaleValue.textContent = `${normalizedPercent}%`;
}

function setOverlayScale(nextScale, { persist = true, shouldRequestFit = true, source = 'user' } = {}) {
  userScale = normalizeOverlayScale(nextScale);
  settings.overlayScale = userScale;
  syncOverlayScaleControls();

  if (persist) saveSettings();
  applyScale(source, { shouldRequestFit });
}

function getCurrentScale() {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--overlay-scale');
  const parsed = parseFloat(cssValue);
  return clamp(Number.isFinite(parsed) ? parsed : effectiveScale || 1, OVERLAY_SCALE_MIN, OVERLAY_SCALE_MAX);
}

function isNodeEffectivelyVisible(node) {
  if (!node || node.hidden) return false;
  const computed = window.getComputedStyle(node);
  return computed.display !== 'none' && computed.visibility !== 'hidden' && computed.opacity !== '0';
}

function getUnionRect() {
  const sceneNodes = [
    quitAppButton,
    img,
    chat,
    miniActions,
    settingsPanel && !settingsPanel.hidden ? settingsPanel : null
  ];

  const rects = sceneNodes
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

function getMeasuredFootprint() {
  const unionRect = getUnionRect();
  if (!unionRect || hasUnsafeCalculatedSize(unionRect.width, unionRect.height)) return null;

  return {
    width: Math.ceil(unionRect.width + (FOOTPRINT_PADDING * 2)),
    height: Math.ceil(unionRect.height + (FOOTPRINT_PADDING * 2)),
    offsetX: Math.floor(unionRect.left - FOOTPRINT_PADDING),
    offsetY: Math.floor(unionRect.top - FOOTPRINT_PADDING)
  };
}

function closeCustomSelects({ except = null } = {}) {
  selectShells.forEach((shell) => {
    if (!shell) return;
    const customSelect = shell.querySelector('.custom-select');
    if (!customSelect || customSelect === except) return;
    customSelect.classList.remove('is-open');
    customSelect.querySelector('.custom-select__trigger')?.setAttribute('aria-expanded', 'false');
  });
}

function syncCustomSelectUi(select, customSelect) {
  if (!select || !customSelect) return;

  const label = customSelect.querySelector('.custom-select__label');
  const options = Array.from(customSelect.querySelectorAll('.custom-select__option'));
  const selectedOption = Array.from(select.options).find((option) => option.value === select.value) || select.options[select.selectedIndex] || select.options[0];

  if (label) label.textContent = selectedOption?.textContent?.trim() || '';
  options.forEach((optionButton) => {
    const isSelected = optionButton.dataset.value === select.value;
    optionButton.classList.toggle('is-selected', isSelected);
    optionButton.setAttribute('aria-selected', String(isSelected));
  });
}

function enhanceSelect(select) {
  if (!select || select.dataset.enhanced === 'true') return null;

  const shell = select.closest('.select-shell');
  if (!shell) return null;

  const customSelect = document.createElement('div');
  customSelect.className = 'custom-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'custom-select__label';

  const caret = document.createElement('span');
  caret.className = 'custom-select__caret';
  caret.setAttribute('aria-hidden', 'true');

  trigger.append(label, caret);

  const menu = document.createElement('div');
  menu.className = 'custom-select__menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', select.getAttribute('aria-label') || select.id || 'Dropdown');

  Array.from(select.options).forEach((option) => {
    const optionButton = document.createElement('button');
    optionButton.type = 'button';
    optionButton.className = 'custom-select__option';
    optionButton.textContent = option.textContent || '';
    optionButton.dataset.value = option.value;
    optionButton.setAttribute('role', 'option');
    optionButton.addEventListener('click', () => {
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      syncCustomSelectUi(select, customSelect);
      customSelect.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
    menu.appendChild(optionButton);
  });

  trigger.addEventListener('click', () => {
    const willOpen = !customSelect.classList.contains('is-open');
    closeCustomSelects({ except: willOpen ? customSelect : null });
    customSelect.classList.toggle('is-open', willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    closeCustomSelects({ except: customSelect });
    customSelect.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('.custom-select__option.is-selected, .custom-select__option')?.focus();
  });

  customSelect.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    customSelect.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  });

  customSelect.addEventListener('focusin', () => {
    customSelect.classList.add('is-focused');
  });

  customSelect.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!customSelect.contains(document.activeElement)) {
        customSelect.classList.remove('is-focused');
        customSelect.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    }, 0);
  });

  select.addEventListener('change', () => syncCustomSelectUi(select, customSelect));

  customSelect.append(trigger, menu);
  shell.appendChild(customSelect);
  select.dataset.enhanced = 'true';
  syncCustomSelectUi(select, customSelect);
  return customSelect;
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

  updateFocusMinimumSize();

  const measured = getMeasuredFootprint();
  const fallbackWidth = Math.max(MINI_MIN_WIDTH, Math.ceil(OVERLAY_BASE_SIZE.width * effectiveScale));
  const fallbackHeight = Math.max(MINI_MIN_HEIGHT, Math.ceil(OVERLAY_BASE_SIZE.height * effectiveScale));
  const width = Math.max(MINI_MIN_WIDTH, measured?.width ?? fallbackWidth);
  const height = Math.max(MINI_MIN_HEIGHT, measured?.height ?? fallbackHeight);
  const offsetX = Number.isFinite(measured?.offsetX) ? measured.offsetX : 0;
  const offsetY = Number.isFinite(measured?.offsetY) ? measured.offsetY : 0;

  if (
    lastFitRequest.width === width &&
    lastFitRequest.height === height &&
    lastFitRequest.offsetX === offsetX &&
    lastFitRequest.offsetY === offsetY
  ) {
    return;
  }

  fitRetryCount = 0;
  lastGoodFocusFitSize = { width, height };
  lastMeasuredFootprint = measured;
  lastFitRequest = { mode: settings.mode, width, height, offsetX, offsetY };

  if (DEV_FIT_LOG) {
    console.log('[fit]', {
      mode: settings.mode,
      reason,
      retry,
      winW: width,
      winH: height,
      offsetX,
      offsetY
    });
  }

  ignoreNextResize = true;
  window.yumikoOverlay?.setMinimumSize?.({ width, height });
  if (window.yumikoOverlay?.setWindowFootprint) {
    window.yumikoOverlay.setWindowFootprint({ width, height, offsetX, offsetY });
  } else {
    window.yumikoOverlay.setWindowSize({
      width,
      height,
      preservePosition: true
    });
  }
}

function requestFitDebounced(reason = 'debounced') {
  window.clearTimeout(fitTimeout);
  fitTimeout = window.setTimeout(() => requestFit({ reason }), 50);
}

function updateFocusMinimumSize() {
  const setFocusMinSize = window.yumikoOverlay?.setFocusMinSize || window.yumikoOverlay?.setMinimumSize;
  if (!setFocusMinSize) return;

  const measured = lastMeasuredFootprint || getMeasuredFootprint();
  const baseWidth = measured?.width ?? (OVERLAY_BASE_SIZE.width * effectiveScale);
  const baseHeight = measured?.height ?? (OVERLAY_BASE_SIZE.height * effectiveScale);

  const minW = Math.max(Math.ceil(baseWidth), MINI_MIN_WIDTH);
  const minH = Math.max(Math.ceil(baseHeight), MINI_MIN_HEIGHT);

  if (hasUnsafeCalculatedSize(minW, minH)) {
    return;
  }

  minSizeRetryCount = 0;
  setFocusMinSize({ width: minW, height: minH });
}

function hideBubble() {
  return;
}

function showBubble() {
  return;
}

function normalizeAssistantMessageId(messageId = '', fallbackText = '') {
  const trimmedId = typeof messageId === 'string' ? messageId.trim() : '';
  if (trimmedId) return trimmedId;
  assistantMessageSequence += 1;
  const compactText = typeof fallbackText === 'string' ? fallbackText.trim().slice(0, 64) : '';
  return `assistant-${Date.now()}-${assistantMessageSequence}-${compactText}`;
}

function registerAssistantReplyForCarry({ text = '', messageId = '', at = Date.now() } = {}) {
  const safeText = typeof text === 'string' ? text.trim() : '';
  if (!safeText) return null;

  const normalizedId = normalizeAssistantMessageId(messageId, safeText);
  lastAssistantMessageId = normalizedId;
  lastAssistantMessageAt = Number.isFinite(Number(at)) ? Number(at) : Date.now();
  lastAssistantMessageText = safeText;

  console.info('[yumiko][reply-carry] assistant reply received', {
    messageId: normalizedId,
    at: new Date(lastAssistantMessageAt).toISOString(),
    mode: settings.mode
  });

  return {
    id: normalizedId,
    at: lastAssistantMessageAt,
    text: safeText
  };
}

function showStoredAssistantReplyInFocus() {
  pendingAssistantReplyAfterUserMessage = false;
  return false;
}

function handleAssistantReplyCarry({ text = '', messageId = '', at = Date.now() } = {}) {
  const stored = registerAssistantReplyForCarry({ text, messageId, at });
  if (!stored) return;

  if (settings.mode === 'focus') {
    pendingAssistantReplyAfterUserMessage = false;
    return;
  }

  if (pendingAssistantReplyAfterUserMessage) {
    console.info('[yumiko][reply-carry] stored for focus carry-over', {
      messageId: stored.id,
      at: new Date(stored.at).toISOString(),
      mode: settings.mode
    });
  }
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

function updateChatPanelChrome() {
  if (chatPanelTitle) {
    chatPanelTitle.textContent = 'Cerca de vos.';
  }

  if (!chatPanelStatus) return;

  const latestRow = chatLog?.lastElementChild;
  const latestMessage = latestRow?.querySelector('.chat-message')?.textContent?.trim() || '';

  if (latestMessage) {
    const compactMessage = latestMessage.replace(/\s+/g, ' ').slice(0, 132);
    chatPanelStatus.textContent = compactMessage;
    return;
  }

  chatPanelStatus.textContent = 'Un único panel abajo para leerla y responder con calma.';
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
  updateChatPanelChrome();
  return row;
}

function clearMessages() {
  if (!chatLog) return;
  chatLog.innerHTML = '';
  updateChatPanelChrome();
}

function renderMessages(messages = []) {
  clearMessages();
  let previousRole = '';

  messages.forEach(({ id, createdAt, role, content }, index) => {
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      if (role === 'assistant' && previousRole === 'assistant') {
        console.info('[yumiko][chat] detected grouped assistant messages reason=consecutive-assistant', {
          previousIndex: index - 1,
          index,
          messageId: id || null
        });
      }
      console.info('[yumiko][chat] rendering message id=' + String(id || `idx-${index}`), {
        index,
        role,
        createdAt: createdAt || null
      });
      addMessage(role, content);
      previousRole = role;
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
  updateChatPanelChrome();
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

function focusChatInputRobust({ reason = 'unknown', sendAck = false } = {}) {
  const tryFocus = (attempt = 'unknown') => {
    const chatInput = input || chat?.querySelector('textarea, input[type="text"], input:not([type])');
    if (!chatInput) {
      console.warn('[yumiko][renderer] input focus failed', { reason, attempt, missingInput: true });
      return false;
    }

    console.info('[yumiko][renderer] input focus attempt', { reason, attempt });
    chatInput.focus();
    const end = chatInput.value?.length || 0;
    if (typeof chatInput.setSelectionRange === 'function') {
      chatInput.setSelectionRange(end, end);
    }

    const focused = document.activeElement === chatInput;
    if (focused) {
      console.info('[yumiko][renderer] input focus success', { reason, attempt });
    }
    return focused;
  };

  window.requestAnimationFrame(() => {
    const firstOk = tryFocus('raf');
    window.setTimeout(() => {
      const secondOk = tryFocus('timeout-30ms');
      if (!firstOk && !secondOk) {
        console.warn('[yumiko][renderer] input focus failed', { reason, attempt: 'all' });
      }
      if (sendAck) {
        window.yumikoOverlay?.chatReady?.();
      }
    }, 30);
  });
}

function pulseConversationPanel({ reason = 'unknown' } = {}) {
  if (!chat) return;
  chat.classList.remove('is-activated');
  void chat.offsetWidth;
  chat.classList.add('is-activated');
  window.setTimeout(() => {
    chat?.classList.remove('is-activated');
  }, 620);
  console.info('[yumiko][conversation] panel emphasis', { reason });
}

function setMode(nextMode, { source = 'ui' } = {}) {
  const mode = toUiMode(nextMode);
  const previousMode = settings.mode;
  console.info('[yumiko][mode] before change', {
    previousMode,
    requestedMode: nextMode,
    normalizedMode: mode,
    source
  });

  settings.mode = mode;
  if (source !== 'state-sync') {
    lastLocalModeIntent = {
      mode,
      source,
      at: Date.now()
    };
  }
  saveSettings();

  if (quitAppButton) {
    quitAppButton.hidden = false;
  }

  if (chat) {
    chat.hidden = false;
    chat.setAttribute('aria-hidden', 'false');
  }
  if (mini) {
    mini.hidden = false;
    mini.setAttribute('aria-hidden', 'false');
  }
  if (miniChatButton) {
    miniChatButton.setAttribute('aria-label', 'Activar conversación con Yumiko');
  }

  if (mode === 'chat') {
    markUserActivity({ event: 'activate-conversation', strength: 'strong' });
    focusChatInputRobust({ reason: `setMode:${source}` });
    pulseConversationPanel({ reason: source });
  } else {
    closeSettingsPanel();
  }

  updateChatPanelChrome();

  if (source === 'ui' || source === 'hotkey') {
    notifyHostMode(mode);
  }

  window.requestAnimationFrame(() => {
    setOverlayScale(userScale, { persist: false, shouldRequestFit: false, source: 'mode-change' });
  });
  requestFitDebounced();

  console.info('[yumiko][mode] after change', {
    previousMode,
    currentMode: settings.mode,
    source,
    chatHidden: chat?.hidden ?? null,
    miniHidden: mini?.hidden ?? null
  });
}

async function loadChatHistory() {
  try {
    const result = await window.yumikoOverlay?.chat?.getHistory?.();
    const messages = normalizeHistoryRecords(result);

    contextCache = messages.slice(-20).map((item) => ({ role: item.role, content: item.content }));
    renderMessages(messages);

    console.info('[yumiko][widget] history loaded', {
      records: messages.length,
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

  console.info('[yumiko][history] received records count=' + String(records.length));

  const normalized = records
    .map(({ id, created_at: createdAt, sender, role, content }) => ({
      id: id == null ? '' : String(id),
      createdAt: typeof createdAt === 'string' ? createdAt : '',
      role: sender === 'user' || role === 'user' ? 'user' : 'assistant',
      content: typeof content === 'string' ? content.trim() : ''
    }))
    .filter((item) => item.content);

  console.info('[yumiko][history] normalize result count=' + String(normalized.length));
  return normalized;
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
  pendingAssistantReplyAfterUserMessage = true;
  console.info('[yumiko][reply-carry] user message sent', {
    mode: settings.mode,
    at: new Date().toISOString()
  });
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

    const replyMessageId = typeof result?.replyId === 'string'
      ? result.replyId
      : typeof result?.messageId === 'string'
        ? result.messageId
        : typeof result?.id === 'string'
          ? result.id
          : '';

    handleAssistantReplyCarry({
      text: reply,
      messageId: replyMessageId,
      at: Date.now()
    });

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
    pendingAssistantReplyAfterUserMessage = false;
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
  if (sideImageModeSelect) {
    sideImageModeSelect.value = normalizeSideImageMode(settings.sideImageMode);
  }
  syncOverlayScaleControls();
}

async function requestAutoNudge() {
  if (isNudgeInFlight) {
    return { sent: false, reason: 'in-flight' };
  }
  if (!window.yumikoOverlay?.chat?.requestNudge) {
    return { sent: false, reason: 'missing-bridge' };
  }

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
        contextCache = historyMessages.slice(-20).map((item) => ({ role: item.role, content: item.content }));
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
      const panelMessageDuration = 10000;
      console.info('[yumiko][chat-panel] auto-message dispatched', {
        message,
        duration: panelMessageDuration,
        mode: resolvedMode
      });

      console.info('[yumiko][chat-panel] auto-message routed to persistent panel', {
        message,
        duration: panelMessageDuration,
        mode: resolvedMode
      });
      addMessage('assistant', message);
      if (!contextCache.some((item, index) => (
        item?.role === 'assistant'
        && item?.content === message
        && index >= Math.max(0, contextCache.length - 5)
      ))) {
        contextCache.push({ role: 'assistant', content: message });
        contextCache = contextCache.slice(-20);
      }
      return { sent: true, reason: 'message-generated', messageSource };
    }

    console.info('[yumiko][chat-panel] auto-message skipped reason=empty-message', {
      mode: toUiMode(settings.mode),
      message: result?.message ?? null
    });
    return { sent: false, reason: 'empty-message', messageSource };
  } catch (error) {
    console.warn('[yumiko][auto-message] nudge failed', error);
    return { sent: false, reason: 'request-failed' };
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

function isDynamicClickThroughEnabled(state = {}) {
  const mode = toUiMode(state.mode || settings.mode);
  return Boolean(
    state.hasCompletedFirstRun
    && state.overlayEnabled
    && (state.clickThroughPreferred ?? state.clickThroughEnabled)
    && mode === 'focus'
  );
}

function resolveInteractiveIslandAtPoint(event) {
  if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
  const candidate = document.elementFromPoint(event.clientX, event.clientY);
  return Boolean(candidate instanceof Element && candidate.closest(INTERACTIVE_ISLAND_SELECTOR));
}

function setInteractiveRegionActive(nextActive, reason = 'unknown') {
  const normalized = Boolean(nextActive);
  if (hoverInteractiveRegionActive === normalized) return;
  hoverInteractiveRegionActive = normalized;
  if (!hostAllowsDynamicClickThrough) return;
  window.yumikoOverlay?.setInteractiveRegionActive?.(normalized);
}

function updateInteractiveRegionFromPointer(event, reason = 'pointer') {
  if (!hostAllowsDynamicClickThrough) return;
  setInteractiveRegionActive(resolveInteractiveIslandAtPoint(event), reason);
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
    const incomingMode = toUiMode(state.mode);
    const currentMode = toUiMode(settings.mode);
    const localIntentAgeMs = Date.now() - lastLocalModeIntent.at;
    const shouldIgnoreStaleSync = incomingMode !== currentMode
      && lastLocalModeIntent.mode === currentMode
      && localIntentAgeMs >= 0
      && localIntentAgeMs < 2000;

    if (shouldIgnoreStaleSync) {
      console.info('[yumiko][mode] state-sync applied', {
        applied: false,
        reason: 'stale-host-mode',
        incomingMode,
        currentMode,
        lastLocalModeIntent,
        localIntentAgeMs
      });
    } else {
      console.info('[yumiko][mode] state-sync applied', {
        applied: true,
        incomingMode,
        currentMode,
        lastLocalModeIntent,
        localIntentAgeMs
      });
      setMode(incomingMode, { source: 'state-sync' });
    }
  }

  hostAllowsDynamicClickThrough = isDynamicClickThroughEnabled(state);
  if (hostAllowsDynamicClickThrough) {
    window.yumikoOverlay?.setInteractiveRegionActive?.(hoverInteractiveRegionActive);
  }

  syncAutoMessageControls();
  lastKnownBounds = state.bounds || lastKnownBounds;
  updateCharacterImageForBounds(lastKnownBounds);
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
  if (clickThroughToggle?.checked) {
    addMessage('assistant', 'Interacción de fondo activada. Si necesitás escribir, usá el atajo o el botón de chat para retomar foco.');
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

sideImageModeSelect?.addEventListener('change', () => {
  settings.sideImageMode = normalizeSideImageMode(sideImageModeSelect.value);
  saveSettings();
  updateCharacterImageForBounds(lastKnownBounds, { force: true });
});


overlayScaleInput?.addEventListener('input', () => {
  const sliderPercent = Number(overlayScaleInput.value);
  setOverlayScale(sliderPercent / 100, { persist: true, source: 'user' });
});

overlayScaleResetButton?.addEventListener('click', () => {
  setOverlayScale(DEFAULT_SETTINGS.overlayScale, { persist: true, source: 'user' });
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
  focusChatInputRobust({ reason: 'mini-chat-button' });
});

miniMicButton?.addEventListener('click', () => {
  miniMicButton.title = 'Próximamente';
  console.info('[yumiko][mic] Próximamente');
});

function adjustMiniScale(delta) {
  setOverlayScale((userScale || 1) + delta);
}

function panicResetRendererState() {
  console.info('PANIC RESET');
  localStorage.removeItem('miniScale');
  settings = { ...settings, mode: 'focus' };
  setOverlayScale(1, { persist: true });
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
  if (!event.ctrlKey || document.activeElement === input) return;
  event.preventDefault();
  adjustMiniScale(event.deltaY < 0 ? 0.05 : -0.05);
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    panicResetRendererState();
    return;
  }

  if (!event.ctrlKey || document.activeElement === input) return;

  if (event.key === '0') {
    event.preventDefault();
    setOverlayScale(1);
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

window.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('.custom-select')) return;
  closeCustomSelects();
}, { capture: true });

window.addEventListener('mousemove', (event) => {
  updateInteractiveRegionFromPointer(event, 'mousemove');
}, { capture: true });

window.addEventListener('pointermove', (event) => {
  updateInteractiveRegionFromPointer(event, 'pointermove');
}, { capture: true });

window.addEventListener('pointerdown', (event) => {
  updateInteractiveRegionFromPointer(event, 'pointerdown');
}, { capture: true });

window.addEventListener('mouseleave', () => {
  setInteractiveRegionActive(false, 'mouseleave');
}, { capture: true });

window.addEventListener('blur', () => {
  setInteractiveRegionActive(false, 'blur');
});

window.addEventListener('resize', () => {
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

function handleEscapeToCloseSettings(event) {
  if (event.key !== 'Escape' || settingsPanel?.hidden) return;
  event.preventDefault();
  closeSettingsPanel();
}

input?.addEventListener('keydown', handleEscapeToCloseSettings);
window.addEventListener('keydown', handleEscapeToCloseSettings);

window.yumikoWidget = {
  setMode: (mode) => setMode(mode, { source: 'state-sync' }),
  getSettings: () => ({ ...settings }),
  requestFit,
  showBubble,
  hideBubble
};

window.addEventListener('DOMContentLoaded', () => {
  setSettingsPanelHidden(true);
  setOverlayScale(userScale, { persist: false, source: 'init' });
  syncAutoMessageControls();
  startAutoMessageScheduler();
  persistAutoMessageSettings();
  [sideImageModeSelect, autoMessageIntervalSelect].forEach((select) => enhanceSelect(select));

  if (img) {
    preloadCharacterImage(CHARACTER_SRC_WHEN_WINDOW_ON_RIGHT);
    preloadCharacterImage(CHARACTER_SRC_WHEN_WINDOW_ON_LEFT);

    if (img.complete) {
      requestFitDebounced();
    } else {
      img.addEventListener('load', () => {
        requestFitDebounced();
      }, { once: true });
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      requestFitDebounced();
    });
    if (mini) resizeObserver.observe(mini);
    if (miniWrap) resizeObserver.observe(miniWrap);
    if (miniActions) resizeObserver.observe(miniActions);
    if (quitAppButton) resizeObserver.observe(quitAppButton);
    if (chat) resizeObserver.observe(chat);
  }

  window.yumikoOverlay?.onStateUpdated?.(syncHostState);
  window.yumikoOverlay?.onFocusInput?.(() => {
    setMode('chat', { source: 'hotkey' });
    focusChatInputRobust({ reason: 'main:focus-input', sendAck: true });
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
      setOverlayScale(payload.set);
      return;
    }
    if (payload.delta != null) {
      setOverlayScale(userScale + payload.delta);
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
    setOverlayScale(1);
  } else {
    applyScale('init', { shouldRequestFit: false });
  }
  loadChatHistory();
});
