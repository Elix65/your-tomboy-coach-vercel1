const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yumikoOverlay', {
  setMode: (mode) => ipcRenderer.send('yumiko:set-mode', mode),
  setShortcutsEnabled: (enabled) => ipcRenderer.send('yumiko:set-shortcuts-enabled', enabled),
  setClickThroughEnabled: (enabled) => ipcRenderer.send('yumiko:set-click-through-enabled', enabled),
  getState: () => ipcRenderer.invoke('yumiko:get-state')
});
