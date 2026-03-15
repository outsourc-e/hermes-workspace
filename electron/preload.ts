/**
 * Hermes Workspace Electron Preload Script
 * Exposes safe IPC bridge to renderer
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('clawsuite', {
  // Gateway management
  gateway: {
    check: () => ipcRenderer.invoke('gateway:check'),
    install: () => ipcRenderer.invoke('gateway:install'),
    start: () => ipcRenderer.invoke('gateway:start'),
    connect: (url: string) => ipcRenderer.invoke('gateway:connect', url),
  },

  // Onboarding
  onboarding: {
    complete: (config: { mode: string; gatewayUrl: string }) =>
      ipcRenderer.invoke('onboarding:complete', config),
  },

  // App info
  app: {
    version: process.env.npm_package_version || '3.2.0',
    platform: process.platform,
    isElectron: true,
  },
})
