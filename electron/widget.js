const STORAGE_KEY = 'yumiko-widget-settings-v1';
const DEFAULT_SETTINGS = {
  mode: 'focus',
  autoMessageEnabled: false,
  autoMessageIntervalMinutes: 20,
  sideImageMode: 'auto',
  chatBoxSize: 'normal',
  sleepAfterMinutes: 4
};
const AUTO_MESSAGE_INTERVAL_OPTIONS = [1, 2, 5, 10, 20];
const SLEEP_AFTER_MINUTES_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RECENT_FOCUS_REPLY_CARRY_WINDOW_MS = 7000;
const SCENE_BASE_WINDOW_SIZE = { width: 500, height: 636 };
const OVERLAY_SCALE_MIN = 0.85;
const OVERLAY_SCALE_MAX = 1.1;
const MINI_MIN_WIDTH = 260;
const MINI_MIN_HEIGHT = 300;
const AUTO_MESSAGE_MIN_TICK_MS = 1000;
const DEV_AUTO_MESSAGE_LOG = false;
const AUTO_ACTIVITY_MODE_KEY = 'yumiko_auto_message_recent_activity_mode';
const AUTO_ACTIVITY_WEAK_WINDOW_KEY = 'yumiko_auto_message_weak_activity_ms';
const DEFAULT_CHAT_HOTKEY = 'Control+Shift+J';

const settingsPanel = document.getElementById('settings-panel');
const toggleSettingsButton = document.getElementById('toggle-settings');
const settingsCloseButton = document.getElementById('settings-close');
const settingsChatButton = document.getElementById('settings-chat');
const settingsMicButton = document.getElementById('settings-mic');
const overlayToggle = document.getElementById('overlay-enabled');
const clickThroughToggle = document.getElementById('click-through-enabled');
const clickThroughNote = document.getElementById('click-through-note');
const shortcutsToggle = document.getElementById('shortcuts-enabled');
const launchAtStartupToggle = document.getElementById('launch-at-startup');
const chatHotkeyInput = document.getElementById('chat-hotkey');
const chatHotkeySaveButton = document.getElementById('chat-hotkey-save');
const chatHotkeyResetButton = document.getElementById('chat-hotkey-reset');
const chatHotkeyError = document.getElementById('chat-hotkey-error');
const authStatus = document.getElementById('auth-status');
const authActionButton = document.getElementById('auth-action');
const autoMessageToggle = document.getElementById('auto-message-enabled');
const autoMessageIntervalSelect = document.getElementById('auto-message-interval');
const sideImageModeSelect = document.getElementById('side-image-mode');
const sleepAfterMinutesSelect = document.getElementById('sleep-after-minutes');
const chatBoxSizeSelect = document.getElementById('chat-box-size');
const overlayScaleSelect = document.getElementById('overlay-scale');
const overlayScaleValue = document.getElementById('overlay-scale-value');
const overlayScaleResetButton = document.getElementById('overlay-scale-reset');
const selectShells = Array.from(document.querySelectorAll('.select-shell'));

const widget = document.getElementById('yumiko-widget');
const scene = document.getElementById('overlay-scene');
const mini = document.getElementById('yumiko-mini');
const miniWrap = document.getElementById('mini-wrap');

const chat = document.getElementById('yumiko-chat');
const img = document.getElementById('yumiko-character');
const input = document.getElementById('yumiko-input');
const send = document.getElementById('yumiko-send');
const chatLog = document.getElementById('chat-log');
const chatPanelTitle = document.getElementById('chat-panel-title');
const chatPanelStatus = document.getElementById('chat-panel-status');

const CHARACTER_SOURCES = {
  normal: {
    'left-screen': 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/fase-1.png',
    'right-screen': 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/overlay1.png'
  },
  thinking: {
    'left-screen': 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/fase-2.png',
    'right-screen': 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/Pensativa2.png'
  },
  sleeping: {
    'left-screen': 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/dormida2.png',
    'right-screen': 'https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/dormida.png'
  }
};
const SIDE_SWITCH_HYSTERESIS_PX = 48;
const YUMIKO_HEADROOM_MARGIN_PX = 16;
const YUMIKO_HEADROOM_SCAN_SAMPLE_WIDTH = 96;
const YUMIKO_HEADROOM_ALPHA_THRESHOLD = 20;

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
    parsed.chatBoxSize = normalizeChatBoxSize(parsed.chatBoxSize);
    parsed.sleepAfterMinutes = normalizeSleepAfterMinutes(parsed.sleepAfterMinutes);
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeSleepAfterMinutes(value) {
  const parsed = Number(value);
  return SLEEP_AFTER_MINUTES_OPTIONS.includes(parsed) ? parsed : 4;
}

