import { createFileRoute } from '@tanstack/react-router'
import { access, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import { requireLocalOrAuth } from '@/server/auth-middleware'

const DEFAULT_GATEWAY_PORT = 18789
const DEFAULT_GATEWAY_URL = `ws://127.0.0.1:${DEFAULT_GATEWAY_PORT}`
const HEARTBEAT_INTERVAL_MS = 20_000
const GATEWAY_START_TIMEOUT_MS = 45_000
const TOKEN_WAIT_TIMEOUT_MS = 20_000
const POLL_INTERVAL_MS = 750

type SetupStatus = 'checking' | 'installing' | 'starting' | 'ready' | 'error'

type SetupEvent = {
  status: SetupStatus
  message: string
  url?: string
  token?: string
}

type OpenClawConfig = {
  gateway?: {
    port?: number
    auth?: {
      token?: string
    }
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatCommandError(command: string, error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${command}: ${error.message.trim()})`
  }

  return fallback
}

async function runCommand(command: string, args: string[], timeoutMs: number) {
  return await new Promise<{ stdout: string; stderr: string; code: number | null }>(
    (resolve, reject) => {
      const child = spawn(command, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGTERM')
        reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      })

      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ stdout, stderr, code })
      })
    },
  )
}

async function isOpenClawInstalled() {
  try {
    const whichResult = await runCommand('which', ['openclaw'], 5_000)
    if (whichResult.code === 0 && whichResult.stdout.trim()) {
      return true
    }
  } catch {
    // Fall through to the version check.
  }

  try {
    const versionResult = await runCommand('openclaw', ['--version'], 5_000)
    return versionResult.code === 0 && Boolean(versionResult.stdout.trim())
  } catch {
    return false
  }
}

async function installOpenClaw() {
  const result = await runCommand('npm', ['install', '-g', 'openclaw'], 10 * 60_000)
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'npm install failed')
  }
}

function startGatewayDetached() {
  const child = spawn('openclaw', ['gateway', 'start', '--bind', 'lan'], {
    detached: true,
    env: process.env,
    stdio: 'ignore',
  })
  child.unref()
}

async function isGatewayRunning(port: number) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.destroy()
      resolve(true)
    })

    socket.on('error', () => resolve(false))
    socket.setTimeout(1_500, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function readGatewayConfig(): Promise<OpenClawConfig | null> {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json')

  try {
    await access(configPath)
    const raw = await readFile(configPath, 'utf8')
    return JSON.parse(raw) as OpenClawConfig
  } catch {
    return null
  }
}

async function waitForGatewayReady() {
  const deadline = Date.now() + GATEWAY_START_TIMEOUT_MS

  while (Date.now() < deadline) {
    const config = await readGatewayConfig()
    const port = config?.gateway?.port || DEFAULT_GATEWAY_PORT
    if (await isGatewayRunning(port)) {
      return {
        url: `ws://127.0.0.1:${port}`,
      }
    }
    await wait(POLL_INTERVAL_MS)
  }

  throw new Error('OpenClaw gateway did not become reachable in time')
}

async function waitForGatewayToken() {
  const deadline = Date.now() + TOKEN_WAIT_TIMEOUT_MS

  while (Date.now() < deadline) {
    const config = await readGatewayConfig()
    const token = config?.gateway?.auth?.token?.trim()
    const port = config?.gateway?.port || DEFAULT_GATEWAY_PORT

    if (token) {
      return {
        token,
        url: `ws://127.0.0.1:${port}`,
      }
    }

    await wait(POLL_INTERVAL_MS)
  }

  throw new Error('Gateway auth token was not written to ~/.openclaw/openclaw.json')
}

export const Route = createFileRoute('/api/local-setup')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          start(controller) {
            let closed = false
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null

            const emit = (event: SetupEvent) => {
              if (closed) return
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            }

            const cleanup = () => {
              if (closed) return
              closed = true
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
              }
              request.signal.removeEventListener('abort', onAbort)

              try {
                controller.close()
              } catch {
                // stream already closed
              }
            }

            const onAbort = () => {
              cleanup()
            }

            heartbeatTimer = setInterval(() => {
              if (closed) return
              controller.enqueue(encoder.encode(': keep-alive\n\n'))
            }, HEARTBEAT_INTERVAL_MS)

            request.signal.addEventListener('abort', onAbort, { once: true })

            void (async () => {
              try {
                emit({
                  status: 'checking',
                  message: 'Checking for OpenClaw...',
                })

                let installed = await isOpenClawInstalled()
                if (!installed) {
                  emit({
                    status: 'installing',
                    message: 'Installing OpenClaw...',
                  })
                  await installOpenClaw()
                  installed = await isOpenClawInstalled()
                }

                if (!installed) {
                  throw new Error('OpenClaw is still unavailable after installation')
                }

                const initialConfig = await readGatewayConfig()
                const initialPort = initialConfig?.gateway?.port || DEFAULT_GATEWAY_PORT

                emit({
                  status: 'starting',
                  message: 'Starting gateway...',
                })

                if (!(await isGatewayRunning(initialPort))) {
                  try {
                    startGatewayDetached()
                  } catch (error) {
                    throw new Error(
                      formatCommandError(
                        'openclaw gateway start --bind lan',
                        error,
                        'Failed to launch the OpenClaw gateway',
                      ),
                    )
                  }
                }

                const ready = await waitForGatewayReady()
                const tokenData = await waitForGatewayToken()

                emit({
                  status: 'ready',
                  message: 'Connected!',
                  url: tokenData.url || ready.url || DEFAULT_GATEWAY_URL,
                  token: tokenData.token,
                })
              } catch (error) {
                emit({
                  status: 'error',
                  message:
                    error instanceof Error ? error.message : 'Local OpenClaw setup failed',
                })
              } finally {
                cleanup()
              }
            })()
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
