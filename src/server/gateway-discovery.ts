/**
 * Gateway Auto-Discovery
 *
 * Reads OpenClaw gateway config for connectivity.
 * Hermes Workspace still uses the local OpenClaw gateway config + CLI to
 * discover the gateway port and auth token.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'
import WebSocket from 'ws'
import type { RawData } from 'ws'

const execAsync = promisify(execCb)
const DISCOVERY_PORT_START = 18789
const DISCOVERY_PORT_END = 18800
const DISCOVERY_CONNECT_TIMEOUT_MS = 1200
const DISCOVERY_CHALLENGE_TIMEOUT_MS = 1800

export type DiscoveryResult = {
  found: boolean
  url?: string
  token?: string
  password?: string
  source?: 'config-file' | 'cli' | 'env' | 'scan' | 'none'
  error?: string
}

function rawDataToString(data: RawData): string {
  if (typeof data === 'string') return data
  if (data instanceof Buffer) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(new Uint8Array(data)).toString('utf8')
}

/**
 * Try to read gateway config from ~/.openclaw/openclaw.json.
 */
async function discoverFromConfigFile(): Promise<DiscoveryResult> {
  try {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    const raw = await readFile(configPath, 'utf-8')
    const config = JSON.parse(raw) as {
      gateway?: {
        port?: number
        auth?: { token?: string; mode?: string }
      }
    }

    // The gateway config might be at top-level in the JSON or nested
    // Let's also try reading the gateway section via the structure we saw
    const port = config.gateway?.port
    const token = config.gateway?.auth?.token

    if (token) {
      const url = `ws://127.0.0.1:${port || 18789}`
      return { found: true, url, token, source: 'config-file' }
    }

    // Config file exists but no gateway token in it — try CLI
    return { found: false, source: 'none' }
  } catch {
    return { found: false, source: 'none' }
  }
}

/**
 * Try to get gateway config via `openclaw config get` CLI.
 */
async function discoverFromCli(): Promise<DiscoveryResult> {
  try {
    const [tokenResult, portResult] = await Promise.allSettled([
      execAsync('openclaw config get gateway.auth.token', { timeout: 5000 }),
      execAsync('openclaw config get gateway.port', { timeout: 5000 }),
    ])

    const token =
      tokenResult.status === 'fulfilled'
        ? tokenResult.value.stdout.trim()
        : undefined
    const portStr =
      portResult.status === 'fulfilled'
        ? portResult.value.stdout.trim()
        : undefined

    if (token) {
      const port = portStr ? parseInt(portStr, 10) : 18789
      const url = `ws://127.0.0.1:${isNaN(port) ? 18789 : port}`
      return { found: true, url, token, source: 'cli' }
    }

    return { found: false, source: 'none' }
  } catch {
    return { found: false, source: 'none' }
  }
}

/**
 * Check if env vars are already set
 */
function discoverFromEnv(): DiscoveryResult {
  const url = process.env.HERMES_GATEWAY_URL?.trim()
  const token = process.env.HERMES_GATEWAY_TOKEN?.trim()
  const password = process.env.HERMES_GATEWAY_PASSWORD?.trim()

  if (token) {
    // Only short-circuit if we actually have a token.
    // Password-only should fall through to config file discovery
    // so we can pick up the token from ~/.openclaw/openclaw.json.
    return {
      found: true,
      url: url || 'ws://127.0.0.1:18789',
      token,
      password: password || undefined,
      source: 'env',
    }
  }

  return { found: false, source: 'none' }
}

/**
 * Probe if a WebSocket server is listening on the given port
 */
