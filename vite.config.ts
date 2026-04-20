import { URL, fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import { resolve, dirname } from 'node:path'
import os from 'node:os'

// devtools removed
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// nitro plugin removed (tanstackStart handles server runtime)
import { defineConfig, loadEnv } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

// ---------------------------------------------------------------------------
// Hermes Agent auto-start helpers
// ---------------------------------------------------------------------------

/** Resolve the hermes-agent directory using a priority-ordered fallback chain:
 *  1. HERMES_AGENT_PATH env var (explicit override)
 *  2. ../hermes-agent  — sibling clone (standard README setup)
 *  3. ../../hermes-agent — one level up (monorepo / nested workspace)
 *  Returns null if none found.
 */
function resolveHermesAgentDir(env: Record<string, string>): string | null {
  const candidates: string[] = []

  if (env.HERMES_AGENT_PATH?.trim()) {
    candidates.push(env.HERMES_AGENT_PATH.trim())
  }

  // Resolve relative to the workspace root (parent of hermes-workspace/)
  const workspaceRoot = dirname(resolve('.'))
  candidates.push(
    resolve(workspaceRoot, 'hermes-agent'),            // sibling (old README)
    resolve(workspaceRoot, '..', 'hermes-agent'),      // one level up
    resolve(os.homedir(), '.hermes', 'hermes-agent'),  // Nous installer default
    resolve(os.homedir(), 'hermes-agent'),             // ~/hermes-agent
  )

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'webapi'))) return candidate
  }
  return null
}