function normalizeSideImageMode(value) {
  return value === 'left' || value === 'right' ? value : 'auto';
}

function normalizeChatBoxSize(value) {
  return value === 'compact' || value === 'wide' ? value : 'normal';
}

let settings = loadSettings();
let overlayScale = 1;
let fitTimeout = null;
let headroomMeasureTimeout = null;
let lastFitRequest = { mode: '', width: 0, height: 0 };
let lastGoodFocusFitSize = null;
let assistantMessageSequence = 0;
let lastAssistantMessageId = '';
let lastAssistantMessageAt = 0;
let lastAssistantMessageText = '';
let pendingAssistantReplyAfterUserMessage = false;
let activeCharacterSide = null;
let pendingCharacterSwapToken = 0;
let isSleeping = false;
let isThinkingPose = false;
let sleepInactivityTimer = null;
const preloadedCharacterImages = new Map();
const characterOpaqueTopRatioCache = new Map();
let lastKnownBounds = null;
let lastLocalModeIntent = {
  mode: toUiMode(settings.mode),
  source: 'init',
  at: 0
};
let hostOverlayState = {
  overlayEnabled: true,
  clickThroughFeatureEnabled: false,
  clickThroughPreferred: false,
  hasCompletedFirstRun: false,
  mode: 'focus'
};
const INTERACTIVE_REGION_SELECTORS = [
  '#yumiko-input',
  '#yumiko-send',
  '#toggle-settings',
  '#quit-app',
  '#mini-chat',
  '#mini-mic',
  '#settings-panel',
  '#settings-panel input',
  '#settings-panel select'
];
const INTERACTIVE_REGION_SELECTOR = INTERACTIVE_REGION_SELECTORS.join(', ');
let rendererInteractiveRegionActive = false;

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

function getCharacterSrc({ side, sleeping, thinking }) {
  const resolvedSide = side === 'left-screen' ? 'left-screen' : 'right-screen';
  const state = thinking ? 'thinking' : (sleeping ? 'sleeping' : 'normal');
  return CHARACTER_SOURCES[state][resolvedSide];
}

function updateCharacterImageForBounds(bounds, { force = false } = {}) {
  if (!img) return;

  const sideImageMode = normalizeSideImageMode(settings.sideImageMode);
  const resolvedSide = sideImageMode === 'auto'
    ? resolveCharacterSideFromBounds(bounds)
    : (sideImageMode === 'left' ? 'left-screen' : 'right-screen');

  if (!force && resolvedSide === activeCharacterSide) return;

  const nextSrc = getCharacterSrc({
    side: resolvedSide,
    sleeping: isSleeping,
    thinking: isThinkingPose
  });
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
    sleeping: isSleeping,
    thinking: isThinkingPose,
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
      scheduleHeadroomCalibration('character-source-swapped');
    });
  });
}

function clearSleepInactivityTimer() {
  if (sleepInactivityTimer) {
    window.clearTimeout(sleepInactivityTimer);
    sleepInactivityTimer = null;
  }
}

function setSleepingState(nextSleeping, { reason = 'unknown' } = {}) {
  const shouldSleep = Boolean(nextSleeping);
  if (shouldSleep && isThinkingPose) return;
  if (isSleeping === shouldSleep) return;
  isSleeping = shouldSleep;
  console.info('[yumiko][sleeping] state change', { isSleeping, reason });
  updateCharacterImageForBounds(lastKnownBounds, { force: true });
}

function setThinkingPose(nextThinking, { reason = 'unknown' } = {}) {
  const shouldThink = Boolean(nextThinking);
  if (shouldThink && isSleeping) {
    setSleepingState(false, { reason: `thinking:${reason}` });
  }
  if (isThinkingPose === shouldThink) return;
  isThinkingPose = shouldThink;
  console.info('[yumiko][thinking-pose] state change', { isThinkingPose, reason });
  updateCharacterImageForBounds(lastKnownBounds, { force: true });
}

function restartSleepInactivityTimer({ reason = 'unknown' } = {}) {
  clearSleepInactivityTimer();
  const sleepAfterMs = normalizeSleepAfterMinutes(settings.sleepAfterMinutes) * 60 * 1000;
  sleepInactivityTimer = window.setTimeout(() => {
    setSleepingState(true, { reason: `timer-expired:${reason}` });
  }, sleepAfterMs);
}

