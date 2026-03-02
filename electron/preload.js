const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yumikoOverlay', {
  setMode: (mode) => ipcRenderer.send('yumiko:set-mode', mode),
  setOverlayEnabled: (enabled) => ipcRenderer.send('yumiko:set-overlay-enabled', enabled),
  setShortcutsEnabled: (enabled) => ipcRenderer.send('yumiko:set-shortcuts-enabled', enabled),
  setClickThroughEnabled: (enabled) => ipcRenderer.send('yumiko:set-click-through-enabled', enabled),
  completeFirstRun: () => ipcRenderer.send('yumiko:complete-first-run'),
  closeWindow: () => ipcRenderer.send('yumiko:close-window'),
  quit: () => ipcRenderer.send('yumiko:quit'),
  getState: () => ipcRenderer.invoke('yumiko:get-state'),
  chat: {
    sendMessage: (payload) => ipcRenderer.invoke('yumiko:chat:send', payload)
  },
  onStateUpdated: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('yumiko:state-updated', listener);
    return () => ipcRenderer.removeListener('yumiko:state-updated', listener);
  }
});
