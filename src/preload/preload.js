const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ekoVision', Object.freeze({
  getScreenSources: () => ipcRenderer.invoke('ekovision:get-screen-sources'),
  getSignalPort: () => ipcRenderer.invoke('ekovision:get-signal-port'),
  getWebPort: () => ipcRenderer.invoke('ekovision:get-web-port')
}));