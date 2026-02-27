const { app, BrowserWindow, globalShortcut, Menu, Tray, nativeImage } = require('electron');

let win;
let tray;
let mode = 'focus';

function refreshTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: win?.isVisible() ? 'Ocultar' : 'Mostrar', click: toggleVisible },
    { label: `Cambiar a ${mode === 'focus' ? 'chat' : 'focus'}`, click: toggleMode },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

function setFocusMode(enabled) {
  mode = enabled ? 'focus' : 'chat';
  if (win) {
    win.setIgnoreMouseEvents(enabled, { forward: true });
  }
  refreshTrayMenu();
}

function createWindow() {
  win = new BrowserWindow({
    width: 360,
    height: 520,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadURL('https://21-moon.com/widget/');
  setFocusMode(true);
  win.on('show', refreshTrayMenu);
  win.on('hide', refreshTrayMenu);
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else win.show();
}

function toggleMode() {
  setFocusMode(mode !== 'focus');
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAhFBMVEUAAAAAAAAAAAD////Q0NC0tLSjo6OWlpb4+Pjr6+uVlZWJiYm2traysrL29vbe3t7V1dWurq6EhISRkZGcnJyqqqq4uLji4uKampq0tLS+vr6oqKjY2NjExMQyMjJjY2O9vb3Kysrw8PCSkpL7+/vFxcXf39+Ojo7R0dHk5OT39/cPKu8eAAAAK3RSTlMAAQIDBQYHCAkKDA8QERMWFxgZGx0fISMkJSgrLi8wMzc4O0RHUFBRUlRxn7sAAABSSURBVBgZBcEHEoAgDAXQNzJshzBzbP9VSC2I+Vh0M3VGlN9xq8fL9xQzkM2sCV0YV2d6X2Ko0iN6Lz2Vr0Sxq7s0Yy+CI1Y4o3c36z4o2w9aF0nWdwx6XwAAAABJRU5ErkJggg==');
  tray = new Tray(icon);
  tray.setToolTip('Yumiko Overlay');
  tray.on('click', toggleVisible);
  refreshTrayMenu();
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+Y', toggleVisible);
  globalShortcut.register('CommandOrControl+Shift+M', toggleMode);
  globalShortcut.register('Escape', () => setFocusMode(true));
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