async function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('node:net') as typeof import('node:net')
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.setTimeout(2000, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function probeGatewayChallenge(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let connectTimer: NodeJS.Timeout | null = null
    let challengeTimer: NodeJS.Timeout | null = null
    const gatewayOrigin = (() => {
      try {
        const parsed = new URL(url.replace(/^ws/, 'http'))
        return `${parsed.protocol}//${parsed.host}`
      } catch {
        return 'http://127.0.0.1:18789'
      }
    })()

    const ws = new WebSocket(url, {
      origin: gatewayOrigin,
      headers: { Origin: gatewayOrigin },
    })

    const finish = (found: boolean) => {
      if (settled) return
      settled = true
      if (connectTimer) clearTimeout(connectTimer)
      if (challengeTimer) clearTimeout(challengeTimer)
      ws.removeAllListeners()
      ws.close()
      resolve(found)
    }

    connectTimer = setTimeout(() => finish(false), DISCOVERY_CONNECT_TIMEOUT_MS)

    ws.on('open', () => {
      challengeTimer = setTimeout(() => finish(false), DISCOVERY_CHALLENGE_TIMEOUT_MS)
    })

    ws.on('message', (data: RawData) => {
      try {
        const frame = JSON.parse(rawDataToString(data)) as {
          type?: string
          event?: string
        }
        if (
          (frame.type === 'event' || frame.type === 'evt') &&
          frame.event === 'connect.challenge'
        ) {
          finish(true)
        }
      } catch {
        // Ignore malformed frames while probing.
      }
    })

    ws.on('error', () => finish(false))
    ws.on('close', (code) => {
      // Newer gateways reject anonymous probes before sending connect.challenge.
      // A 1008 close still proves a real Hermes gateway is listening.
      if (code === 1008) {
        finish(true)
        return
      }
      finish(false)
    })
  })
}

async function scanLocalGatewayRange(): Promise<DiscoveryResult> {
  const ports = Array.from(
    { length: DISCOVERY_PORT_END - DISCOVERY_PORT_START + 1 },
    (_, index) => DISCOVERY_PORT_START + index,
  )
  const results = await Promise.all(
    ports.map(async (port) => {
      const url = `ws://127.0.0.1:${port}`
      return { url, found: await probeGatewayChallenge(url) }
    }),
  )
  const match = results.find((result) => result.found)

  if (!match) {
    return {
      found: false,
      source: 'none',
      error: 'Hermes Agent not found on localhost ports 18789-18800.',
    }
  }

  return {
    found: true,
    url: match.url,
    source: 'scan',
  }
}

/**
 * Main discovery function. Tries all methods in order:
 * 1. Existing env vars (already configured)
 * 2. Hermes config file (~/.hermes/config.yaml)
 * 3. Hermes CLI (`hermes config get`)
 *
 * If token is found, also writes it to process.env so the gateway client picks it up.
 */
export async function discoverGateway(): Promise<DiscoveryResult> {
  // 1. Check env vars first (user already configured)
  const envResult = discoverFromEnv()
  if (envResult.found) return envResult

  // 2. Try config file (fastest, no subprocess)
  const fileResult = await discoverFromConfigFile()
  if (fileResult.found) {
    // Apply to process.env so gateway client uses it
    if (fileResult.url) process.env.HERMES_GATEWAY_URL = fileResult.url
    if (fileResult.token) process.env.HERMES_GATEWAY_TOKEN = fileResult.token
    return fileResult
  }

  // 3. Try CLI (slower, but works if config file structure differs)
  const cliResult = await discoverFromCli()
  if (cliResult.found) {
    if (cliResult.url) process.env.HERMES_GATEWAY_URL = cliResult.url
    if (cliResult.token) process.env.HERMES_GATEWAY_TOKEN = cliResult.token
    return cliResult
  }

  const scanResult = await scanLocalGatewayRange()
  if (scanResult.found) {
    return {
      found: false,
      url: scanResult.url,
      source: 'scan',
      error: 'Gateway detected on localhost, but no auth token was discovered. Enter your token to finish setup.',
    }
  }

  // 4. Last resort: check if anything is listening on default port
  const portOpen = await probePort(18789)
  if (portOpen) {
    return {
      found: false,
      url: 'ws://127.0.0.1:18789',
      source: 'none',
      error: 'Gateway found on port 18789 but no auth token discovered. Please enter your token.',
    }
  }

  return {
    found: false,
    source: 'none',
    error: 'Hermes Agent not found. Run hermes to start, or enter connection details manually.',
  }
}

export async function discoverGatewayUrl(): Promise<DiscoveryResult> {
  return scanLocalGatewayRange()
}
