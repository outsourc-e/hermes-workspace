const { contextBridge, ipcRenderer } = require('electron')

const updateListenerMap = new Map()

contextBridge.exposeInMainWorld('hermesDesktop', {
  bootstrap: {
    status: () => ipcRenderer.invoke('desktop:status'),
    installHermes: () => ipcRenderer.invoke('desktop:install-hermes'),
    startBackend: () => ipcRenderer.invoke('desktop:start-backend'),
    openLogs: () => ipcRenderer.invoke('desktop:open-logs'),
  },
  updates: {
    check: () => ipcRenderer.invoke('desktop:update-check'),
    getState: () => ipcRenderer.invoke('desktop:update-state'),
    onStateChange: (callback) => {
      const wrapped = (_event, data) => callback(data)
      updateListenerMap.set(callback, wrapped)
      ipcRenderer.on('desktop:update-state', wrapped)
    },
    removeStateListener: (callback) => {
      const wrapped = updateListenerMap.get(callback)
      if (wrapped) {
        ipcRenderer.removeListener('desktop:update-state', wrapped)
        updateListenerMap.delete(callback)
      }
    },
  },
  app: {
    version: process.env.npm_package_version || '2.1.3',
    platform: process.platform,
    isElectron: true,
  },
})
