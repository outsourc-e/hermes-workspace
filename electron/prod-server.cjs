const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const portArg = process.argv.find(
  (value, index, arr) => arr[index - 1] === '--port',
)
const PORT = Number.parseInt(process.env.PORT || portArg || '3847', 10)
const DIST_CLIENT = path.join(__dirname, '..', 'dist', 'client')
const BUNDLED_SERVER = path.join(__dirname, 'server-bundle.cjs')
const UNBUNDLED_SERVER = path.join(
  __dirname,
  '..',
  'dist',
  'server',
  'server.js',
)

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
}

async function loadServerBuild() {
  if (fs.existsSync(BUNDLED_SERVER)) {
    const bundled = require(BUNDLED_SERVER)
    return bundled.default || bundled
  }
  const serverModule = await import(`file://${UNBUNDLED_SERVER}`)
  return serverModule.default
}

/**
 * GUI apps launched from Finder/Dock (macOS) don't inherit shell environment
 * variables, so HERMES_API_TOKEN is unset even when the gateway requires it.
 * Fall back to the API_SERVER_KEY the gateway itself reads from
 * $HERMES_HOME/.env (~/.hermes/.env by default), so the desktop app works
 * without any shell configuration.
 */
function applyApiTokenFileFallback() {
  if (process.env.HERMES_API_TOKEN) return
  try {
    const hermesHome =
      process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')
    const envFile = path.join(hermesHome, '.env')
    if (!fs.existsSync(envFile)) return
    const match = fs
      .readFileSync(envFile, 'utf-8')
      .match(/^\s*API_SERVER_KEY\s*=\s*(.+)\s*$/m)
    if (!match) return
    const value = match[1].trim().replace(/^["']|["']$/g, '')
    if (value) process.env.HERMES_API_TOKEN = value
  } catch {
    // Best-effort: fall through silently, requests will just go unauthenticated
    // exactly as they do today when the variable is missing.
  }
}

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production'
  process.env.HERMES_WORKSPACE_DESKTOP =
    process.env.HERMES_WORKSPACE_DESKTOP || '1'
  process.env.HERMES_API_URL =
    process.env.HERMES_API_URL || 'http://127.0.0.1:8642'
  process.env.HERMES_DASHBOARD_URL =
    process.env.HERMES_DASHBOARD_URL || 'http://127.0.0.1:9119'
  // Must run before loadServerBuild(): parts of the server bundle read
  // HERMES_API_TOKEN at module load time (e.g. the gateway bearer token).
  applyApiTokenFileFallback()

  const serverBuild = await loadServerBuild()

  const server = http.createServer(async (req, res) => {
    const url = req.url || '/'
    const pathname = url.split('?')[0]

    if (pathname !== '/' && !pathname.startsWith('/api/')) {
      const filePath = path.join(DIST_CLIENT, pathname)
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath)
        const mime = MIME_TYPES[ext] || 'application/octet-stream'
        const content = fs.readFileSync(filePath)
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': pathname.includes('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
        })
        res.end(content)
        return
      }
    }

    try {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      const protocol = req.headers['x-forwarded-proto'] || 'http'
      const host = req.headers.host || `127.0.0.1:${PORT}`
      const fullUrl = `${protocol}://${host}${url}`
      const webRequest = new Request(fullUrl, {
        method: req.method,
        headers,
        body:
          req.method !== 'GET' && req.method !== 'HEAD'
            ? await new Promise((resolve) => {
                const chunks = []
                req.on('data', (chunk) => chunks.push(chunk))
                req.on('end', () => resolve(Buffer.concat(chunks)))
              })
            : undefined,
        duplex: 'half',
      })
      const webResponse = await serverBuild.fetch(webRequest)
      const resHeaders = {}
      webResponse.headers.forEach((value, key) => {
        resHeaders[key] = value
      })
      res.writeHead(
        webResponse.status,
        webResponse.statusText || '',
        resHeaders,
      )
      if (webResponse.body) {
        const reader = webResponse.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
      }
      res.end()
    } catch (error) {
      console.error('[Hermes Workspace desktop] SSR error:', error)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(
      `[Hermes Workspace desktop] server listening on http://127.0.0.1:${PORT}`,
    )
    if (process.send) process.send({ type: 'ready', port: PORT })
  })
}

main().catch((error) => {
  console.error('[Hermes Workspace desktop] fatal:', error)
  process.exit(1)
})
