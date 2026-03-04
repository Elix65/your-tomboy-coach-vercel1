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
const keytar = require('keytar');

const DEFAULT_BOUNDS = { width: 560, height: 380 };
const SETTINGS_FILE = 'settings.json';
const KEYTAR_SERVICE = 'yumiko-overlay';
const TOKEN_FALLBACK_FILE = 'overlay-token-store.json';

let tray;
let win;
let isQuitting = false;
let pendingAuthCode = '';
const processedAuthCodes = new Set();

const defaultSettings = {
  mode: 'chat',
  overlayEnabled: false,
  clickThroughEnabled: false,
  shortcutsEnabled: false,
  visible: true,
  bounds: null,
  hasCompletedFirstRun: false,
  chatBaseUrl: process.env.YUMIKO_CHAT_URL || 'https://21-moon.com',
  deviceId: '',
  deviceName: '',
  overlayAccessToken: '',
  overlayAccountEmail: '',
  conversationId: ''
};

const SHORTCUTS = {
  toggleVisible: 'CommandOrControl+Shift+Y',
  toggleMode: 'CommandOrControl+Shift+M',
  forceQuit: 'CommandOrControl+Shift+Q',
  panicSafeMode: 'CommandOrControl+Alt+Shift+S'
};

function shouldForceInteractiveStartup() {
  return settings.visible || !settings.hasCompletedFirstRun;
}

function ensureInteractiveStartup() {
  if (!shouldForceInteractiveStartup()) return;
  if (settings.clickThroughEnabled) {
    settings.clickThroughEnabled = false;
    writeSettings();
  }
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(false);
  }
}

function panicDisableOverlayAndClickThrough() {
  settings.clickThroughEnabled = false;
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
    return { ...defaultSettings, ...JSON.parse(raw), clickThroughEnabled: false };
  } catch {
    return { ...defaultSettings };
  }
}

let settings = readSettings();

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

async function saveRefreshToken(token) {
  try {
    if (keytar?.setPassword) {
      await keytar.setPassword(KEYTAR_SERVICE, settings.deviceId, token);
      return;
    }
  } catch (error) {
    console.warn('[yumiko][auth] keytar save failed, using local fallback', {
      reason: typeof error?.message === 'string' ? error.message : 'unknown'
    });
  }

  writeTokenFallback({ refreshToken: token });
}

async function saveAccessToken(token) {
  try {
    if (keytar?.setPassword) {
      await keytar.setPassword(KEYTAR_SERVICE, `${settings.deviceId}:access`, token);
      return;
    }
  } catch (error) {
    console.warn('[yumiko][auth] keytar save access failed, using local fallback', {
      reason: typeof error?.message === 'string' ? error.message : 'unknown'
    });
  }

  writeTokenFallback({ accessToken: token });
}

async function readRefreshToken() {
  try {
    if (keytar?.getPassword) {
      const storedToken = await keytar.getPassword(KEYTAR_SERVICE, settings.deviceId);
      if (typeof storedToken === 'string' && storedToken) {
        return storedToken;
      }
    }
  } catch (error) {
    console.warn('[yumiko][auth] keytar read failed, using local fallback', {
      reason: typeof error?.message === 'string' ? error.message : 'unknown'
    });
  }

  return readTokenFallback().refreshToken || '';
}

async function clearRefreshToken() {
  try {
    if (keytar?.deletePassword) {
      await keytar.deletePassword(KEYTAR_SERVICE, settings.deviceId);
    }
  } catch (error) {
    console.warn('[yumiko][auth] keytar clear failed, cleaning local fallback', {
      reason: typeof error?.message === 'string' ? error.message : 'unknown'
    });
  }

  writeTokenFallback({ refreshToken: '' });
}

async function clearAccessToken() {
  try {
    if (keytar?.deletePassword) {
      await keytar.deletePassword(KEYTAR_SERVICE, `${settings.deviceId}:access`);
    }
  } catch (error) {
    console.warn('[yumiko][auth] keytar clear access failed, cleaning local fallback', {
      reason: typeof error?.message === 'string' ? error.message : 'unknown'
    });
  }

  writeTokenFallback({ accessToken: '' });
}

function tokenFallbackPath() {
  return path.join(app.getPath('userData'), TOKEN_FALLBACK_FILE);
}

function tokenFallbackSecret() {
  return crypto.createHash('sha256')
    .update(`${settings.deviceId || 'yumiko-device'}::${app.getName()}::overlay-fallback`)
    .digest();
}

