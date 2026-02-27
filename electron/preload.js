const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yumikoOverlay', {
  setMode: (mode) => ipcRenderer.send('yumiko:set-mode', mode),
  getState: () => ipcRenderer.invoke('yumiko:get-state')
});
