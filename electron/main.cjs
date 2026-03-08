"use strict";
/**
 * ClawSuite Electron Main Process
 * Wraps the Vite-built web app in a native desktop window.
 *
 * Production mode starts a local HTTP server that serves the built client
 * files and proxies /api/* requests to the OpenClaw gateway.
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
let localServer = null;
let localServerPort = 0;

// Gateway detection
const DEFAULT_GATEWAY_PORT = 18789;
const DEV_PORT = 3000;

// ── Production app server ─────────────────────────────────────────────────

function getGatewayUrl() {
    try {
        const code = (0, child_process_1.execSync)(
            `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/health`,
            { timeout: 3000 }
        ).toString().trim();
        if (code !== '200') throw new Error('not 200');
        return `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`;
    } catch {
        return null;
    }
}

function isOpenClawInstalled() {
    try {
        (0, child_process_1.execSync)('which openclaw || where openclaw', { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

// ── Find or start ClawSuite server ────────────────────────────────────────
// Checks common ports for a running ClawSuite dev/preview server.
// If none found, starts `pnpm dev` from the repo directory.
let appProcess = null;
const CLAWSUITE_PORTS = [3000, 3003, 3001, 3002];

function findRunningServer() {
    for (const port of CLAWSUITE_PORTS) {
        try {
            const code = (0, child_process_1.execSync)(
                `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/api/session-status`,
                { timeout: 2000 }
            ).toString().trim();
            if (code === '200' || code === '401' || code === '503') {
                return port;
            }
        } catch { /* not running on this port */ }
    }
    return null;
}

function findRepoDir() {
    // Common locations for the ClawSuite repo
    const candidates = [
        (0, path_1.join)(process.env.HOME || '', '.openclaw', 'workspace', 'clawsuite'),
        (0, path_1.join)(process.env.HOME || '', 'clawsuite'),
        (0, path_1.join)(__dirname, '..'),
    ];
    for (const dir of candidates) {
        if ((0, fs_1.existsSync)((0, path_1.join)(dir, 'package.json'))) {
            try {
                const pkg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(dir, 'package.json'), 'utf-8'));
                if (pkg.name === 'clawsuite' || pkg.name === '@clawsuite/app') return dir;
            } catch { /* skip */ }
        }
    }
    return null;
}

