const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hermesDesktop', {
  bootstrap: {
    status: () => ipcRenderer.invoke('desktop:status'),
    installHermes: () => ipcRenderer.invoke('desktop:install-hermes'),
    startBackend: () => ipcRenderer.invoke('desktop:start-backend'),
    openLogs: () => ipcRenderer.invoke('desktop:open-logs'),
  },
  app: {
    version: process.env.npm_package_version || '2.1.3',
    platform: process.platform,
    isElectron: true,
  },
})
