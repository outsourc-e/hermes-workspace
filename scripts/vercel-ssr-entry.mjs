// Vercel SSR serverless function entry (copied to .vercel/output/functions/ssr.func/index.mjs
// by scripts/vercel-build.mjs). Adapts a Node (req, res) invocation to the
// TanStack Start Web fetch handler exported by the built server bundle.
//
// Static assets are served by Vercel's filesystem handler before requests
// reach here (see config.json), so this only handles SSR/API routes.
//
// NOTE: this is the *shell* runtime. Workspace features that need a persistent
// host — PTY terminals, the hermes-agent gateway, websockets, the local file
// browser — cannot run on Vercel's serverless runtime. See docs/deploy.md.
import server from './dist/server/server.js'

export default async function handler(req, res) {
  try {
    const proto =
      req.headers['x-forwarded-proto'] ||
      (req.socket && req.socket.encrypted ? 'https' : 'http')
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
    const url = new URL(req.url || '/', `${proto}://${host}`)

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
    }

    let body = null
    if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => resolve(Buffer.concat(chunks)))
        req.on('error', reject)
      })
    }

    const request = new Request(url.toString(), {
      method: req.method || 'GET',
      headers,
      body,
      duplex: 'half',
    })

    const response = await server.fetch(request)

    res.statusCode = response.status
    response.headers.forEach((v, k) => {
      // Let the platform manage hop-by-hop / encoding headers.
      if (k === 'content-length' || k === 'transfer-encoding') return
      res.setHeader(k, v)
    })

    if (response.body) {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
      res.end()
    } else {
      res.end(await response.text())
    }
  } catch (err) {
    console.error('[vercel-ssr] request error:', err)
    if (!res.headersSent) res.statusCode = 500
    res.end('Internal Server Error')
  }
}
