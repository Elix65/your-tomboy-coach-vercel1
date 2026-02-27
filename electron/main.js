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

const OVERLAY_URL = 'https://21-moon.com/widget/';
const DEFAULT_BOUNDS = { width: 420, height: 260 };
const SETTINGS_FILE = 'settings.json';

let tray;
let win;
let isQuitting = false;

const defaultSettings = {
  mode: 'focus',
  visible: true,
  bounds: null
};

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return { ...defaultSettings, ...JSON.parse(raw) };
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

function setMode(mode, { fromRenderer = false } = {}) {
  const nextMode = mode === 'chat' ? 'chat' : 'focus';
  settings.mode = nextMode;
  writeSettings();

  if (!win) return;

  const isFocus = nextMode === 'focus';
  win.setIgnoreMouseEvents(isFocus, { forward: true });
  if (!isFocus) {
    win.show();
    win.focus();
  }

  if (!fromRenderer && !win.webContents.isLoading()) {
    win.webContents.executeJavaScript(`window.yumikoWidget?.setMode?.(${JSON.stringify(nextMode)});`, true).catch(() => {});
  }

  refreshTrayMenu();
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
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
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
  const bounds = getInitialBounds();
  win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenuBarVisibility(false);
  win.loadURL(OVERLAY_URL);

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      setMode('focus');
    }
  });

  win.on('move', saveBounds);
  win.on('resize', saveBounds);
  win.on('show', () => {
    settings.visible = true;
    writeSettings();
    refreshTrayMenu();
  });
  win.on('hide', () => {
    settings.visible = false;
    writeSettings();
    refreshTrayMenu();
  });
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.webContents.on('did-finish-load', () => {
    setMode(settings.mode);
    if (!settings.visible) {
      win.hide();
    }
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

    globalShortcut.register('CommandOrControl+Shift+Y', toggleVisible);
    globalShortcut.register('CommandOrControl+Shift+M', toggleMode);

    ipcMain.handle('yumiko:get-state', () => settings);
    ipcMain.on('yumiko:set-mode', (_event, mode) => setMode(mode, { fromRenderer: true }));

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