function startLocalServer(_gatewayUrl) {
    return new Promise((resolve, reject) => {
        // First check if a server is already running
        const existingPort = findRunningServer();
        if (existingPort) {
            localServerPort = existingPort;
            console.log(`[ClawSuite] Found running server on port ${existingPort}`);
            return resolve(existingPort);
        }

        // Try to start one from the repo
        const repoDir = findRepoDir();
        if (!repoDir) {
            console.error('[ClawSuite] Could not find ClawSuite repo directory');
            return reject(new Error('ClawSuite repo not found'));
        }

        console.log(`[ClawSuite] Starting server from ${repoDir}...`);
        const port = 3003;

        appProcess = (0, child_process_1.spawn)('pnpm', ['dev', '--port', String(port)], {
            cwd: repoDir,
            shell: true,
            stdio: 'pipe',
            env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
            detached: true,
        });

        let started = false;
        const timeout = setTimeout(() => {
            if (!started) {
                started = true;
                // Try polling the port
                const poll = setInterval(() => {
                    const found = findRunningServer();
                    if (found) {
                        clearInterval(poll);
                        localServerPort = found;
                        resolve(found);
                    }
                }, 1000);
                // Give up after 15s total
                setTimeout(() => {
                    clearInterval(poll);
                    if (!localServerPort) {
                        localServerPort = port;
                        resolve(port);
                    }
                }, 10000);
            }
        }, 5000);

        appProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log('[dev]', output.trim());
            if (!started && output.includes('Local:')) {
                started = true;
                clearTimeout(timeout);
                // Extract actual port from output
                const match = output.match(/:(\d{4})\//);
                localServerPort = match ? parseInt(match[1], 10) : port;
                console.log(`[ClawSuite] Dev server started on port ${localServerPort}`);
                resolve(localServerPort);
            }
        });

        appProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            console.error('[dev-err]', output.trim());
            // pnpm outputs to stderr sometimes
            if (!started && output.includes('Local:')) {
                started = true;
                clearTimeout(timeout);
                const match = output.match(/:(\d{4})\//);
                localServerPort = match ? parseInt(match[1], 10) : port;
                resolve(localServerPort);
            }
        });

        appProcess.on('error', (err) => {
            console.error('[ClawSuite] Dev server failed:', err);
            if (!started) {
                started = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
    });
}

function getAppUrl() {
    if (process.env.NODE_ENV === 'development') {
        return `http://localhost:${DEV_PORT}`;
    }
    // In production, use the local server
    if (localServerPort > 0) {
        return `http://127.0.0.1:${localServerPort}`;
    }
    // Fallback (should not happen)
    return `file://${(0, path_1.join)(__dirname, '..', 'dist', 'client', 'index.html')}`;
}

async function createWindow() {
    const iconPath = (0, path_1.join)(__dirname, '..', 'assets', 'icon.png');
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'ClawSuite',
        icon: (0, fs_1.existsSync)(iconPath) ? iconPath : undefined,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        backgroundColor: '#0a0a0f',
        show: false,
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });

    const gatewayUrl = getGatewayUrl();
    if (gatewayUrl) {
        // Gateway found — start local server to serve UI + proxy API
        if (process.env.NODE_ENV !== 'development') {
            try {
                await startLocalServer(gatewayUrl);
            } catch (err) {
                console.error('[ClawSuite] Failed to start local server:', err);
            }
        }
        const appUrl = getAppUrl();
        console.log(`[ClawSuite] Loading: ${appUrl}`);
        mainWindow.loadURL(appUrl);
    } else {
        // No gateway — show onboarding wizard
        mainWindow.loadFile((0, path_1.join)(__dirname, '..', 'electron', 'onboarding', 'index.html'));
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const iconPath = (0, path_1.join)(__dirname, '..', 'assets', 'tray-icon.png');
    if (!(0, fs_1.existsSync)(iconPath)) return;

    const trayIcon = electron_1.nativeImage.createFromPath(iconPath);
    // macOS tray icons should be 22px (template for dark/light auto-switch)
    trayIcon.setTemplateImage(true);
    tray = new electron_1.Tray(trayIcon.resize({ width: 22, height: 22 }));
    tray.setToolTip('ClawSuite');

    function buildTrayMenu() {
        const gatewayUrl = getGatewayUrl();
        const isConnected = !!gatewayUrl;

        const contextMenu = electron_1.Menu.buildFromTemplate([
            {
                label: 'Open ClawSuite',
                click: () => { mainWindow?.show(); mainWindow?.focus(); },
                accelerator: 'CommandOrControl+Shift+C',
            },
            { type: 'separator' },
            {
                label: 'Quick Chat',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                        // Navigate to chat
                        mainWindow.webContents.executeJavaScript(
                            `window.location.hash = ''; window.location.pathname = '/';`
                        ).catch(() => {});
                    }
                },
            },
            { type: 'separator' },
            {
                label: 'Navigate',
                submenu: [
                    { label: '📊 Dashboard', click: () => navigateTo('/dashboard') },
                    { label: '🤖 Agent Hub', click: () => navigateTo('/agent-swarm') },
                    { label: '📋 Tasks', click: () => navigateTo('/tasks') },
                    { label: '⏰ Cron', click: () => navigateTo('/cron') },
                    { label: '💰 Costs', click: () => navigateTo('/costs') },
                    { label: '⚙️ Settings', click: () => navigateTo('/settings') },
                ],
            },
            { type: 'separator' },
            {
                label: `Gateway: ${isConnected ? '● Connected' : '○ Disconnected'}`,
                enabled: false,
            },
            { type: 'separator' },
            { label: 'Quit ClawSuite', click: () => electron_1.app.quit() },
        ]);

        tray.setContextMenu(contextMenu);
    }

    function navigateTo(path) {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            const base = localServerPort > 0
                ? `http://127.0.0.1:${localServerPort}`
                : `http://localhost:${DEV_PORT}`;
            mainWindow.loadURL(`${base}${path}`);
        }
    }

    buildTrayMenu();
    // Refresh tray menu every 30s to update gateway status
    setInterval(buildTrayMenu, 30000);
    tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
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
            install.stdout?.on('data', (d) => { output += d.toString(); });
            install.stderr?.on('data', (d) => { output += d.toString(); });
            install.on('close', (code) => {
                if (code === 0) resolve({ success: true, output });
                else reject(new Error(`Install failed (${code}): ${output}`));
            });
        } catch (err) {
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
        setTimeout(() => {
            const url = getGatewayUrl();
            resolve({ success: !!url, url });
        }, 5000);
    });
});

electron_1.ipcMain.handle('gateway:connect', async (_event, url) => {
    try {
        const code = (0, child_process_1.execSync)(`curl -s -o /dev/null -w "%{http_code}" ${url}/health`, { timeout: 3000 }).toString().trim();
        if (code !== '200') throw new Error('not 200');
        return { success: true, url };
    } catch {
        return { success: false, error: 'Could not connect to gateway' };
    }
});

electron_1.ipcMain.handle('onboarding:complete', async (_event, config) => {
    if (mainWindow) {
        // Start local server with the configured gateway
        if (process.env.NODE_ENV !== 'development' && !localServer) {
            try {
                await startLocalServer(config.gatewayUrl);
            } catch (err) {
                console.error('[ClawSuite] Failed to start local server:', err);
            }
        }
        const appUrl = getAppUrl();
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
    tray?.destroy();
    if (appProcess) {
        appProcess.kill();
        appProcess = null;
    }
});

electron_1.app.setName('ClawSuite');