function registerOverlayActivity({ event = 'unknown', strength = 'strong' } = {}) {
  if (isSleeping) {
    setSleepingState(false, { reason: `activity:${event}` });
  }
  restartSleepInactivityTimer({ reason: `activity:${event}` });
  markUserActivity({ event, strength });
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
let lastAutoMessageRequestAt = 0;
const renderedAssistantMessageKeys = [];
const renderedAssistantMessageKeySet = new Set();
const MAX_RENDERED_ASSISTANT_MESSAGE_KEYS = 200;

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

function getAutoMessageNextDelayMs() {
  const dueInfo = getAutoMessageDueInfo();
  const requestDueAt = lastAutoMessageRequestAt > 0
    ? lastAutoMessageRequestAt + dueInfo.intervalMs
    : dueInfo.now;
  const requestRemainingMs = requestDueAt - dueInfo.now;
  const nextDueInMs = Math.max(
    0,
    dueInfo.strongRemainingMs,
    dueInfo.weakRemainingMs,
    requestRemainingMs
  );
  return {
    ...dueInfo,
    requestDueAt,
    requestRemainingMs,
    nextDueInMs
  };
}

function scheduleNextAutoMessageTick({ reason = 'unknown' } = {}) {
  clearAutoMessageScheduler();
  const skipReason = getAutoMessageSkipReason();
  if (skipReason === 'disabled') {
    logAutoMessageDebug('scheduler-not-scheduled', {
      reason,
      skipReason
    });
    return;
  }

  const dueInfo = getAutoMessageNextDelayMs();
  const delayMs = skipReason
    ? AUTO_MESSAGE_MIN_TICK_MS
    : Math.max(AUTO_MESSAGE_MIN_TICK_MS, Math.round(dueInfo.nextDueInMs));
  autoMessageScheduler = window.setTimeout(runAutoMessageSchedulerTick, delayMs);

  logAutoMessageDebug('scheduler-scheduled', {
    reason,
    schedulerTickInMs: delayMs,
    skipReason: skipReason || 'none',
    strongDueAt: new Date(dueInfo.strongDueAt).toISOString(),
    weakDueAt: new Date(dueInfo.weakDueAt).toISOString(),
    requestDueAt: new Date(dueInfo.requestDueAt).toISOString(),
    nextDueInMs: dueInfo.nextDueInMs
  });
}

async function runAutoMessageSchedulerTick() {
  autoMessageScheduler = null;
  const skipReason = getAutoMessageSkipReason();

  if (skipReason) {
    scheduleNextAutoMessageTick({ reason: `skip:${skipReason}` });
    return;
  }

  const dueInfo = getAutoMessageNextDelayMs();
  if (dueInfo.nextDueInMs > 0) {
    scheduleNextAutoMessageTick({ reason: 'not-due-yet' });
    return;
  }

  await requestAutoNudge();
  lastAutoMessageRequestAt = Date.now();
  scheduleNextAutoMessageTick({ reason: 'post-request' });
}


function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeOverlayScale(value) {
  const normalized = clamp(Number(value) || 1, OVERLAY_SCALE_MIN, OVERLAY_SCALE_MAX);
  return Number(normalized.toFixed(2));
}

function getScaledWindowSize(scale = overlayScale) {
  const safeScale = normalizeOverlayScale(scale);
  return {
    width: Math.round(SCENE_BASE_WINDOW_SIZE.width * safeScale),
    height: Math.round(SCENE_BASE_WINDOW_SIZE.height * safeScale)
  };
}

function getCharacterPresenceScale(scale = overlayScale) {
  const safeScale = normalizeOverlayScale(scale);
  const minScaleRange = 1 - OVERLAY_SCALE_MIN;
  const minBias = minScaleRange > 0
    ? clamp((1 - safeScale) / minScaleRange, 0, 1)
    : 0;
  const baseCharacterScale = 0.88;
  const minScaleExtraReduction = 0.04;
  const characterScale = baseCharacterScale - (minBias * minScaleExtraReduction);
  return Number(characterScale.toFixed(3));
}

function applyOverlayScaleUi(scale) {
  const safeScale = normalizeOverlayScale(scale);
  const characterScale = getCharacterPresenceScale(safeScale);
  overlayScale = safeScale;
  document.documentElement.style.setProperty('--mini-scale', String(safeScale));
  document.documentElement.style.setProperty('--yumiko-character-scale', String(characterScale));
  if (overlayScaleSelect) {
    overlayScaleSelect.value = String(safeScale);
  }
  if (overlayScaleValue) {
    overlayScaleValue.textContent = `${Math.round(safeScale * 100)}%`;
  }
}

function applyChatBoxSizeUi(chatBoxSize) {
  const safeChatBoxSize = normalizeChatBoxSize(chatBoxSize);
  settings.chatBoxSize = safeChatBoxSize;
  document.documentElement.dataset.chatBoxSize = safeChatBoxSize;
  if (chatBoxSizeSelect) {
    chatBoxSizeSelect.value = safeChatBoxSize;
  }
}

function setOverlayScale(nextScale, { persist = true } = {}) {
  const safeScale = normalizeOverlayScale(nextScale);
  const size = getScaledWindowSize(safeScale);
  applyOverlayScaleUi(safeScale);
  updateFocusMinimumSize();

  if (persist) {
    window.yumikoOverlay?.setOverlayScale?.(safeScale);
  }

  requestFitDebounced(`scale:${safeScale}`, size);
  scheduleHeadroomCalibration(`scale:${safeScale}`);
}

function isNodeEffectivelyVisible(node) {
  if (!node || node.hidden) return false;
  const computed = window.getComputedStyle(node);
  return computed.display !== 'none' && computed.visibility !== 'hidden' && computed.opacity !== '0';
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

function hasUnsafeCalculatedSize(width, height) {
  return !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0;
}

function requestFit({ reason = 'unknown', size } = {}) {
  if (!window.yumikoOverlay?.setWindowSize || !widget) return;

  updateFocusMinimumSize();

  const computedSize = size || getScaledWindowSize(overlayScale);
  const width = computedSize.width;
  const height = computedSize.height;

  if (lastFitRequest.width === width && lastFitRequest.height === height) {
    return;
  }

  lastGoodFocusFitSize = { width, height };
  lastFitRequest = { mode: settings.mode, width, height };
  window.yumikoOverlay?.setMinimumSize?.({ width, height });
  window.yumikoOverlay.setWindowSize({
    width,
    height,
    preservePosition: true
  });
}

function requestFitDebounced(reason = 'debounced', size) {
  window.clearTimeout(fitTimeout);
  fitTimeout = window.setTimeout(() => requestFit({ reason, size }), 50);
}

async function getCharacterOpaqueTopRatio(sourceImage) {
  const src = typeof sourceImage?.currentSrc === 'string' && sourceImage.currentSrc
    ? sourceImage.currentSrc
    : (typeof sourceImage?.src === 'string' ? sourceImage.src : '');
  if (!src || !sourceImage?.naturalWidth || !sourceImage?.naturalHeight) {
    return 0;
  }

  if (characterOpaqueTopRatioCache.has(src)) {
    return characterOpaqueTopRatioCache.get(src);
  }

  const sampleWidth = Math.min(sourceImage.naturalWidth, YUMIKO_HEADROOM_SCAN_SAMPLE_WIDTH);
  const sampleHeight = Math.max(1, Math.round((sourceImage.naturalHeight / sourceImage.naturalWidth) * sampleWidth));
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    characterOpaqueTopRatioCache.set(src, 0);
    return 0;
  }

  try {
    context.clearRect(0, 0, sampleWidth, sampleHeight);
    context.drawImage(sourceImage, 0, 0, sampleWidth, sampleHeight);
    const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    for (let y = 0; y < sampleHeight; y += 1) {
      const rowStart = y * sampleWidth * 4;
      for (let x = 0; x < sampleWidth; x += 1) {
        const alpha = data[rowStart + (x * 4) + 3];
        if (alpha >= YUMIKO_HEADROOM_ALPHA_THRESHOLD) {
          const ratio = y / sampleHeight;
          characterOpaqueTopRatioCache.set(src, ratio);
          return ratio;
        }
      }
    }
  } catch (error) {
    console.warn('[yumiko][headroom] opaque-top scan fallback', { src, error });
  }

  characterOpaqueTopRatioCache.set(src, 0);
  return 0;
}

async function calibrateYumikoHeadroom() {
  if (!scene || !img) return;
  if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;

  const sceneRect = scene.getBoundingClientRect();
  const characterRect = img.getBoundingClientRect();
  const opaqueTopRatio = await getCharacterOpaqueTopRatio(img);
  const characterVisibleTop = characterRect.top + (characterRect.height * opaqueTopRatio);
  const currentGap = characterVisibleTop - sceneRect.top;

  if (!Number.isFinite(currentGap)) return;

  const nextShift = Math.max(0, Math.round(currentGap - YUMIKO_HEADROOM_MARGIN_PX));
  document.documentElement.style.setProperty('--yumiko-headroom-shift', `${nextShift}px`);
}

function scheduleHeadroomCalibration(reason = 'unknown') {
  void reason;
  window.clearTimeout(headroomMeasureTimeout);
  headroomMeasureTimeout = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      void calibrateYumikoHeadroom();
    });
  }, 40);
}

