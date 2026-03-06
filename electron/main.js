const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  shell,
  Tray,
  nativeImage,
  screen
} = require('electron');
const chatClient = require('./chatClient');

const DEFAULT_BOUNDS = { width: 560, height: 380 };
const SETTINGS_FILE = 'settings.json';
const AUTH_FILE = 'auth.json';
const DEFAULT_YUMIKO_WEB_ORIGIN = 'https://21-moon.com';

let tray;
let win;
let isQuitting = false;
let pendingAuthCode = '';
const processedAuthCodes = new Set();
let authState = {
  connected: false,
  user_id: '',
  device_id: '',
  device_name: ''
};

const defaultSettings = {
  mode: 'focus',
  userPickedMode: false,
  overlayEnabled: true,
  clickThroughPreferred: false,
  shortcutsEnabled: true,
  visible: true,
  bounds: null,
  hasCompletedFirstRun: false,
  yumikoWebOrigin: process.env.YUMIKO_WEB_ORIGIN || process.env.YUMIKO_CHAT_URL || DEFAULT_YUMIKO_WEB_ORIGIN,
  deviceId: '',
  deviceName: '',
  overlayAccessToken: '',
  overlayAccountEmail: '',
  conversationId: ''
};

function normalizeOrigin(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}

function resolveYumikoWebOrigin(persistedSettings = {}) {
  const persistedOrigin = normalizeOrigin(
    persistedSettings.yumikoWebOrigin || persistedSettings.chatBaseUrl
  );
  if (persistedOrigin) return persistedOrigin;

  const envOrigin = normalizeOrigin(process.env.YUMIKO_WEB_ORIGIN || process.env.YUMIKO_CHAT_URL);
  if (envOrigin) return envOrigin;

  return DEFAULT_YUMIKO_WEB_ORIGIN;
}

const SHORTCUTS = {
  toggleVisible: 'CommandOrControl+Shift+Y',
  toggleMode: 'CommandOrControl+Shift+M',
  forceQuit: 'CommandOrControl+Shift+Q',
  panicReset: 'Control+Alt+R',
  panicSafeMode: 'CommandOrControl+Alt+Shift+S',
  emergencyClickThrough: 'CommandOrControl+Alt+C'
};

function safeBounds(bounds, reason = 'unknown') {
  const fallback = { x: 80, y: 80, width: 420, height: 420 };
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    console.warn('[yumiko][window] unsafe bounds (non-finite), using fallback', { reason, bounds });
    return { ...fallback };
  }

  if (width < 200 || height < 200) {
    console.warn('[yumiko][window] unsafe bounds (too small), using fallback', { reason, bounds });
    return { ...fallback };
  }

  const nextX = Number(bounds?.x);
  const nextY = Number(bounds?.y);
  return {
    x: Number.isFinite(nextX) ? Math.round(nextX) : fallback.x,
    y: Number.isFinite(nextY) ? Math.round(nextY) : fallback.y,
    width: Math.round(width),
    height: Math.round(height)
  };
}

function clampBoundsToWorkArea(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display?.workArea;
  if (!area) return bounds;

  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);

  const maxX = area.x + area.width - width;
  const maxY = area.y + area.height - height;

  return {
    ...bounds,
    width,
    height,
    x: Math.max(area.x, Math.min(bounds.x, maxX)),
    y: Math.max(area.y, Math.min(bounds.y, maxY))
  };
}

function shouldForceInteractiveStartup() {
  return settings.visible || !settings.hasCompletedFirstRun;
}

function ensureInteractiveStartup() {
  if (!shouldForceInteractiveStartup()) return;
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(false);
  }
}

function panicDisableOverlayAndClickThrough() {
  settings.clickThroughPreferred = false;
  settings.overlayEnabled = false;
  writeSettings();

  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(false);
    win.setAlwaysOnTop(false);
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
  }

  broadcastState();
  refreshTrayMenu();
}

