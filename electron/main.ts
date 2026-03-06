/**
 * ClawSuite Electron Main Process
 * Wraps the Vite-built web app in a native desktop window
 */

import { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn, execSync } from 'child_process'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let gatewayProcess: ReturnType<typeof spawn> | null = null

// Gateway detection
const DEFAULT_GATEWAY_PORT = 18789
const DEV_PORT = 3000

function getGatewayUrl(): string | null {
  try {
    // Check if gateway is already running
    execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${DEFAULT_GATEWAY_PORT}/api/health`, {
      timeout: 3000,
    })
    return `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`
  } catch {
    return null
  }
}

function isOpenClawInstalled(): boolean {
  try {
    execSync('which openclaw || where openclaw', { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function getAppUrl(): string {
  // In dev, use Vite dev server
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${DEV_PORT}`
  }
  // In production, serve the built files
  return `file://${join(__dirname, '../dist/client/index.html')}`
}

function createWindow() {
  const iconPath = join(__dirname, '../assets/icon.png')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'ClawSuite',
    icon: existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: 'hiddenInset', // macOS native title bar
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0f',
    show: false, // Show after ready-to-show
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  // Graceful show
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Check if we need onboarding or go straight to dashboard
  const gatewayUrl = getGatewayUrl()

  if (gatewayUrl) {
    // Gateway found — load the app directly
    const appUrl = getAppUrl()
    mainWindow.loadURL(appUrl)
  } else {
    // No gateway — show onboarding wizard
    mainWindow.loadFile(join(__dirname, '../electron/onboarding/index.html'))
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Cleanup
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const iconPath = join(__dirname, '../assets/tray-icon.png')
  if (!existsSync(iconPath)) return

  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('ClawSuite')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ClawSuite', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Gateway Status', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow?.show())
}

// IPC handlers for onboarding wizard
ipcMain.handle('gateway:check', () => {
  return { url: getGatewayUrl(), installed: isOpenClawInstalled() }
})

ipcMain.handle('gateway:install', async () => {
  return new Promise((resolve, reject) => {
    try {
      const install = spawn('npm', ['install', '-g', 'openclaw'], {
        shell: true,
        stdio: 'pipe',
      })

      let output = ''
      install.stdout?.on('data', (data) => { output += data.toString() })
      install.stderr?.on('data', (data) => { output += data.toString() })

      install.on('close', (code) => {
        if (code === 0) resolve({ success: true, output })
        else reject(new Error(`Install failed with code ${code}: ${output}`))
      })
    } catch (err) {
      reject(err)
    }
  })
})

ipcMain.handle('gateway:start', async () => {
  return new Promise((resolve) => {
    gatewayProcess = spawn('openclaw', ['gateway', 'start'], {
      shell: true,
      stdio: 'pipe',
      detached: true,
    })

    // Give it a few seconds to boot
    setTimeout(() => {
      const url = getGatewayUrl()
      resolve({ success: !!url, url })
    }, 5000)
  })
})

ipcMain.handle('gateway:connect', async (_event, url: string) => {
  try {
    execSync(`curl -s -o /dev/null -w "%{http_code}" ${url}/api/health`, { timeout: 3000 })
    return { success: true, url }
  } catch {
    return { success: false, error: 'Could not connect to gateway' }
  }
})

ipcMain.handle('onboarding:complete', async (_event, config: { mode: string; gatewayUrl: string }) => {
  // Store config and load the main app
  if (mainWindow) {
    const appUrl = getAppUrl()
    // Pass gateway URL as query param
    const url = new URL(appUrl)
    url.searchParams.set('gateway', config.gatewayUrl)
    mainWindow.loadURL(url.toString())
  }
})

// App lifecycle
app.whenReady().then(() => {
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Don't kill gateway — it should persist
  tray?.destroy()
})

// Set app name
app.setName('ClawSuite')
