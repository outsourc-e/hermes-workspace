import { URL, fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import { resolve } from 'node:path'

// devtools removed
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// nitro plugin removed (tanstackStart handles server runtime)
import { defineConfig, loadEnv } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const config = defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gatewayUrl = env.CLAWDBOT_GATEWAY_URL?.trim() || 'ws://127.0.0.1:18789'
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
  // e.g. CLAWSUITE_ALLOWED_HOSTS=my-server.tail1234.ts.net,192.168.1.50
  const allowedHosts: string[] | true = env.CLAWSUITE_ALLOWED_HOSTS?.trim()
    ? env.CLAWSUITE_ALLOWED_HOSTS.split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    : []
  let proxyTarget = 'http://127.0.0.1:18789'

  try {
    const parsed = new URL(gatewayUrl)
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
      // Force IPv4 — 'localhost' resolves to ::1 (IPv6) on Windows, breaking gateway connectivity
      host: allowedHosts.length > 0 ? '0.0.0.0' : '127.0.0.1',
      allowedHosts: allowedHosts.length > 0 ? [...allowedHosts, '127.0.0.1', 'localhost'] : ['127.0.0.1', 'localhost'],
      proxy: {
        // WebSocket proxy: clients connect to /ws-gateway on the ClawSuite
        // server (any IP/port), which internally forwards to the local gateway.
        // This means phone/LAN/Docker users never need to reach port 18789 directly.
        '/ws-gateway': {
          target: proxyTarget,
          changeOrigin: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws-gateway/, ''),
        },
        // REST API proxy: all /api/gateway/* calls proxied through ClawSuite server
        '/api/gateway-proxy': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gateway-proxy/, ''),
        },
        '/gateway-ui': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/gateway-ui/, ''),
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

          if (command !== 'serve' || workspaceDaemonStarted || workspaceDaemonStarting) return

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
          if (!code.includes('process.env') && !code.includes('process.platform')) return null

          // Replace specific env vars first, then the generic fallback
          let result = code
          result = result.replace(/process\.env\.CLAWDBOT_GATEWAY_URL/g, JSON.stringify(gatewayUrl))
          result = result.replace(/process\.env\.CLAWDBOT_GATEWAY_TOKEN/g, JSON.stringify(env.CLAWDBOT_GATEWAY_TOKEN || ''))
          result = result.replace(/process\.env\.NODE_ENV/g, JSON.stringify(mode))
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