function updateFocusMinimumSize() {
  const setFocusMinSize = window.yumikoOverlay?.setFocusMinSize || window.yumikoOverlay?.setMinimumSize;
  if (!setFocusMinSize) return;

  const { width: baseWidth, height: baseHeight } = getScaledWindowSize(overlayScale);

  const minW = Math.max(Math.ceil(baseWidth), MINI_MIN_WIDTH);
  const minH = Math.max(Math.ceil(baseHeight), MINI_MIN_HEIGHT);

  if (hasUnsafeCalculatedSize(minW, minH)) {
    return;
  }

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

function buildAssistantMessageDedupKey({ text = '', messageId = '', createdAt = '' } = {}) {
  const safeText = typeof text === 'string' ? text.trim() : '';
  if (!safeText) return '';

  const normalizedMessageId = typeof messageId === 'string' ? messageId.trim() : '';
  if (normalizedMessageId) {
    return `id:${normalizedMessageId}`;
  }

  const normalizedCreatedAt = typeof createdAt === 'string' ? createdAt.trim() : '';
  if (normalizedCreatedAt) {
    return `at:${normalizedCreatedAt}|text:${safeText.toLowerCase()}`;
  }

  return `text:${safeText.toLowerCase()}`;
}

function rememberRenderedAssistantMessageKey(key) {
  if (!key || renderedAssistantMessageKeySet.has(key)) return;
  renderedAssistantMessageKeySet.add(key);
  renderedAssistantMessageKeys.push(key);

  while (renderedAssistantMessageKeys.length > MAX_RENDERED_ASSISTANT_MESSAGE_KEYS) {
    const oldest = renderedAssistantMessageKeys.shift();
    if (oldest) {
      renderedAssistantMessageKeySet.delete(oldest);
    }
  }
}

function wasAssistantMessageRendered({ text = '', messageId = '', createdAt = '' } = {}) {
  const key = buildAssistantMessageDedupKey({ text, messageId, createdAt });
  if (!key) return false;
  return renderedAssistantMessageKeySet.has(key);
}

function markAssistantMessageRendered({ text = '', messageId = '', createdAt = '' } = {}) {
  const key = buildAssistantMessageDedupKey({ text, messageId, createdAt });
  if (!key) return;
  rememberRenderedAssistantMessageKey(key);
}

function resetRenderedAssistantMessageRegistry() {
  renderedAssistantMessageKeySet.clear();
  renderedAssistantMessageKeys.length = 0;
}

function addAssistantMessageIfNew({ text = '', messageId = '', createdAt = '', source = 'unknown' } = {}) {
  const safeText = typeof text === 'string' ? text.trim() : '';
  if (!safeText) {
    return false;
  }

  if (wasAssistantMessageRendered({ text: safeText, messageId, createdAt })) {
    console.info('[yumiko][chat-panel] assistant message deduped locally', {
      source,
      messageId: messageId || null,
      createdAt: createdAt || null
    });
    return false;
  }

  addMessage('assistant', safeText);
  markAssistantMessageRendered({ text: safeText, messageId, createdAt });
  return true;
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

function addMessage(role, content, { thinking = false, animate = true } = {}) {
  if (!chatLog) return null;
  const row = document.createElement('div');
  row.className = `chat-row ${role}${thinking ? ' thinking' : ''}`;
  const isAssistantMessage = role === 'assistant' && !thinking;
  if (isAssistantMessage) {
    row.classList.add('yumiko-bubble');
  }
  if (animate) {
    if (isAssistantMessage) {
      row.classList.add('yumiko-pre-enter');
      row.addEventListener(
        'animationend',
        () => {
          row.classList.remove('yumiko-enter');
        },
        { once: true }
      );
    } else {
      row.classList.add('is-entering', 'is-entering--user');
    }
  }

  const label = document.createElement('span');
  label.className = 'chat-role';
  label.textContent = role === 'user' ? 'Vos' : 'Yumiko';

  const text = document.createElement('p');
  text.className = 'chat-message';
  text.textContent = content;

  row.append(label, text);
  chatLog.appendChild(row);

  if (animate && isAssistantMessage) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void row.offsetWidth;
        row.classList.remove('yumiko-pre-enter');
        row.classList.add('is-entering', 'is-entering--assistant', 'yumiko-enter');
      });
    });
  }

  if (isAssistantMessage && animate) {
    registerOverlayActivity({ event: 'assistant-message-rendered', strength: 'strong' });
  }
  if (isAssistantMessage) {
    miniWrap?.classList.remove('is-reacting');
    void miniWrap?.offsetWidth;
    miniWrap?.classList.add('is-reacting');
    window.setTimeout(() => {
      miniWrap?.classList.remove('is-reacting');
    }, 900);
  }
  if (animate) {
    const cleanupDelayMs = isAssistantMessage ? 3600 : 420;
    window.setTimeout(() => {
      row.classList.remove('is-entering', 'is-entering--assistant', 'is-entering--user');
    }, cleanupDelayMs);
  }
  if (isAssistantMessage) {
    markAssistantMessageRendered({ text: content });
  }
  chatLog.scrollTop = chatLog.scrollHeight;
  updateChatPanelChrome();
  return row;
}

