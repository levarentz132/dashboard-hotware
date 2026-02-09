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
  }
});
