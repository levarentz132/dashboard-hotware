// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Fetch config synchronously for immediate use in lib/config.ts
const electronConfig = ipcRenderer.sendSync('setup:get-config-sync');
contextBridge.exposeInMainWorld('electronConfig', electronConfig);

contextBridge.exposeInMainWorld('electron', {
  ping: () => 'pong',
  setup: {
    validateCloud: (creds) => ipcRenderer.invoke('setup:validate-cloud', creds),
    checkRelay: (systemId) => ipcRenderer.invoke('setup:check-relay', systemId),
    save: (data) => ipcRenderer.invoke('setup:save', data),
    getConfig: () => ipcRenderer.invoke('setup:get-config'),
    launch: () => ipcRenderer.send('setup:launch')
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
    getFullscreen: () => ipcRenderer.invoke('window:get-fullscreen'),
    onFullscreenChange: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('window:fullscreen-changed', listener);
      return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
    },
    onDownloadProgress: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('download-progress', listener);
      return () => ipcRenderer.removeListener('download-progress', listener);
    },
    onInstalling: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('update:installing', listener);
      return () => ipcRenderer.removeListener('update:installing', listener);
    }
  }
});