function clearMessages() {
  if (!chatLog) return;
  chatLog.innerHTML = '';
  resetRenderedAssistantMessageRegistry();
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
      addMessage(role, content, { animate: false });
      if (role === 'assistant') {
        markAssistantMessageRendered({
          text: content,
          messageId: id || '',
          createdAt: createdAt || ''
        });
      }
      previousRole = role;
    }
  });

  if (chatLog?.children.length === 0) {
    addMessage('assistant', '¡Hola! Soy Yumiko ✨ ¿En qué te ayudo hoy?', { animate: false });
  }
}

function setThinking(state) {
  isThinking = Boolean(state);
  setThinkingPose(isThinking, { reason: 'chat-thinking-state' });
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
  const willHide = Boolean(nextHidden);
  if (!willHide && settingsPanel.hidden) {
    settingsPanel.hidden = false;
    window.requestAnimationFrame(() => {
      settingsPanel.classList.add('is-open');
    });
  } else if (willHide) {
    settingsPanel.classList.remove('is-open');
    window.setTimeout(() => {
      if (!settingsPanel.classList.contains('is-open')) {
        settingsPanel.hidden = true;
      }
    }, 240);
  }

  toggleSettingsButton?.setAttribute('aria-expanded', String(!settingsPanel.hidden));

  if (willHide) {
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

function requestWindowClose(event = {}) {
  if (event.shiftKey && typeof window.yumikoOverlay?.quit === 'function') {
    console.info('[yumiko][window] quit requested from close action + Shift');
    window.yumikoOverlay.quit();
    return;
  }

  console.info('[yumiko][window] hide requested from close action');
  if (typeof window.yumikoOverlay?.closeWindow === 'function') {
    window.yumikoOverlay.closeWindow();
    return;
  }

  window.close();
}

function focusChatInputRobust({ reason = 'unknown', sendAck = false } = {}) {
  chat?.classList.add('is-input-accented');
  window.setTimeout(() => {
    chat?.classList.remove('is-input-accented');
  }, 1200);

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

  if (chat) {
    chat.hidden = false;
    chat.setAttribute('aria-hidden', 'false');
  }
  if (mini) {
    mini.hidden = false;
    mini.setAttribute('aria-hidden', 'false');
  }
  if (mode === 'chat') {
    registerOverlayActivity({ event: 'activate-conversation', strength: 'strong' });
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
    applyOverlayScaleUi(overlayScale);
  });
  requestFitDebounced('mode-change');

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
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const latestAssistant = [...messages].reverse().find((item) => item?.role === 'assistant' && item.content);
  if (!latestAssistant?.content) return null;

  if (messages.length > baselineSize) {
    return latestAssistant;
  }

  if (!baselineTail.includes(latestAssistant.content)) {
    return latestAssistant;
  }

  return null;
}

function removeThinkingNode(thinkingNode) {
  if (!thinkingNode || !thinkingNode.parentElement) return;
  thinkingNode.classList.add('thinking-exit');
  window.setTimeout(() => {
    if (thinkingNode.parentElement) {
      thinkingNode.remove();
      updateChatPanelChrome();
    }
  }, 120);
}

async function submitMessage() {
  if (!input || isThinking) return;
  const message = input.value.trim();
  if (!message) return;

  registerOverlayActivity({ event: 'submit-message', strength: 'strong' });
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

    removeThinkingNode(thinkingNode);
    addMessage('assistant', reply);

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

    removeThinkingNode(thinkingNode);
    addMessage('assistant', fallback);
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
  if (chatBoxSizeSelect) {
    chatBoxSizeSelect.value = normalizeChatBoxSize(settings.chatBoxSize);
  }
  if (sleepAfterMinutesSelect) {
    sleepAfterMinutesSelect.value = String(normalizeSleepAfterMinutes(settings.sleepAfterMinutes));
  }
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
    let messageId = typeof result?.messageId === 'string' ? result.messageId.trim() : '';
    let createdAt = typeof result?.createdAt === 'string' ? result.createdAt.trim() : '';

    let messageSource = message ? 'request-nudge-response' : 'history-confirmation';

    if (!message) {
      const historyResult = await window.yumikoOverlay?.chat?.getHistory?.();
      const historyMessages = normalizeHistoryRecords(historyResult);
      const latestAssistant = findLatestAssistantAfterBaseline(historyMessages, baselineContextSize, baselineAssistantTail);
      message = latestAssistant?.content || '';
      messageId = latestAssistant?.id || '';
      createdAt = latestAssistant?.createdAt || '';
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
      const wasRendered = addAssistantMessageIfNew({
        text: message,
        messageId,
        createdAt,
        source: messageSource
      });
      if (!wasRendered) {
        return { sent: false, reason: 'duplicate-local', messageSource };
      }
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
  hostOverlayState = {
    overlayEnabled: Boolean(state.overlayEnabled),
    clickThroughFeatureEnabled: Boolean(state.clickThroughFeatureEnabled),
    clickThroughPreferred: Boolean(state.clickThroughPreferred ?? state.clickThroughEnabled),
    hasCompletedFirstRun: Boolean(state.hasCompletedFirstRun),
    mode: state.mode === 'chat' ? 'chat' : 'focus'
  };
  document.documentElement.dataset.clickThrough = hostOverlayState.clickThroughPreferred ? 'on' : 'off';
  renderAuthState(state);
  if (overlayToggle) overlayToggle.checked = Boolean(state.overlayEnabled);
  if (clickThroughToggle) {
    clickThroughToggle.checked = Boolean(state.clickThroughPreferred ?? state.clickThroughEnabled);
    const clickThroughAvailable = Boolean(state.clickThroughFeatureEnabled);
    clickThroughToggle.disabled = !clickThroughAvailable;
    clickThroughToggle.title = clickThroughAvailable
      ? ''
      : 'Temporalmente deshabilitado hasta estabilizar click-through.';
    if (clickThroughNote) {
      clickThroughNote.textContent = clickThroughAvailable
        ? 'Modo passthrough: no captura clicks ni drag. Volvé con Ctrl+Shift+K.'
        : 'Visible por transparencia: temporalmente deshabilitado hasta estabilizar click-through.';
    }
  }
  if (shortcutsToggle) shortcutsToggle.checked = Boolean(state.shortcutsEnabled);
  if (launchAtStartupToggle) launchAtStartupToggle.checked = Boolean(state.launchAtStartup);
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

  syncAutoMessageControls();
  lastKnownBounds = state.bounds || lastKnownBounds;
  if (state.overlayScale != null) {
    applyOverlayScaleUi(state.overlayScale);
    updateFocusMinimumSize();
    requestFitDebounced('state:overlay-scale');
    scheduleHeadroomCalibration('state:overlay-scale');
  }
  updateCharacterImageForBounds(lastKnownBounds);
  if (!hostOverlayState.clickThroughPreferred || !hostOverlayState.overlayEnabled) {
    updateRendererInteractiveRegion(false, { force: true });
  }
}

function updateRendererInteractiveRegion(active, { force = false } = {}) {
  const nextActive = Boolean(active);
  if (!force && rendererInteractiveRegionActive === nextActive) return;
  rendererInteractiveRegionActive = nextActive;
  window.yumikoOverlay?.setRendererInteractiveRegionActive?.(nextActive);
}

function shouldTrackInteractiveRegion() {
  return hostOverlayState.overlayEnabled
    && hostOverlayState.clickThroughPreferred
    && hostOverlayState.hasCompletedFirstRun;
}

function resolveInteractiveRegionFromEventTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_REGION_SELECTOR));
}

