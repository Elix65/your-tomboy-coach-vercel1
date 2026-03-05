const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yumikoOverlay', {
  setMode: (mode) => ipcRenderer.send('yumiko:set-mode', mode),
  setOverlayEnabled: (enabled) => ipcRenderer.send('yumiko:set-overlay-enabled', enabled),
  setShortcutsEnabled: (enabled) => ipcRenderer.send('yumiko:set-shortcuts-enabled', enabled),
  setClickThroughEnabled: (enabled) => ipcRenderer.send('yumiko:set-click-through-enabled', enabled),
  setWindowSize: (size) => ipcRenderer.send('yumiko:set-window-size', size),
  completeFirstRun: () => ipcRenderer.send('yumiko:complete-first-run'),
  closeWindow: () => ipcRenderer.send('yumiko:close-window'),
  quit: () => ipcRenderer.send('yumiko:quit'),
  getState: () => ipcRenderer.invoke('yumiko:get-state'),
  chat: {
    getHistory: () => ipcRenderer.invoke('yumiko:chat-history'),
    sendMessage: ({ message, contextMessages }) => ipcRenderer.invoke('yumiko:chat-send', { message, contextMessages })
  },
  disconnectOverlay: () => ipcRenderer.invoke('yumiko:disconnect-overlay'),
  openOverlayConnect: () => ipcRenderer.invoke('yumiko:open-overlay-connect'),
  exchangeAuthCode: ({ code, deviceId, deviceName }) => ipcRenderer.invoke('yumiko:exchange-auth-code', { code, deviceId, deviceName }),
  getAuth: () => ipcRenderer.invoke('yumiko:get-auth'),
  getAuthStatus: () => ipcRenderer.invoke('yumiko:auth-status'),
  disconnect: () => ipcRenderer.invoke('yumiko:disconnect'),
  onStateUpdated: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('yumiko:state-updated', listener);
    return () => ipcRenderer.removeListener('yumiko:state-updated', listener);
  },
  onAuthCode: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:auth-code', listener);
    return () => ipcRenderer.removeListener('yumiko:auth-code', listener);
  },
  onAuthResult: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:auth-result', listener);
    return () => ipcRenderer.removeListener('yumiko:auth-result', listener);
  },
  onResizeAttempt: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:resize-attempt', listener);
    return () => ipcRenderer.removeListener('yumiko:resize-attempt', listener);
  }
});