function obfuscateTokenPayload(payload) {
  const serialized = JSON.stringify(payload);
  const source = Buffer.from(serialized, 'utf8');
  const secret = tokenFallbackSecret();
  const obfuscated = Buffer.alloc(source.length);

  for (let index = 0; index < source.length; index += 1) {
    obfuscated[index] = source[index] ^ secret[index % secret.length];
  }

  return obfuscated.toString('base64');
}

function deobfuscateTokenPayload(input) {
  const source = Buffer.from(input, 'base64');
  const secret = tokenFallbackSecret();
  const decoded = Buffer.alloc(source.length);

  for (let index = 0; index < source.length; index += 1) {
    decoded[index] = source[index] ^ secret[index % secret.length];
  }

  return JSON.parse(decoded.toString('utf8'));
}

function readTokenFallback() {
  try {
    const raw = fs.readFileSync(tokenFallbackPath(), 'utf8');
    if (!raw) return {};
    const parsed = deobfuscateTokenPayload(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeTokenFallback(nextPatch = {}) {
  const previous = readTokenFallback();
  const next = { ...previous, ...nextPatch };
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(tokenFallbackPath(), obfuscateTokenPayload(next));
}

async function markOverlayDisconnected({ clearStoredRefreshToken = false } = {}) {
  if (clearStoredRefreshToken) {
    await clearRefreshToken();
    await clearAccessToken();
  }
  settings.overlayAccessToken = '';
  settings.overlayAccountEmail = '';
  writeSettings();
  broadcastState();
}

function applyExchangeResponse(data = {}) {
  settings.overlayAccessToken = typeof data?.access_token === 'string'
    ? data.access_token
    : (typeof data?.accessToken === 'string' ? data.accessToken : '');
  settings.overlayAccountEmail = typeof data?.email === 'string' ? data.email : '';
  settings.visible = true;
  writeSettings();
  broadcastState();
}

async function exchangePairingCode(code) {
  const exchangeUrl = `${settings.chatBaseUrl.replace(/\/$/, '')}/api/overlay/link/exchange`;
  const res = await fetch(exchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      device_id: settings.deviceId,
      device_name: settings.deviceName,
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
      throw new Error(`HTTP ${res.status} ${serverError}`);
    }

    throw new Error(`HTTP ${res.status} exchange_failed`);
  }

  const accessToken = data?.accessToken || data?.access_token || data?.token;
  const refreshToken = data?.refreshToken || data?.refresh_token;
  const expiresIn = data?.expiresIn ?? data?.expires_in;
  const receivedKeys = data && typeof data === 'object' ? Object.keys(data) : [];

  if (typeof accessToken !== 'string' || !accessToken
    || typeof refreshToken !== 'string' || !refreshToken
    || !Number.isFinite(Number(expiresIn))) {
    throw new Error(`missing_token_fields keys=${receivedKeys.join(',') || '<none>'}`);
  }

  await saveRefreshToken(refreshToken);
  await saveAccessToken(accessToken);
  applyExchangeResponse({
    ...data,
    access_token: accessToken,
    refresh_token: refreshToken
  });
}

async function refreshOverlayAccessToken() {
  const refreshToken = await readRefreshToken();
  if (!refreshToken) {
    await markOverlayDisconnected();
    const error = new Error('No refresh token stored for this device');
    error.code = 'AUTH_MISSING';
    throw error;
  }

  const refreshUrl = `${settings.chatBaseUrl.replace(/\/$/, '')}/api/overlay/token/refresh`;
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
      await markOverlayDisconnected({ clearStoredRefreshToken: true });
    }
    const error = new Error(`Token refresh failed (HTTP ${response.status})`);
    error.code = response.status === 401 ? 'AUTH_INVALID' : 'AUTH_REFRESH_FAILED';
    throw error;
  }

  const data = await response.json();
  if (typeof data?.refresh_token === 'string' && data.refresh_token) {
    await saveRefreshToken(data.refresh_token);
  }
  applyExchangeResponse({
    access_token: data?.access_token,
    email: data?.email || settings.overlayAccountEmail
  });
  return settings.overlayAccessToken;
}

function isAuthRetryableError(error) {
  return error?.code === 'AUTH_INVALID' || error?.status === 401;
}