toggleSettingsButton?.addEventListener('click', () => {
  setSettingsPanelHidden(!settingsPanel?.hidden);
});

settingsCloseButton?.addEventListener('click', requestWindowClose);

overlayToggle?.addEventListener('change', () => {
  window.yumikoOverlay?.setOverlayEnabled?.(overlayToggle.checked);
});

clickThroughToggle?.addEventListener('change', () => {
  window.yumikoOverlay?.setClickThroughEnabled?.(clickThroughToggle.checked);
  if (clickThroughToggle?.checked) {
    addMessage('assistant', 'Modo fondo activado · Volvé con Ctrl+Shift+K');
  } else {
    addMessage('assistant', 'Modo interactivo restaurado');
  }
});

shortcutsToggle?.addEventListener('change', () => {
  window.yumikoOverlay?.setShortcutsEnabled?.(shortcutsToggle.checked);
});

launchAtStartupToggle?.addEventListener('change', async () => {
  const requested = Boolean(launchAtStartupToggle.checked);
  try {
    const result = await window.yumikoOverlay?.setLaunchAtStartup?.(requested);
    launchAtStartupToggle.checked = Boolean(result?.enabled);
  } catch (error) {
    console.warn('[yumiko][startup] failed to update startup preference', error);
    launchAtStartupToggle.checked = !requested;
  }
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
  registerOverlayActivity({ event: 'toggle-auto-message-enabled', strength: 'weak' });
  persistAutoMessageSettings();
});