/** Find the `hermes` CLI binary installed by Nous's installer. */
function resolveHermesBinary(): string | null {
  const candidates = [
    resolve(os.homedir(), '.hermes', 'bin', 'hermes'),
    resolve(os.homedir(), '.local', 'bin', 'hermes'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

/** Resolve the Python executable to use for Hermes backend startup.
 *  Prefers .venv/bin/python inside agentDir, falls back to system python3.
 */
function resolveHermesPython(agentDir: string): string {
  const venvPython = resolve(agentDir, '.venv', 'bin', 'python')
  if (existsSync(venvPython)) return venvPython
  // uv creates 'venv' not '.venv' sometimes
  const uvVenv = resolve(agentDir, 'venv', 'bin', 'python')
  if (existsSync(uvVenv)) return uvVenv
  return 'python3'
}

/** Check if hermes-agent health endpoint is responding */
async function isHermesAgentHealthy(port = 8642): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return r.ok
  } catch {
    return false
  }
}

const config = defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const hermesApiUrl = env.HERMES_API_URL?.trim() || 'http://127.0.0.1:8642'

  // Hermes Agent auto-start state
  let hermesAgentChild: ChildProcess | null = null
  let hermesAgentStarted = false

  const startHermesAgent = async () => {
    if (hermesAgentStarted) return
    // Skip auto-start when HERMES_API_URL is explicitly set to a non-local endpoint
    const explicitUrl =
      env.HERMES_API_URL || process.env.HERMES_API_URL || hermesApiUrl || ''
    if (
      explicitUrl &&
      explicitUrl !== 'http://127.0.0.1:8642' &&
      explicitUrl !== 'http://localhost:8642'
    ) {
      console.log(
        `[hermes-agent] Skipping auto-start — using external API: ${explicitUrl}`,
      )
      hermesAgentStarted = true
      return
    }
    if (await isHermesAgentHealthy()) {
      console.log('[hermes-agent] Already running — reusing existing process')
      hermesAgentStarted = true
      return
    }

    const hermesBin = resolveHermesBinary()
    const agentDir = resolveHermesAgentDir(env)

    // Prefer the `hermes gateway run` binary path (Nous installer's canonical
    // entrypoint). Fall back to launching uvicorn against the source tree if
    // only a directory is present (dev / cloned-in-place setups).
    let launchCmd: string
    let commandArgs: string[]
    let launchCwd: string | undefined

    if (hermesBin) {
      launchCmd = hermesBin
      commandArgs = ['gateway', 'run']
      launchCwd = agentDir ?? undefined
      console.log(`[hermes-agent] Starting ${hermesBin} gateway run`)
    } else if (agentDir) {
      launchCmd = resolveHermesPython(agentDir)
      const useGatewayRun = existsSync(resolve(agentDir, 'gateway', 'run.py'))
      commandArgs = useGatewayRun
        ? ['-m', 'gateway.run']
        : ['-m', 'uvicorn', 'webapi.app:app', '--host', '0.0.0.0', '--port', '8642']
      launchCwd = agentDir
      console.log(
        `[hermes-agent] Starting from ${agentDir} using ${launchCmd} (${useGatewayRun ? 'gateway.run' : 'uvicorn'})`,
      )
    } else {
      console.warn(
        '[hermes-agent] Could not find hermes-agent installation.\n' +
          '  Run the installer:\n' +
          '    curl -fsSL https://hermes-workspace.com/install.sh | bash\n' +
          '  Or set HERMES_AGENT_PATH in .env to point at your hermes-agent clone.',
      )
      return
    }

    const child = spawn(
      launchCmd,
      commandArgs,
      {
        cwd: launchCwd,
        detached: false, // keep tied to vite process — stops when dev server stops
        stdio: 'pipe',
        env: {
          ...process.env,
          PATH: [
            resolve(os.homedir(), '.hermes', 'bin'),
            resolve(os.homedir(), '.local', 'bin'),
            agentDir ? resolve(agentDir, '.venv', 'bin') : '',
            agentDir ? resolve(agentDir, 'venv', 'bin') : '',
            process.env.PATH || '',
          ]
            .filter(Boolean)
            .join(':'),
        },
      },
    )

    hermesAgentChild = child
    hermesAgentStarted = true

    child.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line) console.log(`[hermes-agent] ${line}`)
    })
    child.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line) console.log(`[hermes-agent] ${line}`)
    })

    child.on('exit', (code) => {
      hermesAgentChild = null
      hermesAgentStarted = false
      if (code !== 0 && code !== null) {
        console.warn(`[hermes-agent] Exited with code ${code}`)
      }
    })

    // Wait for healthy
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (await isHermesAgentHealthy()) {
        console.log('[hermes-agent] ✓ Ready on http://127.0.0.1:8642')
        return
      }
    }
    console.warn(
      '[hermes-agent] Started but health check timed out — may still be loading',
    )
  }

  let workspaceDaemonStarted = false
  let workspaceDaemonStarting = false
  let workspaceDaemonShuttingDown = false
  let workspaceDaemonRestarting = false
  let workspaceDaemonChild: ChildProcess | null = null
  let workspaceDaemonRetryCount = 0
  const workspaceDaemonPort = '3099'
  const daemonCwd = resolve('workspace-daemon')
  const daemonSrcEntry = resolve('workspace-daemon/src/server.ts')
  const daemonDistEntry = resolve('workspace-daemon/dist/server.js')
  const workspaceDaemonDbPath = resolve(
    'workspace-daemon/.workspaces/workspace.db',
  )

  const getWorkspaceDaemonDelayMs = (attempt: number) =>
    Math.min(1000 * 2 ** Math.max(attempt - 1, 0), 30000)

  const startWorkspaceDaemon = () => {
    if (workspaceDaemonShuttingDown) return
    if (workspaceDaemonStarted || workspaceDaemonStarting) return

    const spawnCommand = existsSync(daemonSrcEntry)
      ? {
          commandName: 'npx',
          args: ['tsx', 'watch', 'src/server.ts'],
          options: {
            cwd: daemonCwd,
            env: {
              ...process.env,
              PORT: workspaceDaemonPort,
              DB_PATH: workspaceDaemonDbPath,
              ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
            },
            stdio: 'inherit' as const,
          },
        }
      : existsSync(daemonDistEntry)
        ? {
            commandName: 'node',
            args: ['dist/server.js'],
            options: {
              cwd: daemonCwd,
              env: {
                ...process.env,
                PORT: workspaceDaemonPort,
                DB_PATH: workspaceDaemonDbPath,
                ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
              },
              stdio: 'inherit' as const,
            },
          }
        : null

    if (!spawnCommand) {
      workspaceDaemonStarting = false
      console.error('[workspace-daemon] no server entry found to spawn.')
      return
    }

    workspaceDaemonStarted = true
    workspaceDaemonStarting = false
    const child = spawn(
      spawnCommand.commandName,
      spawnCommand.args,
      spawnCommand.options,
    )
    workspaceDaemonChild = child

    child.on('exit', (code) => {
      if (workspaceDaemonChild === child) {
        workspaceDaemonChild = null
      }

      if (workspaceDaemonShuttingDown || workspaceDaemonRestarting) {
        workspaceDaemonStarted = false
        workspaceDaemonStarting = false
        return
      }

      if (code === 0) {
        workspaceDaemonStarted = false
        workspaceDaemonStarting = false
        return
      }

      if (workspaceDaemonRetryCount >= 20) {
        workspaceDaemonStarted = false
        workspaceDaemonStarting = false
        console.error(
          `[workspace-daemon] crashed with code ${code ?? 'unknown'}; max restart attempts reached.`,
        )
        return
      }

      workspaceDaemonRetryCount += 1
      const delayMs = getWorkspaceDaemonDelayMs(workspaceDaemonRetryCount)
      console.error(
        `[workspace-daemon] crashed with code ${code ?? 'unknown'}; restarting in ${Math.round(
          delayMs / 1000,
        )}s (${workspaceDaemonRetryCount}/20).`,
      )

      workspaceDaemonStarting = true
      workspaceDaemonStarted = false
      setTimeout(() => {
        startWorkspaceDaemon()
      }, delayMs)
    })

    child.on('error', (error) => {
      console.error(`[workspace-daemon] failed to spawn: ${error.message}`)
    })
  }

  const stopWorkspaceDaemon = async () => {
    const child = workspaceDaemonChild
    if (!child) {
      workspaceDaemonStarted = false
      workspaceDaemonStarting = false
      return
    }

    workspaceDaemonRestarting = true

    await new Promise<void>((resolve) => {
      const exitTimer = setTimeout(() => {
        if (!child.killed && child.pid) {
          try {
            process.kill(child.pid, 'SIGKILL')
          } catch {
            // ignore
          }
        }
      }, 5000)

      child.once('exit', () => {
        clearTimeout(exitTimer)
        resolve()
      })

      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGTERM')
        } catch {
          clearTimeout(exitTimer)
          resolve()
        }
      } else {
        clearTimeout(exitTimer)
        resolve()
      }
    })

    workspaceDaemonStarted = false
    workspaceDaemonStarting = false
    workspaceDaemonRestarting = false
  }

  const restartWorkspaceDaemon = async () => {
    workspaceDaemonRetryCount = 0
    await stopWorkspaceDaemon()
    workspaceDaemonStarted = false
    workspaceDaemonStarting = false
    startWorkspaceDaemon()
  }

  const isPortInUse = (port: number) =>
    new Promise<boolean>((resolvePortCheck) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolvePortCheck(true)
      })
      socket.once('error', () => resolvePortCheck(false))
    })

  const hasHealthyWorkspaceDaemon = async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:${workspaceDaemonPort}/api/workspace/version`,
        {
          signal: AbortSignal.timeout(2000),
        },
      )
      return response.ok
    } catch {
      return false
    }
  }

  // Allow access from Tailscale, LAN, or custom domains via env var
  // e.g. HERMES_ALLOWED_HOSTS=my-server.tail1234.ts.net,192.168.1.50
  const _allowedHosts: string[] | true = env.HERMES_ALLOWED_HOSTS?.trim()
    ? env
        .HERMES_ALLOWED_HOSTS!.split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    : ['.ts.net'] // allow all Tailscale hostnames by default
  let proxyTarget = 'http://127.0.0.1:18789'

  try {
    const parsed = new URL(hermesApiUrl)
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:'
    parsed.pathname = ''
    proxyTarget = parsed.toString().replace(/\/$/, '')
  } catch {
    // fallback
  }

  return {
    define: {
      // Note: Do NOT set 'process.env': {} here — TanStack Start uses environment-based
      // builds where isSsrBuild is unreliable. Blanket process.env replacement breaks
      // server-side code in Docker (kills runtime env var access).
      // Client-side process.env is handled per-environment below.
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    ssr: {
      external: [
        'playwright',
        'playwright-core',
        'playwright-extra',
        'puppeteer-extra-plugin-stealth',
      ],
    },
    optimizeDeps: {
      exclude: [
        'playwright',
        'playwright-core',
        'playwright-extra',
        'puppeteer-extra-plugin-stealth',
      ],
    },
    server: {
      // Force IPv4 — 'localhost' resolves to ::1 (IPv6) on Windows, breaking connectivity
      host: '0.0.0.0',
      port: 3002,
      strictPort: false, // allow fallback if 3002 is taken, but log clearly
      allowedHosts: true,
      watch: {
        // Exclude generated route tree — TanStack Router's file watcher
        // detects its own output as a change → infinite regeneration loop
        ignored: ['**/routeTree.gen.ts'],
      },
      proxy: {
        // WebSocket proxy: clients connect to /ws-hermes on the Hermes Workspace
        // server (any IP/port), which internally forwards to the local server.
        // This means phone/LAN/Docker users never need to reach port 18789 directly.
        '/ws-hermes': {
          target: proxyTarget,
          changeOrigin: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws-hermes/, ''),
        },
// REST API proxy: API proxy for Hermes backend
        '/api/hermes-proxy': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/hermes-proxy/, ''),
        },
        '/hermes-ui': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hermes-ui/, ''),
          ws: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (_proxyRes) => {
              // Strip iframe-blocking headers so we can embed
              delete _proxyRes.headers['x-frame-options']
              delete _proxyRes.headers['content-security-policy']
            })
          },
        },
        '/workspace-api': {
          target: 'http://127.0.0.1:3099',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/workspace-api/, ''),
        },
      },
    },
    plugins: [
      // devtools(),
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
      {
        name: 'workspace-daemon',
        buildStart() {
          if (command !== 'serve') return
        },
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const requestPath = req.url?.split('?')[0]
            if (req.method === 'GET' && requestPath === '/api/healthcheck') {
              res.statusCode = 200
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
              return
            }

            // Portable-aware health check — returns ok if any chat backend is available
            if (
              req.method === 'GET' &&
              requestPath === '/api/connection-status'
            ) {
              try {
                // Check for enhanced Hermes gateway first (has /api/sessions)
                const [modelsRes, sessionsRes] = await Promise.all([
                  fetch(`${hermesApiUrl}/v1/models`, {
                    signal: AbortSignal.timeout(3000),
                  }).catch(() => null),
                  fetch(`${hermesApiUrl}/api/sessions?limit=1`, {
                    signal: AbortSignal.timeout(3000),
                  }).catch(() => null),
                ])
                const hasModels = modelsRes?.ok ?? false
                const hasSessions = sessionsRes?.ok ?? false
                if (hasModels && hasSessions) {
                  res.statusCode = 200
                  res.setHeader('content-type', 'application/json')
                  res.end(
                    JSON.stringify({
                      ok: true,
                      mode: 'enhanced',
                      backend: hermesApiUrl,
                    }),
                  )
                  return
                }
                if (hasModels) {
                  res.statusCode = 200
                  res.setHeader('content-type', 'application/json')
                  res.end(
                    JSON.stringify({
                      ok: true,
                      mode: 'portable',
                      backend: hermesApiUrl,
                    }),
                  )
                  return
                }
                // Fall back to /health for full Hermes backends
                const healthRes = await fetch(`${hermesApiUrl}/health`, {
                  signal: AbortSignal.timeout(3000),
                })
                res.statusCode = healthRes.ok ? 200 : 502
                res.setHeader('content-type', 'application/json')
                res.end(
                  JSON.stringify({
                    ok: healthRes.ok,
                    mode: 'enhanced',
                    backend: hermesApiUrl,
                  }),
                )
              } catch {
                res.statusCode = 502
                res.setHeader('content-type', 'application/json')
                res.end(
                  JSON.stringify({
                    ok: false,
                    mode: 'disconnected',
                    backend: hermesApiUrl,
                  }),
                )
              }
              return
            }

            if (
              req.method !== 'POST' ||
              requestPath !== '/api/workspace/daemon/restart'
            ) {
              next()
              return
            }

            try {
              await restartWorkspaceDaemon()
              res.statusCode = 200
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (error) {
              res.statusCode = 500
              res.setHeader('content-type', 'application/json')
              res.end(
                JSON.stringify({
                  error:
                    error instanceof Error ? error.message : 'Internal error',
                }),
              )
            }
          })

          server.httpServer?.on('close', () => {
            workspaceDaemonShuttingDown = true
            workspaceDaemonStarted = false
            workspaceDaemonStarting = false
            if (workspaceDaemonChild) {
              workspaceDaemonChild.kill()
              workspaceDaemonChild = null
            }
          })

          // Auto-start hermes-agent when dev server launches
          if (command === 'serve') {
            void startHermesAgent()
          }

          // Shutdown hermes-agent when dev server stops
          server.httpServer?.on('close', () => {
            if (hermesAgentChild) {
              console.log('[hermes-agent] Stopping...')
              hermesAgentChild.kill('SIGTERM')
              hermesAgentChild = null
              hermesAgentStarted = false
            }
          })

          if (
            command !== 'serve' ||
            workspaceDaemonStarted ||
            workspaceDaemonStarting
          )
            return

          workspaceDaemonStarting = true
          void (async () => {
            const running = await isPortInUse(Number(workspaceDaemonPort))
            if (workspaceDaemonStarted) {
              workspaceDaemonStarting = false
              return
            }

            if (running) {
              const healthy = await hasHealthyWorkspaceDaemon()
              if (healthy) {
                workspaceDaemonStarting = false
                console.log('[workspace-daemon] Reusing existing daemon')
                return
              }

              try {
                execSync(
                  `lsof -ti:${workspaceDaemonPort} | xargs kill -9 2>/dev/null || true`,
                )
              } catch {
                // ignore stale cleanup failures and continue with a fresh spawn
              }
            }

            startWorkspaceDaemon()
          })()
        },
      },
      // Client-only: replace process.env references in client bundles
      // Server bundles must keep real process.env for Docker runtime env vars
      {
        name: 'client-process-env',
        enforce: 'pre',
        transform(code, _id) {
          const envName = this.environment?.name
          if (envName !== 'client') return null
          if (
            !code.includes('process.env') &&
            !code.includes('process.platform')
          )
            return null

          // Replace specific env vars first, then the generic fallback
          let result = code
          result = result.replace(
            /process\.env\.HERMES_API_URL/g,
            JSON.stringify(hermesApiUrl),
          )
          result = result.replace(
            /process\.env\.HERMES_API_TOKEN/g,
            JSON.stringify(env.HERMES_API_TOKEN || ''),
          )
          result = result.replace(
            /process\.env\.NODE_ENV/g,
            JSON.stringify(mode),
          )
          result = result.replace(/process\.env/g, '{}')
          result = result.replace(/process\.platform/g, '"browser"')
          return result
        },
      },
      // Copy pty-helper.py into the server assets directory after build
      {
        name: 'copy-pty-helper',
        closeBundle() {
          const src = resolve('src/server/pty-helper.py')
          const destDir = resolve('dist/server/assets')
          const dest = resolve(destDir, 'pty-helper.py')
          if (existsSync(src)) {
            mkdirSync(destDir, { recursive: true })
            copyFileSync(src, dest)
          }
        },
      },
    ],
  }
})

export default config
