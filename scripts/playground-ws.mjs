#!/usr/bin/env node
/**
 * Hermes Playground WebSocket presence hub.
 *
 * Tiny stateless relay: every client publishes a presence/chat envelope,
 * the server fans it out to every other client. The server keeps an
 * in-memory map of last-seen presence to quickly bootstrap newcomers.
 *
 * Wire format mirrors `usePlaygroundMultiplayer` so we can swap the
 * client transport without changing protocol.
 *
 * Run:
 *   node scripts/playground-ws.mjs               # default port 8787
 *   PORT=9000 node scripts/playground-ws.mjs
 *
 * For client config:
 *   VITE_PLAYGROUND_WS_URL=ws://localhost:8787 pnpm dev
 *
 * Deploy:
 *   This is a 70-line ws relay. Drop in any Node host (Fly.io, Render,
 *   Railway, Cloudflare Workers w/ Durable Objects, EC2, etc.). No DB
 *   required for v0. Add Redis if you want multi-instance fanout.
 */

import http from 'node:http'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 8787)
const STALE_AFTER_MS = 6000

const presence = new Map() // id -> last presence wire
const chatRing = []
const CHAT_RING_MAX = 50

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, players: presence.size, ts: Date.now() }))
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server, path: '/playground' })

function broadcast(originSocket, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  for (const client of wss.clients) {
    if (client !== originSocket && client.readyState === 1) {
      try { client.send(payload) } catch {}
    }
  }
}

function pruneStale() {
  const cutoff = Date.now() - STALE_AFTER_MS
  for (const [id, p] of presence) {
    if (p.ts < cutoff) {
      presence.delete(id)
      broadcast(null, { kind: 'leave', id })
    }
  }
}
setInterval(pruneStale, 1000)

wss.on('connection', (socket, req) => {
  socket.id = `c_${Math.random().toString(36).slice(2, 10)}`
  socket.send(JSON.stringify({ kind: 'hello', server: 'hermes.playground.v0', ts: Date.now() }))
  // Snapshot existing presence for the newcomer
  for (const p of presence.values()) {
    try { socket.send(JSON.stringify(p)) } catch {}
  }
  for (const c of chatRing) {
    try { socket.send(JSON.stringify(c)) } catch {}
  }

  socket.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (!msg || typeof msg.kind !== 'string') return
    if (msg.kind === 'presence' && msg.id) {
      presence.set(msg.id, msg)
      broadcast(socket, msg)
    } else if (msg.kind === 'chat' && msg.id) {
      chatRing.push(msg)
      if (chatRing.length > CHAT_RING_MAX) chatRing.shift()
      broadcast(socket, msg)
    } else if (msg.kind === 'leave' && msg.id) {
      presence.delete(msg.id)
      broadcast(socket, msg)
    }
  })

  socket.on('close', () => {
    // The client should send 'leave', but if it doesn't we'll reap on staleness
  })
})

server.listen(PORT, () => {
  console.log(`[hermes-playground-ws] listening on :${PORT} path=/playground`)
})