autoMessageIntervalSelect?.addEventListener('change', () => {
  const nextValue = Number(autoMessageIntervalSelect.value);
  settings.autoMessageIntervalMinutes = AUTO_MESSAGE_INTERVAL_OPTIONS.includes(nextValue) ? nextValue : 20;
  saveSettings();
  registerOverlayActivity({ event: 'change-auto-message-interval', strength: 'weak' });
  persistAutoMessageSettings();
});

sideImageModeSelect?.addEventListener('change', () => {
  settings.sideImageMode = normalizeSideImageMode(sideImageModeSelect.value);
  saveSettings();
  registerOverlayActivity({ event: 'change-side-image-mode', strength: 'weak' });
  updateCharacterImageForBounds(lastKnownBounds, { force: true });
});

sleepAfterMinutesSelect?.addEventListener('change', () => {
  settings.sleepAfterMinutes = normalizeSleepAfterMinutes(sleepAfterMinutesSelect.value);
  saveSettings();
  registerOverlayActivity({ event: 'change-sleep-after-minutes', strength: 'weak' });
});

chatBoxSizeSelect?.addEventListener('change', () => {
  const nextChatBoxSize = normalizeChatBoxSize(chatBoxSizeSelect.value);
  applyChatBoxSizeUi(nextChatBoxSize);
  saveSettings();
});