function panicResetWindowAndRenderer() {
  console.info('PANIC RESET');
  settings.mode = 'focus';
  settings.userPickedMode = false;
  settings.visible = true;
  settings.overlayEnabled = true;
  writeSettings();

  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(false);
    if (settings.overlayEnabled) {
      win.setAlwaysOnTop(true, 'floating');
    }
    win.setResizable(false);
    win.show();
    win.focus();
    win.webContents.send('yumiko:panic-reset', { reason: 'shortcut' });
  }

  setMode('focus');
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const userPickedMode = parsed.userPickedMode === true;
    const migratedMode = !userPickedMode && parsed.mode === 'chat'
      ? 'focus'
      : parsed.mode;
    const mergedSettings = {
      ...defaultSettings,
      ...parsed,
      clickThroughPreferred: Boolean(parsed.clickThroughPreferred ?? parsed.clickThroughEnabled),
      mode: migratedMode,
      userPickedMode,
      yumikoWebOrigin: resolveYumikoWebOrigin(parsed)
    };

    if (!mergedSettings.hasCompletedFirstRun) {
      mergedSettings.overlayEnabled = true;
    }

    return mergedSettings;
  } catch {
    return {
      ...defaultSettings,
      yumikoWebOrigin: resolveYumikoWebOrigin()
    };
  }
}

let settings = readSettings();
let focusMinBounds = { minW: 0, minH: 0 };

function setFocusMinimumBounds(payload) {
  if (!win || win.isDestroyed()) return;

  const requestedWidth = Number(payload?.width);
  const requestedHeight = Number(payload?.height);

  if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight)) return;

  const minW = Math.max(260, Math.round(requestedWidth));
  const minH = Math.max(260, Math.round(requestedHeight));
  focusMinBounds = { minW, minH };

  if (settings.mode === 'focus') {
    win.setMinimumSize(minW, minH);
  }
}
const YUMIKO_WEB_ORIGIN = resolveYumikoWebOrigin(settings);
settings.yumikoWebOrigin = YUMIKO_WEB_ORIGIN;

function writeSettings() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function ensureDeviceIdentity() {
  if (!settings.deviceId) {
    settings.deviceId = crypto.randomUUID();
  }
  if (!settings.deviceName) {
    settings.deviceName = `${app.getName()}-${process.platform}`;
  }
}

function authPath() {
  return path.join(app.getPath('userData'), AUTH_FILE);
}

