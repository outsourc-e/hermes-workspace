"use strict";
/**
 * Hermes Workspace Electron Preload Script
 * Exposes safe IPC bridge to renderer
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('clawsuite', {
    // Gateway management
    gateway: {
        check: () => electron_1.ipcRenderer.invoke('gateway:check'),
        install: () => electron_1.ipcRenderer.invoke('gateway:install'),
        start: () => electron_1.ipcRenderer.invoke('gateway:start'),
        restart: () => electron_1.ipcRenderer.invoke('gateway:restart'),
        connect: (url) => electron_1.ipcRenderer.invoke('gateway:connect', url),
    },
    // Onboarding
    onboarding: {
        complete: (config) => electron_1.ipcRenderer.invoke('onboarding:complete', config),
    },
    // App info
    app: {
        version: process.env.npm_package_version || '3.2.0',
        platform: process.platform,
        isElectron: true,
    },
});