overlayScaleSelect?.addEventListener('input', () => {
  setOverlayScale(overlayScaleSelect.value);
});

overlayScaleResetButton?.addEventListener('click', () => {
  setOverlayScale(1);
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

settingsChatButton?.addEventListener('click', () => {
  registerOverlayActivity({ event: 'settings-chat-button', strength: 'strong' });
  setMode('chat', { source: 'ui' });
  closeSettingsPanel();
  focusChatInputRobust({ reason: 'settings-chat-button' });
});

settingsMicButton?.addEventListener('click', () => {
  settingsMicButton.title = 'Próximamente';
  console.info('[yumiko][mic] Próximamente');
});

function adjustOverlayScale(delta) {
  setOverlayScale((overlayScale || 1) + delta);
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
  adjustOverlayScale(event.deltaY < 0 ? 0.05 : -0.05);
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
    adjustOverlayScale(0.05);
    return;
  }

  if (event.key === '-') {
    event.preventDefault();
    adjustOverlayScale(-0.05);
  }
});


window.addEventListener('mousedown', () => {
  registerOverlayActivity({ event: 'window-mousedown', strength: 'weak' });
}, { capture: true });

window.addEventListener('mousemove', (event) => {
  if (!shouldTrackInteractiveRegion()) {
    updateRendererInteractiveRegion(false);
    return;
  }
  updateRendererInteractiveRegion(resolveInteractiveRegionFromEventTarget(event.target));
}, { capture: true });

window.addEventListener('mouseleave', () => {
  updateRendererInteractiveRegion(false);
}, { capture: true });

window.addEventListener('blur', () => {
  updateRendererInteractiveRegion(false);
});

window.addEventListener('focusin', (event) => {
  if (!shouldTrackInteractiveRegion()) return;
  updateRendererInteractiveRegion(resolveInteractiveRegionFromEventTarget(event.target));
}, { capture: true });

window.addEventListener('focusout', () => {
  if (!shouldTrackInteractiveRegion()) return;
  const activeElement = document.activeElement;
  updateRendererInteractiveRegion(resolveInteractiveRegionFromEventTarget(activeElement));
}, { capture: true });

window.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('.custom-select')) return;
  closeCustomSelects();
}, { capture: true });

send?.addEventListener('click', submitMessage);

input?.addEventListener('input', () => {
  registerOverlayActivity({ event: 'input-typing', strength: 'strong' });
});

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
  settingsPanel?.classList.remove('is-open');
  applyOverlayScaleUi(1);
  applyChatBoxSizeUi(settings.chatBoxSize);
  syncAutoMessageControls();
  startAutoMessageScheduler();
  persistAutoMessageSettings();
  [sideImageModeSelect, autoMessageIntervalSelect, chatBoxSizeSelect, sleepAfterMinutesSelect].forEach((select) => enhanceSelect(select));

  if (img) {
    Object.values(CHARACTER_SOURCES).forEach((sourcesBySide) => {
      Object.values(sourcesBySide).forEach((src) => preloadCharacterImage(src));
    });

    if (img.complete) {
      requestFitDebounced('image-ready');
      scheduleHeadroomCalibration('image-ready');
    } else {
      img.addEventListener('load', () => {
        requestFitDebounced('image-loaded');
        scheduleHeadroomCalibration('image-loaded');
      }, { once: true });
    }
  }

  if (scene) {
    window.requestAnimationFrame(() => {
      scene.classList.add('is-ready');
    });
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
      setOverlayScale(overlayScale + payload.delta);
    }
  });
  window.addEventListener('yumiko:click-through-feedback', (event) => {
    const enabled = Boolean(event?.detail?.enabled);
    addMessage('assistant', enabled
      ? 'Modo fondo activado · Volvé con Ctrl+Shift+K'
      : 'Modo interactivo restaurado');
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
  restartSleepInactivityTimer({ reason: 'init' });
  requestFitDebounced('init');
  scheduleHeadroomCalibration('init');
  loadChatHistory();
});
