const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { join } = require('path')
const { existsSync } = require('fs')
const { spawn, execSync } = require('child_process')
const http = require('http')

const APP_PORT = 3847
const HERMES_GATEWAY_URL = 'http://127.0.0.1:8642/health'
const HERMES_DASHBOARD_URL = 'http://127.0.0.1:9119/api/status'
const HERMES_INSTALL_SCRIPT =
  'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup'

let mainWindow = null
let localServer = null
let localServerPort = APP_PORT
let localServerReady = false
let installProcess = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

function checkHttp(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      resolve((response.statusCode || 500) < 500)
      response.resume()
    })
    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
  })
}

function isHermesInstalled() {
  try {
    execSync('which hermes || where hermes', {
      timeout: 5000,
      stdio: 'ignore',
      shell: true,
    })
    return true
  } catch {
    return false
  }
}

async function getBootstrapStatus() {
  return {
    hermesInstalled: isHermesInstalled(),
    gatewayReachable: await checkHttp(HERMES_GATEWAY_URL),
    dashboardReachable: await checkHttp(HERMES_DASHBOARD_URL),
    installerRunning: Boolean(installProcess && !installProcess.killed),
    localServerReady,
    localServerPort,
  }
}

function spawnDetached(command) {
  const child = spawn('bash', ['-lc', command], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      HERMES_WORKSPACE_DESKTOP: '1',
      API_SERVER_ENABLED: process.env.API_SERVER_ENABLED || 'true',
    },
  })
  child.unref()
  return child
}

async function installHermesInBackground() {
  if (installProcess) {
    return { started: false, reason: 'already-running' }
  }
  installProcess = spawn('bash', ['-lc', HERMES_INSTALL_SCRIPT], {
    detached: false,
    stdio: 'ignore',
    env: { ...process.env },
  })
  installProcess.on('exit', () => {
    installProcess = null
    void ensureHermesBackend()
  })
  return { started: true }
}

async function ensureHermesBackend() {
  const gatewayReachable = await checkHttp(HERMES_GATEWAY_URL)
  const dashboardReachable = await checkHttp(HERMES_DASHBOARD_URL)

  if (!isHermesInstalled()) {
    await installHermesInBackground()
    return { installed: false, gatewayReachable, dashboardReachable }
  }

  if (!gatewayReachable) {
    spawnDetached('hermes gateway run >/tmp/hermes-workspace-gateway.log 2>&1')
  }
  if (!dashboardReachable) {
    spawnDetached(
      'hermes dashboard --no-open >/tmp/hermes-workspace-dashboard.log 2>&1',
    )
  }

  return {
    installed: true,
    gatewayReachable: await checkHttp(HERMES_GATEWAY_URL, 4000),
    dashboardReachable: await checkHttp(HERMES_DASHBOARD_URL, 4000),
  }
}

function getAppUrl() {
  if (process.env.NODE_ENV === 'development') {
    return 'http://127.0.0.1:3002/?desktop=1'
  }
  return `http://127.0.0.1:${localServerPort}/?desktop=1`
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    if (process.env.NODE_ENV === 'development') {
      localServerReady = true
      resolve()
      return
    }

    localServer = spawn(
      process.execPath,
      [join(__dirname, 'prod-server.cjs'), '--port', String(APP_PORT)],
      {
        cwd: join(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(APP_PORT),
          HERMES_WORKSPACE_DESKTOP: '1',
          HERMES_API_URL: process.env.HERMES_API_URL || 'http://127.0.0.1:8642',
          HERMES_DASHBOARD_URL:
            process.env.HERMES_DASHBOARD_URL || 'http://127.0.0.1:9119',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    )

    const onReady = (message) => {
      if (message && message.type === 'ready') {
        localServerReady = true
        localServerPort = message.port || APP_PORT
        cleanup()
        resolve()
      }
    }
    const onExit = (code) => {
      cleanup()
      reject(new Error(`desktop server exited early (${code})`))
    }
    const cleanup = () => {
      localServer?.off('message', onReady)
      localServer?.off('exit', onExit)
    }

    localServer.on('message', onReady)
    localServer.on('exit', onExit)
    localServer.stdout?.on('data', (data) => console.log(String(data).trim()))
    localServer.stderr?.on('data', (data) => console.error(String(data).trim()))
  })
}

async function createWindow() {
  await startLocalServer()

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    title: 'Hermes Workspace',
    icon: existsSync(join(__dirname, '..', 'assets', 'icon.png'))
      ? join(__dirname, '..', 'assets', 'icon.png')
      : undefined,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0A0E1A',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  await mainWindow.loadURL(getAppUrl())
  void ensureHermesBackend()

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('desktop:status', async () => getBootstrapStatus())
ipcMain.handle('desktop:install-hermes', async () =>
  installHermesInBackground(),
)
ipcMain.handle('desktop:start-backend', async () => ensureHermesBackend())
ipcMain.handle('desktop:open-logs', async () => {
  shell.openPath('/tmp')
  return { ok: true }
})

app.whenReady().then(async () => {
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  localServer?.kill()
})

app.setName('Hermes Workspace')