function readAuth() {
  try {
    const raw = fs.readFileSync(authPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function writeAuth(nextAuth) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(authPath(), JSON.stringify(nextAuth, null, 2));
}

function normalizeToken(token) {
  let normalized = typeof token === 'string' ? token.trim() : '';
  while ((normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function isJwtLike(token) {
  return typeof token === 'string' && token.split('.').length === 3;
}

function getPersistedSession(authPayload) {
  const session = authPayload?.session && typeof authPayload.session === 'object'
    ? authPayload.session
    : authPayload;

  if (!session || typeof session !== 'object') return null;

  return {
    user_id: typeof session.user_id === 'string' ? session.user_id : '',
    device_id: typeof session.device_id === 'string' ? session.device_id : settings.deviceId,
    access_token: normalizeToken(session.access_token),
    refresh_token: normalizeToken(session.refresh_token),
    expires_at: session.expires_at || null
  };
}

function isAccessTokenExpiring(expiresAt, skewSeconds = 60) {
  if (!expiresAt) return true;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs - Date.now() <= skewSeconds * 1000;
}

function clearAuth() {
  try {
    fs.unlinkSync(authPath());
  } catch {}
}

function getState() {
  return {
    ...settings,
    authState: { ...authState }
  };
}

function markOverlayDisconnected({ clearStoredRefreshToken = false } = {}) {
  if (clearStoredRefreshToken) {
    clearAuth();
  }
  settings.overlayAccessToken = '';
  settings.overlayAccountEmail = '';
  authState = {
    ...authState,
    connected: false,
    user_id: ''
  };
  writeSettings();
  broadcastState();
}

function applyExchangeResponse(data = {}) {
  settings.overlayAccessToken = normalizeToken(
    typeof data?.access_token === 'string'
      ? data.access_token
      : (typeof data?.accessToken === 'string' ? data.accessToken : '')
  );
  settings.overlayAccountEmail = typeof data?.email === 'string' ? data.email : '';
  settings.visible = true;
  authState = {
    ...authState,
    connected: Boolean(data?.refresh_token),
    user_id: typeof data?.user_id === 'string' ? data.user_id : authState.user_id,
    device_id: typeof data?.device_id === 'string' ? data.device_id : settings.deviceId,
    device_name: settings.deviceName
  };
  writeSettings();
  broadcastState();
}

function createExchangeError(message, { status = 500, apiError = '' } = {}) {
  const error = new Error(message);
  error.status = status;
  error.apiError = apiError;
  return error;
}

async function exchangePairingCode(code, { deviceId, deviceName } = {}) {
  const exchangeUrl = `${YUMIKO_WEB_ORIGIN}/api/overlay/link/exchange`;
  const effectiveDeviceId = typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : settings.deviceId;
  const effectiveDeviceName = typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim() : settings.deviceName;
  settings.deviceId = effectiveDeviceId;
  settings.deviceName = effectiveDeviceName;
  console.info('[yumiko][auth] exchange started', { effectiveDeviceId, effectiveDeviceName });

  const res = await fetch(exchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      device_id: effectiveDeviceId,
      device_name: effectiveDeviceName,
      app_version: app.getVersion()
    })
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  const serverError = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : '';
  if (!res.ok || data?.ok === false) {
    console.error('[yumiko][auth] exchange failed', {
      status: res.status,
      ok: data?.ok,
      error: serverError || '<none>',
      keys: data && typeof data === 'object' ? Object.keys(data) : []
    });

    if (serverError) {
      throw createExchangeError(`HTTP ${res.status} ${serverError}`, { status: res.status, apiError: serverError });
    }

    throw createExchangeError(`HTTP ${res.status} exchange_failed`, { status: res.status });
  }

  const accessToken = normalizeToken(data?.accessToken || data?.access_token || data?.token);
  const refreshToken = normalizeToken(data?.refreshToken || data?.refresh_token);
  const expiresIn = data?.expiresIn ?? data?.expires_in;
  const receivedKeys = data && typeof data === 'object' ? Object.keys(data) : [];

  if (typeof accessToken !== 'string' || !accessToken || !isJwtLike(accessToken)
    || typeof refreshToken !== 'string' || !refreshToken
    || !Number.isFinite(Number(expiresIn))) {
    throw createExchangeError(`missing_token_fields keys=${receivedKeys.join(',') || '<none>'}`);
  }

  const userId = typeof data?.user_id === 'string' ? data.user_id : '';
  const connectedAt = new Date().toISOString();
  const expiresAt = typeof data?.expires_at === 'string' && data.expires_at
    ? data.expires_at
    : new Date(Date.now() + Number(expiresIn) * 1000).toISOString();
  const persistedAuth = {
    connectedAt,
    session: {
      user_id: userId,
      device_id: effectiveDeviceId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt
    },
    updated_at: connectedAt
  };

  writeAuth(persistedAuth);
  console.info('[yumiko][auth] auth saved', { userId, deviceId: effectiveDeviceId });
  applyExchangeResponse({
    ...data,
    user_id: userId,
    device_id: effectiveDeviceId,
    access_token: accessToken,
    refresh_token: refreshToken
  });

  return { userId, deviceId: effectiveDeviceId };
}

async function refreshOverlayAccessToken() {
  const storedAuth = readAuth();
  const session = getPersistedSession(storedAuth);
  const refreshToken = normalizeToken(session?.refresh_token || '');
  if (!refreshToken) {
    markOverlayDisconnected();
    const error = new Error('No refresh token stored for this device');
    error.code = 'AUTH_MISSING';
    throw error;
  }

  const refreshUrl = `${YUMIKO_WEB_ORIGIN}/api/overlay/link/refresh`;
  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      device_id: settings.deviceId,
      device_name: settings.deviceName,
      app_version: app.getVersion()
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      markOverlayDisconnected({ clearStoredRefreshToken: true });
    }
    const error = new Error(`Token refresh failed (HTTP ${response.status})`);
    error.code = response.status === 401 ? 'AUTH_INVALID' : 'AUTH_REFRESH_FAILED';
    throw error;
  }

  const data = await response.json();
  const nextAccessToken = normalizeToken(data?.access_token || data?.overlay_access_token || '');
  const nextRefreshToken = normalizeToken(typeof data?.refresh_token === 'string' && data.refresh_token
    ? data.refresh_token
    : refreshToken);
  const expiresAt = typeof data?.expires_at === 'string' && data.expires_at
    ? data.expires_at
    : (Number.isFinite(Number(data?.expires_in))
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : session?.expires_at || null);

  if (!nextAccessToken || !isJwtLike(nextAccessToken)) {
    const error = new Error('Token refresh failed (invalid access token format)');
    error.code = 'AUTH_INVALID';
    throw error;
  }

  writeAuth({
    connectedAt: storedAuth?.connectedAt || new Date().toISOString(),
    session: {
      user_id: typeof data?.user_id === 'string' ? data.user_id : (session?.user_id || ''),
      device_id: settings.deviceId,
      access_token: nextAccessToken,
      refresh_token: nextRefreshToken,
      expires_at: expiresAt
    },
    updated_at: new Date().toISOString()
  });
  applyExchangeResponse({
    access_token: nextAccessToken,
    refresh_token: nextRefreshToken,
    user_id: typeof data?.user_id === 'string' ? data.user_id : (session?.user_id || ''),
    email: data?.email || settings.overlayAccountEmail
  });
  return settings.overlayAccessToken;
}

function isAuthRetryableError(error) {
  return error?.code === 'AUTH_INVALID' || error?.status === 401;
}

async function withOverlayAccessToken(requestFn) {
  const persisted = getPersistedSession(readAuth());
  let token = normalizeToken(settings.overlayAccessToken || persisted?.access_token || '');

  if (!token) {
    const error = new Error('No conectado. Abrí Settings > Vincular');
    error.code = 'AUTH_MISSING';
    throw error;
  }

  if (!isJwtLike(token)) {
    token = await refreshOverlayAccessToken();
  } else if (isAccessTokenExpiring(persisted?.expires_at, 60) && persisted?.refresh_token) {
    token = await refreshOverlayAccessToken();
  }

  try {
    return await requestFn(token);
  } catch (error) {
    if (!isAuthRetryableError(error)) {
      throw error;
    }
    const refreshedToken = await refreshOverlayAccessToken();
    return requestFn(refreshedToken);
  }
}

async function disconnectOverlayDevice() {
  const revokeUrl = `${YUMIKO_WEB_ORIGIN}/api/overlay/revoke-device`;
  try {
    if (settings.overlayAccessToken) {
      await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.overlayAccessToken}`
        },
        body: JSON.stringify({ device_id: settings.deviceId })
      });
    }
  } catch (error) {
    console.warn('[yumiko][auth] revoke-device request failed', error);
  }

  markOverlayDisconnected({ clearStoredRefreshToken: true });
}

function getDefaultPosition() {
  const display = screen.getPrimaryDisplay().workArea;
  return {
    x: display.x + display.width - DEFAULT_BOUNDS.width - 16,
    y: display.y + display.height - DEFAULT_BOUNDS.height - 16
  };
}

function getInitialBounds() {
  const position = getDefaultPosition();
  return {
    width: DEFAULT_BOUNDS.width,
    height: DEFAULT_BOUNDS.height,
    ...position,
    ...(settings.bounds || {})
  };
}

function broadcastState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('yumiko:state-updated', getState());
}

function applyWindowBehavior() {
  if (!win) return;

  win.setAlwaysOnTop(Boolean(settings.overlayEnabled), 'floating');

  const canUseClickThrough = settings.hasCompletedFirstRun;
  const enableClickThrough = canUseClickThrough
    && settings.overlayEnabled
    && settings.clickThroughPreferred
    && settings.mode === 'focus';

  if (enableClickThrough) {
    win.setFocusable(false);
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setFocusable(true);
    win.setIgnoreMouseEvents(false);
  }

  broadcastState();
  refreshTrayMenu();
}

function setMode(mode, { fromRenderer = false, userPickedMode = false } = {}) {
  const nextMode = mode === 'chat' ? 'chat' : 'focus';
  console.info('[yumiko][mode] setMode', {
    previousMode: settings.mode,
    nextMode,
    source: fromRenderer ? 'renderer' : 'main'
  });
  settings.mode = nextMode;
  if (userPickedMode) {
    settings.userPickedMode = true;
  }
  writeSettings();

  if (!win) return;

  if (nextMode === 'chat') {
    win.setResizable(true);
    win.setFocusable(true);
    win.setIgnoreMouseEvents(false);
    win.setMinimumSize(0, 0);
  } else {
    win.setResizable(false);
    if (focusMinBounds.minW > 0 && focusMinBounds.minH > 0) {
      win.setMinimumSize(focusMinBounds.minW, focusMinBounds.minH);
    }
  }

  applyWindowBehavior();

  if (!fromRenderer && !win.webContents.isLoading()) {
    win.webContents.executeJavaScript(`window.yumikoWidget?.setMode?.(${JSON.stringify(nextMode)});`, true).catch(() => {});
  }
}

function updateGlobalShortcuts() {
  globalShortcut.unregister(SHORTCUTS.toggleVisible);
  globalShortcut.unregister(SHORTCUTS.toggleMode);
  globalShortcut.unregister(SHORTCUTS.forceQuit);
  globalShortcut.unregister(SHORTCUTS.panicReset);
  globalShortcut.unregister(SHORTCUTS.panicSafeMode);
  globalShortcut.unregister(SHORTCUTS.emergencyClickThrough);
  globalShortcut.unregister('CommandOrControl+Alt+=');
  globalShortcut.unregister('CommandOrControl+Alt+-');
  globalShortcut.unregister('CommandOrControl+Alt+0');

  globalShortcut.register(SHORTCUTS.forceQuit, quitApp);
  globalShortcut.register(SHORTCUTS.panicReset, panicResetWindowAndRenderer);
  globalShortcut.register(SHORTCUTS.panicSafeMode, panicDisableOverlayAndClickThrough);
  globalShortcut.register(SHORTCUTS.emergencyClickThrough, () => {
    setClickThroughEnabled(!settings.clickThroughPreferred);
  });
  if (win && !win.isDestroyed()) {
    globalShortcut.register('CommandOrControl+Alt+=', () => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('yumiko:mini-scale', { delta: +0.05 });
    });
    globalShortcut.register('CommandOrControl+Alt+-', () => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('yumiko:mini-scale', { delta: -0.05 });
    });
    globalShortcut.register('CommandOrControl+Alt+0', () => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('yumiko:mini-scale', { set: 1 });
    });
  }

  if (!settings.shortcutsEnabled) {
    return;
  }

  globalShortcut.register(SHORTCUTS.toggleVisible, toggleVisible);
  globalShortcut.register(SHORTCUTS.toggleMode, toggleMode);
}

function setShortcutsEnabled(enabled) {
  settings.shortcutsEnabled = Boolean(enabled);
  writeSettings();
  updateGlobalShortcuts();
  broadcastState();
  refreshTrayMenu();
}

function setClickThroughEnabled(enabled) {
  settings.clickThroughPreferred = Boolean(enabled);
  writeSettings();
  applyWindowBehavior();
}

function setOverlayEnabled(enabled) {
  settings.overlayEnabled = Boolean(enabled);
  writeSettings();
  applyWindowBehavior();
}

function completeFirstRun() {
  if (settings.hasCompletedFirstRun) return;
  settings.hasCompletedFirstRun = true;
  writeSettings();
  broadcastState();
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
    settings.visible = false;
  } else {
    win.showInactive();
    settings.visible = true;
  }
  writeSettings();
  broadcastState();
  refreshTrayMenu();
}

function toggleMode() {
  console.info('[yumiko][mode] toggleMode shortcut/menu', { previousMode: settings.mode });
  setMode(settings.mode === 'focus' ? 'chat' : 'focus', { userPickedMode: true });
}

function showAndFocusChat() {
  if (!win) return;
  settings.visible = true;
  writeSettings();
  win.show();
  win.focus();
  setMode('chat', { userPickedMode: true });
}

function showChatInactive() {
  if (!win) return;
  settings.visible = true;
  writeSettings();
  win.showInactive();
  setMode('chat', { userPickedMode: true });
}

function refreshTrayMenu() {
  if (!tray || !win) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: win.isVisible() ? 'Hide' : 'Show', click: toggleVisible },
    { label: 'Toggle Focus/Chat', click: toggleMode },
    {
      label: 'Modo Overlay (Siempre arriba)',
      type: 'checkbox',
      checked: Boolean(settings.overlayEnabled),
      click: (item) => setOverlayEnabled(item.checked)
    },
    {
      label: 'Click-through (dejar pasar clicks)',
      type: 'checkbox',
      checked: Boolean(settings.clickThroughPreferred),
      click: (item) => setClickThroughEnabled(item.checked)
    },
    {
      label: 'Atajos globales',
      type: 'checkbox',
      checked: Boolean(settings.shortcutsEnabled),
      click: (item) => setShortcutsEnabled(item.checked)
    },
    {
      label: 'Panic reset (Ctrl+Alt+R)',
      click: panicResetWindowAndRenderer
    },
    {
      label: 'Panic safe mode (Ctrl+Alt+Shift+S)',
      click: panicDisableOverlayAndClickThrough
    },
    {
      label: 'Emergencia click-through (Ctrl+Alt+C)',
      click: () => setClickThroughEnabled(!settings.clickThroughPreferred)
    },
    { type: 'separator' },
    { label: 'Quit', click: quitApp }
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAhFBMVEUAAAAAAAAAAAD////Q0NC0tLSjo6OWlpb4+Pjr6+uVlZWJiYm2traysrL29vbe3t7V1dWurq6EhISRkZGcnJyqqqq4uLji4uKampq0tLS+vr6oqKjY2NjExMQyMjJjY2O9vb3Kysrw8PCSkpL7+/vFxcXf39+Ojo7R0dHk5OT39/cPKu8eAAAAK3RSTlMAAQIDBQYHCAkKDA8QERMWFxgZGx0fISMkJSgrLi8wMzc4O0RHUFBRUlRxn7sAAABSSURBVBgZBcEHEoAgDAXQNzJshzBzbP9VSC2I+Vh0M3VGlN9xq8fL9xQzkM2sCV0YV2d6X2Ko0iN6Lz2Vr0Sxq7s0Yy+CI1Y4o3c36z4o2w9aF0nWdwx6XwAAAABJRU5ErkJggg==');
  tray = new Tray(icon);
  tray.setToolTip('Yumiko Overlay');
  tray.on('click', toggleVisible);
  refreshTrayMenu();
}

function saveBounds() {
  if (!win) return;
  settings.bounds = win.getBounds();
  writeSettings();
}

function handleDeepLink(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return;
  if (!rawUrl.startsWith('yumiko://')) return;

  try {
    const parsed = new URL(rawUrl);
    const hostAction = parsed.hostname;
    if (hostAction === 'auth') {
      const code = parsed.searchParams.get('code')?.trim();
      if (code) {
        if (processedAuthCodes.has(code)) {
          return;
        }
        processedAuthCodes.add(code);
        console.info('[yumiko][auth] received code');
        pendingAuthCode = code;
        exchangeCode(code, { showFeedback: true }).catch((error) => {
          console.warn('[yumiko][auth] deep link exchange failed', {
            reason: typeof error?.message === 'string' ? error.message : 'unknown'
          });
        });
      }
    } else if (hostAction === 'open') {
      showAndFocusChat();
    }
  } catch {
    if (rawUrl.startsWith('yumiko://open')) {
      showAndFocusChat();
    }
  }
}

function sendAuthFeedback(message) {
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
  win.webContents.send('yumiko:auth-result', { message });
}

async function exchangeCode(code, { deviceId, deviceName, showFeedback = false } = {}) {
  const trimmedCode = typeof code === 'string' ? code.trim() : '';
  if (!trimmedCode) {
    throw new Error('Missing pairing code');
  }

  try {
    await exchangePairingCode(trimmedCode, { deviceId, deviceName });
    console.info('[yumiko][auth] exchange success');
    if (showFeedback) {
      showAndFocusChat();
      sendAuthFeedback('Vinculado ✅');
    }
  } catch (error) {
    const isConflict = error?.status === 409 || String(error?.apiError || '').includes('23505');
    if (isConflict) {
      console.warn('[yumiko][auth] exchange conflict, retrying once');
      await exchangePairingCode(trimmedCode, { deviceId, deviceName });
      if (showFeedback) {
        showAndFocusChat();
        sendAuthFeedback('Vinculado ✅');
      }
      return { ok: true };
    }

    if (showFeedback && error?.status === 400 && String(error?.apiError || '').includes('invalid_code')) {
      showAndFocusChat();
      sendAuthFeedback('Código inválido/expirado. Generá uno nuevo.');
    }
    throw error;
  } finally {
    if (pendingAuthCode === trimmedCode) {
      pendingAuthCode = '';
    }
  }

  return { ok: true };
}

function loadAuthStateFromDisk() {
  const persisted = readAuth();
  const session = getPersistedSession(persisted);
  if (typeof session?.device_id === 'string' && session.device_id) {
    settings.deviceId = session.device_id;
  }

  authState = {
    connected: Boolean(session?.refresh_token),
    user_id: typeof session?.user_id === 'string' ? session.user_id : '',
    device_id: settings.deviceId,
    device_name: settings.deviceName
  };

  if (typeof session?.access_token === 'string') {
    settings.overlayAccessToken = session.access_token;
  }
}

function logAuthIssue(scope, error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'AUTH_MISSING' || code === 'AUTH_INVALID') {
    console.warn(`[yumiko][auth] ${code} on ${scope}`);
  }
}

function handleArgvForDeepLink(argv = []) {
  const deepLink = argv.find((arg) => typeof arg === 'string' && arg.startsWith('yumiko://'));
  if (deepLink) {
    handleDeepLink(deepLink);
  }
}

function createWindow() {
  ensureInteractiveStartup();

  const runtimeSource = app.isPackaged ? 'packaged-app.asar' : 'electron-source';
  console.info('[yumiko][bootstrap] source', {
    runtimeSource,
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    dirname: __dirname,
    argv: process.argv
  });

  const bounds = getInitialBounds();
  win = new BrowserWindow({
    ...bounds,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: Boolean(settings.overlayEnabled),
    minWidth: 220,
    minHeight: 220,
    resizable: settings.mode === 'chat',
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenuBarVisibility(false);
  if (typeof win.setHasShadow === 'function') {
    win.setHasShadow(false);
  }
  win.loadFile(path.join(__dirname, 'renderer.html'));

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[yumiko] did-fail-load', { errorCode, errorDescription, validatedURL });
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[yumiko] render-process-gone', { reason: details?.reason });
  });

  if (process.env.YUMIKO_DEBUG === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.on('move', saveBounds);
  win.on('resize', saveBounds);
  win.on('show', () => {
    settings.visible = true;
    writeSettings();
    broadcastState();
    refreshTrayMenu();
  });
  win.on('hide', () => {
    settings.visible = false;
    writeSettings();
    broadcastState();
    refreshTrayMenu();
  });
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('will-resize', (event, newBounds) => {
    if (settings.mode !== 'chat') {
      event.preventDefault();
      return;
    }

    const { minW, minH } = focusMinBounds;
    if (!minW || !minH) return;
    if (newBounds.width >= minW && newBounds.height >= minH) return;

    event.preventDefault();
    win.setBounds({
      ...newBounds,
      width: Math.max(newBounds.width, minW),
      height: Math.max(newBounds.height, minH)
    });
  });

  win.webContents.on('did-finish-load', () => {
    ensureInteractiveStartup();
    if (!settings.visible) {
      win.hide();
    }
    applyWindowBehavior();
    setMode(settings.mode);

    if (pendingAuthCode) {
      win.webContents.send('yumiko:auth-code', { code: pendingAuthCode });
    }
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  console.info('[yumiko][app] single instance lock acquired');
  app.on('second-instance', (_event, argv) => {
    handleArgvForDeepLink(argv);
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient('yumiko');
    ensureDeviceIdentity();
    loadAuthStateFromDisk();
    writeSettings();

    createWindow();
    createTray();
    updateGlobalShortcuts();

    ipcMain.handle('yumiko:get-state', () => getState());
    ipcMain.handle('yumiko:chat-history', async () => {
      try {
        return await withOverlayAccessToken((overlayAccessToken) => chatClient.fetchHistory({
          baseUrl: YUMIKO_WEB_ORIGIN,
          overlayAccessToken
        }));
      } catch (error) {
        logAuthIssue('chat-history', error);
        throw error;
      }
    });
    ipcMain.handle('yumiko:chat-send', async (_event, payload) => {
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      const contextMessages = Array.isArray(payload?.contextMessages) ? payload.contextMessages : [];
      if (!message) {
        return { reply: '' };
      }
      try {
        return await withOverlayAccessToken((overlayAccessToken) => chatClient.sendMessage({
          baseUrl: YUMIKO_WEB_ORIGIN,
          overlayAccessToken,
          message,
          contextMessages
        }));
      } catch (error) {
        logAuthIssue('chat-send', error);
        throw error;
      }
    });
    ipcMain.handle('yumiko:chat-request-nudge', async (_event, payload) => {
      const intervalMinutes = Number(payload?.intervalMinutes);
      try {
        return await withOverlayAccessToken((overlayAccessToken) => chatClient.requestNudge({
          baseUrl: YUMIKO_WEB_ORIGIN,
          overlayAccessToken,
          intervalMinutes
        }));
      } catch (error) {
        logAuthIssue('chat-request-nudge', error);
        throw error;
      }
    });
    ipcMain.handle('yumiko:chat-update-nudge-settings', async (_event, payload) => {
      const intervalMinutes = Number(payload?.intervalMinutes);
      const enabled = Boolean(payload?.enabled);
      try {
        return await withOverlayAccessToken((overlayAccessToken) => chatClient.updateNudgeSettings({
          baseUrl: YUMIKO_WEB_ORIGIN,
          overlayAccessToken,
          enabled,
          intervalMinutes
        }));
      } catch (error) {
        logAuthIssue('chat-update-nudge-settings', error);
        throw error;
      }
    });
    ipcMain.handle('yumiko:disconnect-overlay', async () => {
      await disconnectOverlayDevice();
      return getState();
    });
    ipcMain.handle('yumiko:open-overlay-connect', async () => {
      const params = new URLSearchParams({
        device_id: settings.deviceId,
        device_name: settings.deviceName
      });
      await shell.openExternal(`${YUMIKO_WEB_ORIGIN}/overlay/connect?${params.toString()}`);
      return true;
    });
    ipcMain.handle('yumiko:exchange-auth-code', async (_event, payload) => {
      const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
      await exchangeCode(code, {
        deviceId: payload?.deviceId,
        deviceName: payload?.deviceName
      });
      return { ok: true };
    });
    ipcMain.handle('yumiko:get-auth', () => ({ ...authState }));
    ipcMain.handle('yumiko:auth-status', () => ({
      connected: Boolean(authState.connected),
      user_id: authState.user_id,
      device_id: authState.device_id,
      connectedAt: readAuth()?.connectedAt || null
    }));
    ipcMain.handle('yumiko:disconnect', async () => {
      markOverlayDisconnected({ clearStoredRefreshToken: true });
      return { ok: true };
    });
    ipcMain.on('yumiko:set-mode', (_event, mode) => {
      setMode(mode, { fromRenderer: true, userPickedMode: true });
    });
    ipcMain.on('yumiko:set-shortcuts-enabled', (_event, enabled) => setShortcutsEnabled(enabled));
    ipcMain.on('yumiko:set-click-through-enabled', (_event, enabled) => setClickThroughEnabled(enabled));
    ipcMain.on('yumiko:set-overlay-enabled', (_event, enabled) => setOverlayEnabled(enabled));
    ipcMain.on('yumiko:complete-first-run', () => completeFirstRun());
    ipcMain.on('yumiko:close-window', () => {
      if (!win || win.isDestroyed()) return;
      console.info('[yumiko][window] hide requested from renderer');
      win.close();
    });
    ipcMain.on('yumiko:quit', quitApp);
    ipcMain.on('yumiko:set-window-size', (_event, payload) => {
      if (!win || win.isDestroyed()) return;

      const requestedWidth = Number(payload?.width);
      const requestedHeight = Number(payload?.height);
      if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight)) return;

      const isRidiculous = requestedWidth < 200 || requestedHeight < 200;
      if (isRidiculous) {
        console.warn('[yumiko][window] ignored unsafe set-window-size request', { requestedWidth, requestedHeight });
        return;
      }

      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const newW = clamp(Math.round(requestedWidth), 200, 1200);
      const newH = clamp(Math.round(requestedHeight), 200, 900);

      if (payload?.anchor === 'bottom-right' && !payload?.preservePosition) {
        const old = win.getBounds();
        const newX = old.x + (old.width - newW);
        const newY = old.y + (old.height - newH);
        const anchoredBounds = safeBounds({ x: newX, y: newY, width: newW, height: newH }, 'ipc:set-window-size:anchor');
        win.setBounds(clampBoundsToWorkArea(anchoredBounds), false);
        return;
      }

      const { x, y } = win.getBounds();
      const nextBounds = safeBounds({ x, y, width: newW, height: newH }, 'ipc:set-window-size');
      win.setBounds(clampBoundsToWorkArea(nextBounds), false);
    });
    ipcMain.on('yumiko:set-minimum-size', (_event, payload) => {
      setFocusMinimumBounds(payload);
    });
    ipcMain.on('yumiko:set-focus-min-size', (_event, payload) => {
      setFocusMinimumBounds(payload);
    });

    handleArgvForDeepLink(process.argv);
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('window-all-closed', () => {
  app.quit();
});
