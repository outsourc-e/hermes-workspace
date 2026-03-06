"use strict";
/**
 * ClawSuite Electron Main Process
 * Wraps the Vite-built web app in a native desktop window
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const fs_1 = require("fs");
const child_process_1 = require("child_process");
// Prevent multiple instances
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
let mainWindow = null;
let tray = null;
let gatewayProcess = null;
// Gateway detection
const DEFAULT_GATEWAY_PORT = 18789;
const DEV_PORT = 3000;
function getGatewayUrl() {
    try {
        // Check if gateway is already running
        (0, child_process_1.execSync)(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/api/health`, {
            timeout: 3000,
        });
        return `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`;
    }
    catch {
        return null;
    }
}
function isOpenClawInstalled() {
    try {
        (0, child_process_1.execSync)('which openclaw || where openclaw', { timeout: 5000 });
        return true;
    }
    catch {
        return false;
    }
}
function getAppUrl() {
    // In dev, use Vite dev server
    if (process.env.NODE_ENV === 'development') {
        return `http://localhost:${DEV_PORT}`;
    }
    // In production, serve the built files
    return `file://${(0, path_1.join)(__dirname, '../dist/client/index.html')}`;
}
function createWindow() {
    const iconPath = (0, path_1.join)(__dirname, '../assets/icon.png');
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'ClawSuite',
        icon: (0, fs_1.existsSync)(iconPath) ? iconPath : undefined,
        titleBarStyle: 'hiddenInset', // macOS native title bar
        trafficLightPosition: { x: 16, y: 16 },
        backgroundColor: '#0a0a0f',
        show: false, // Show after ready-to-show
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });
    // Graceful show
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    // Check if we need onboarding or go straight to dashboard
    const gatewayUrl = getGatewayUrl();
    if (gatewayUrl) {
        // Gateway found — load the app directly
        const appUrl = getAppUrl();
        mainWindow.loadURL(appUrl);
    }
    else {
        // No gateway — show onboarding wizard
        mainWindow.loadFile((0, path_1.join)(__dirname, '../electron/onboarding/index.html'));
    }
    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    // Cleanup
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function createTray() {
    const iconPath = (0, path_1.join)(__dirname, '../assets/tray-icon.png');
    if (!(0, fs_1.existsSync)(iconPath))
        return;
    tray = new electron_1.Tray(electron_1.nativeImage.createFromPath(iconPath));
    tray.setToolTip('ClawSuite');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        { label: 'Open ClawSuite', click: () => mainWindow?.show() },
        { type: 'separator' },
        { label: 'Gateway Status', enabled: false },
        { type: 'separator' },
        { label: 'Quit', click: () => electron_1.app.quit() },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow?.show());
}
// IPC handlers for onboarding wizard
electron_1.ipcMain.handle('gateway:check', () => {
    return { url: getGatewayUrl(), installed: isOpenClawInstalled() };
});
electron_1.ipcMain.handle('gateway:install', async () => {
    return new Promise((resolve, reject) => {
        try {
            const install = (0, child_process_1.spawn)('npm', ['install', '-g', 'openclaw'], {
                shell: true,
                stdio: 'pipe',
            });
            let output = '';
            install.stdout?.on('data', (data) => { output += data.toString(); });
            install.stderr?.on('data', (data) => { output += data.toString(); });
            install.on('close', (code) => {
                if (code === 0)
                    resolve({ success: true, output });
                else
                    reject(new Error(`Install failed with code ${code}: ${output}`));
            });
        }
        catch (err) {
            reject(err);
        }
    });
});
electron_1.ipcMain.handle('gateway:start', async () => {
    return new Promise((resolve) => {
        gatewayProcess = (0, child_process_1.spawn)('openclaw', ['gateway', 'start'], {
            shell: true,
            stdio: 'pipe',
            detached: true,
        });
        // Give it a few seconds to boot
        setTimeout(() => {
            const url = getGatewayUrl();
            resolve({ success: !!url, url });
        }, 5000);
    });
});
electron_1.ipcMain.handle('gateway:connect', async (_event, url) => {
    try {
        (0, child_process_1.execSync)(`curl -s -o /dev/null -w "%{http_code}" ${url}/api/health`, { timeout: 3000 });
        return { success: true, url };
    }
    catch {
        return { success: false, error: 'Could not connect to gateway' };
    }
});
electron_1.ipcMain.handle('onboarding:complete', async (_event, config) => {
    // Store config and load the main app
    if (mainWindow) {
        const appUrl = getAppUrl();
        // Pass gateway URL as query param
        const url = new URL(appUrl);
        url.searchParams.set('gateway', config.gatewayUrl);
        mainWindow.loadURL(url.toString());
    }
});
// App lifecycle
electron_1.app.whenReady().then(() => {
    createWindow();
    createTray();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', () => {
    // Don't kill gateway — it should persist
    tray?.destroy();
});
// Set app name
electron_1.app.setName('ClawSuite');