async function withOverlayAccessToken(requestFn) {
  let token = settings.overlayAccessToken;
  if (!token) {
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
  const revokeUrl = `${settings.chatBaseUrl.replace(/\/$/, '')}/api/overlay/revoke-device`;
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

  await markOverlayDisconnected({ clearStoredRefreshToken: true });
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
  win.webContents.send('yumiko:state-updated', settings);
}

function applyWindowBehavior() {
  if (!win) return;

  win.setAlwaysOnTop(Boolean(settings.overlayEnabled), 'floating');

  const canUseClickThrough = settings.hasCompletedFirstRun;
  const enableClickThrough = canUseClickThrough
    && settings.overlayEnabled
    && settings.clickThroughEnabled
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

function setMode(mode, { fromRenderer = false } = {}) {
  const nextMode = mode === 'chat' ? 'chat' : 'focus';
  console.info('[yumiko][mode] setMode', {
    previousMode: settings.mode,
    nextMode,
    source: fromRenderer ? 'renderer' : 'main'
  });
  settings.mode = nextMode;
  writeSettings();

  if (!win) return;

  applyWindowBehavior();

  if (!fromRenderer && !win.webContents.isLoading()) {
    win.webContents.executeJavaScript(`window.yumikoWidget?.setMode?.(${JSON.stringify(nextMode)});`, true).catch(() => {});
  }
}

function updateGlobalShortcuts() {
  globalShortcut.unregister(SHORTCUTS.toggleVisible);
  globalShortcut.unregister(SHORTCUTS.toggleMode);
  globalShortcut.unregister(SHORTCUTS.forceQuit);
  globalShortcut.unregister(SHORTCUTS.panicSafeMode);

  globalShortcut.register(SHORTCUTS.forceQuit, quitApp);
  globalShortcut.register(SHORTCUTS.panicSafeMode, panicDisableOverlayAndClickThrough);

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
  settings.clickThroughEnabled = Boolean(enabled);
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
  setMode(settings.mode === 'focus' ? 'chat' : 'focus');
}

function showAndFocusChat() {
  if (!win) return;
  settings.visible = true;
  writeSettings();
  win.show();
  win.focus();
  setMode('chat');
}

function showChatInactive() {
  if (!win) return;
  settings.visible = true;
  writeSettings();
  win.showInactive();
  setMode('chat');
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
      checked: Boolean(settings.clickThroughEnabled),
      click: (item) => setClickThroughEnabled(item.checked)
    },
    {
      label: 'Atajos globales',
      type: 'checkbox',
      checked: Boolean(settings.shortcutsEnabled),
      click: (item) => setShortcutsEnabled(item.checked)
    },
    {
      label: 'Panic safe mode (Ctrl+Alt+Shift+S)',
      click: panicDisableOverlayAndClickThrough
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
        showAndFocusChat();

        if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
          win.webContents.send('yumiko:auth-code', { code });
        }
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

  const bounds = getInitialBounds();
  win = new BrowserWindow({
    ...bounds,
    transparent: false,
    backgroundColor: '#121212',
    frame: false,
    alwaysOnTop: Boolean(settings.overlayEnabled),
    minWidth: 420,
    minHeight: 320,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenuBarVisibility(false);
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
    writeSettings();

    createWindow();
    createTray();
    updateGlobalShortcuts();

    ipcMain.handle('yumiko:get-state', () => settings);
    ipcMain.handle('yumiko:chat-history', async () => {
      try {
        return await withOverlayAccessToken((overlayAccessToken) => chatClient.fetchHistory({
          baseUrl: settings.chatBaseUrl,
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
          baseUrl: settings.chatBaseUrl,
          overlayAccessToken,
          message,
          contextMessages
        }));
      } catch (error) {
        logAuthIssue('chat-send', error);
        throw error;
      }
    });
    ipcMain.handle('yumiko:disconnect-overlay', async () => {
      await disconnectOverlayDevice();
      return settings;
    });
    ipcMain.handle('yumiko:open-overlay-connect', async () => {
      await shell.openExternal('https://21-moon.com/overlay/connect');
      return true;
    });
    ipcMain.handle('yumiko:exchange-auth-code', async (_event, payload) => {
      const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
      if (!code) {
        throw new Error('Missing pairing code');
      }

      console.info('[yumiko][auth] exchange started');
      try {
        await exchangePairingCode(code);
        console.info('[yumiko][auth] exchange success');
      } catch (error) {
        console.warn('[yumiko][auth] exchange fail', {
          reason: typeof error?.message === 'string' ? error.message : 'unknown'
        });
        throw error;
      } finally {
        if (pendingAuthCode === code) {
          pendingAuthCode = '';
        }
      }
      return settings;
    });
    ipcMain.on('yumiko:set-mode', (_event, mode) => setMode(mode, { fromRenderer: true }));
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
