const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yumikoOverlay', {
  setMode: (mode) => ipcRenderer.send('yumiko:set-mode', mode),
  setOverlayEnabled: (enabled) => ipcRenderer.send('yumiko:set-overlay-enabled', enabled),
  setShortcutsEnabled: (enabled) => ipcRenderer.send('yumiko:set-shortcuts-enabled', enabled),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('yumiko:set-shortcuts', shortcuts),
  resetShortcuts: async () => {
    try {
      return await ipcRenderer.invoke('yumiko:reset-shortcuts');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.includes("No handler registered for 'yumiko:reset-shortcuts'")) {
        return ipcRenderer.invoke('yumiko:shortcuts-reset');
      }
      throw error;
    }
  },
  getSettings: () => ipcRenderer.invoke('yumiko:get-settings'),
  setClickThroughEnabled: (enabled) => ipcRenderer.send('yumiko:set-click-through-enabled', enabled),
  setWindowSize: (size) => ipcRenderer.send('yumiko:set-window-size', size),
  setMinimumSize: (size) => ipcRenderer.send('yumiko:set-minimum-size', size),
  setFocusMinSize: (size) => ipcRenderer.send('yumiko:set-focus-min-size', size),
  completeFirstRun: () => ipcRenderer.send('yumiko:complete-first-run'),
  closeWindow: () => ipcRenderer.send('yumiko:close-window'),
  quit: () => ipcRenderer.send('yumiko:quit'),
  getState: () => ipcRenderer.invoke('yumiko:get-state'),
  chat: {
    getHistory: () => ipcRenderer.invoke('yumiko:chat-history'),
    sendMessage: ({ message, contextMessages }) => ipcRenderer.invoke('yumiko:chat-send', { message, contextMessages }),
    requestNudge: ({ intervalMinutes }) => ipcRenderer.invoke('yumiko:chat-request-nudge', { intervalMinutes }),
    updateNudgeSettings: ({ enabled, intervalMinutes }) => ipcRenderer.invoke('yumiko:chat-update-nudge-settings', { enabled, intervalMinutes })
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
  },
  onPanicReset: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:panic-reset', listener);
    return () => ipcRenderer.removeListener('yumiko:panic-reset', listener);
  },
  onMiniScale: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:mini-scale', listener);
    return () => ipcRenderer.removeListener('yumiko:mini-scale', listener);
  },

  onFocusInput: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:focus-input', listener);
    return () => ipcRenderer.removeListener('yumiko:focus-input', listener);
  },
  onShortcutFeedback: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:shortcut-feedback', listener);
    return () => ipcRenderer.removeListener('yumiko:shortcut-feedback', listener);
  },
  onToggleChatFromHotkey: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yumiko:toggle-chat-from-hotkey', listener);
    return () => ipcRenderer.removeListener('yumiko:toggle-chat-from-hotkey', listener);
  },
  chatReady: () => ipcRenderer.send('yumiko:chat-ready')
});
