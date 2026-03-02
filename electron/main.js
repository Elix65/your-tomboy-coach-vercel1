const path = require('node:path');
const fs = require('node:fs');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  screen
} = require('electron');

const DEFAULT_BOUNDS = { width: 560, height: 380 };
const SETTINGS_FILE = 'settings.json';

let tray;
let win;
let isQuitting = false;

const defaultSettings = {
  mode: 'chat',
  overlayEnabled: false,
  clickThroughEnabled: false,
  shortcutsEnabled: false,
  visible: true,
  bounds: null,
  hasCompletedFirstRun: false
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

  win.setAlwaysOnTop(Boolean(settings.overlayEnabled));

  const canUseClickThrough = settings.hasCompletedFirstRun;
  const enableClickThrough = canUseClickThrough
    && settings.overlayEnabled
    && settings.clickThroughEnabled
    && settings.mode === 'focus';
  win.setIgnoreMouseEvents(enableClickThrough, { forward: true });

  if (!enableClickThrough) {
    win.show();
    win.focus();
  }

  broadcastState();
  refreshTrayMenu();
}

function setMode(mode, { fromRenderer = false } = {}) {
  const nextMode = mode === 'chat' ? 'chat' : 'focus';
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
  if (win && !win.isDestroyed()) {
    win.loadFile(path.join(__dirname, 'index.html')).catch(() => {
      win.loadFile(path.join(__dirname, '..', 'widget', 'index.html')).catch(() => {});
    });
  }
  broadcastState();
}

function resolveWidgetPage() {
  const electronWidgetPage = path.join(__dirname, 'index.html');
  if (fs.existsSync(electronWidgetPage)) return electronWidgetPage;
  return path.join(__dirname, '..', 'widget', 'index.html');
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
    if (hostAction === 'open') {
      showAndFocusChat();
    }
  } catch {
    if (rawUrl.startsWith('yumiko://open')) {
      showAndFocusChat();
    }
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
  const startPage = settings.hasCompletedFirstRun ? resolveWidgetPage() : path.join(__dirname, 'renderer.html');
  win.loadFile(startPage);

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
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    handleArgvForDeepLink(argv);
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient('yumiko');

    createWindow();
    createTray();
    updateGlobalShortcuts();

    ipcMain.handle('yumiko:get-state', () => settings);
    ipcMain.on('yumiko:set-mode', (_event, mode) => setMode(mode, { fromRenderer: true }));
    ipcMain.on('yumiko:set-shortcuts-enabled', (_event, enabled) => setShortcutsEnabled(enabled));
    ipcMain.on('yumiko:set-click-through-enabled', (_event, enabled) => setClickThroughEnabled(enabled));
    ipcMain.on('yumiko:set-overlay-enabled', (_event, enabled) => setOverlayEnabled(enabled));
    ipcMain.on('yumiko:complete-first-run', () => completeFirstRun());
    ipcMain.on('yumiko:close-window', () => {
      if (!win || win.isDestroyed()) return;
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
