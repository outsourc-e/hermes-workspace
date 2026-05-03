/**
 * Hermes Playground multiplayer hub — Cloudflare Worker + Durable Object.
 *
 * One Durable Object instance per "room" (currently global). Stateless relay
 * that mirrors the Node sidecar (`scripts/playground-ws.mjs`) protocol so
 * the client (`use-playground-multiplayer.ts`) connects unchanged.
 *
 * Endpoints
 *   GET  /playground   — WebSocket upgrade (presence + chat fan-out)
 *   GET  /stats        — JSON { online, byWorld, peakToday, ts }
 *   GET  /health       — JSON { ok: true }
 */

export interface Env {
  PLAYGROUND_HUB: DurableObjectNamespace
}

interface PresenceMsg {
  kind: 'presence'
  id: string
  worldId?: string
  [key: string]: unknown
}

const STALE_AFTER_MS = 6000
const CHAT_RING_MAX = 50

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    // Single global room for v0; partition by ?room= later if needed.
    const id = env.PLAYGROUND_HUB.idFromName('global')
    const stub = env.PLAYGROUND_HUB.get(id)
    return stub.fetch(request)
  },
}

export class PlaygroundHub {
  state: DurableObjectState
  sockets = new Set<WebSocket>()
  socketMeta = new WeakMap<WebSocket, { playerId?: string }>()
  presence = new Map<string, PresenceMsg & { ts: number }>()
  chatRing: any[] = []
  peakToday = 0
  peakDay = ''

  constructor(state: DurableObjectState) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<{ peak: number; day: string }>('peak')
      if (stored) {
        this.peakToday = stored.peak
        this.peakDay = stored.day
      }
    })
    // Periodic prune for stale presence
    this.state.blockConcurrencyWhile(async () => {
      this.scheduleAlarm()
    })
  }

  async scheduleAlarm() {
    const cur = await this.state.storage.getAlarm()
    if (!cur) await this.state.storage.setAlarm(Date.now() + 1000)
  }

  async alarm() {
    this.pruneStale()
    if (this.sockets.size > 0) {
      await this.state.storage.setAlarm(Date.now() + 1000)
    }
  }

  pruneStale() {
    const cutoff = Date.now() - STALE_AFTER_MS
    for (const [id, p] of this.presence) {
      if (p.ts < cutoff) {
        this.presence.delete(id)
        this.broadcast(null, { kind: 'leave', id })
      }
    }
  }

  broadcast(origin: WebSocket | null, data: any) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    for (const sock of this.sockets) {
      if (sock === origin) continue
      try { sock.send(payload) } catch {}
    }
  }

  todayKey(): string {
    return new Date().toISOString().slice(0, 10)
  }

  async bumpPeak() {
    const today = this.todayKey()
    if (today !== this.peakDay) {
      this.peakDay = today
      this.peakToday = 0
    }
    if (this.sockets.size > this.peakToday) {
      this.peakToday = this.sockets.size
      await this.state.storage.put('peak', { peak: this.peakToday, day: this.peakDay })
    }
  }

  statsJson() {
    const byWorld: Record<string, number> = {}
    for (const p of this.presence.values()) {
      const w = (p.worldId as string) || 'unknown'
      byWorld[w] = (byWorld[w] || 0) + 1
    }
    return {
      online: this.presence.size,
      byWorld,
      peakToday: this.peakToday,
      peakDay: this.peakDay,
      ts: Date.now(),
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': 'content-type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors })
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      return Response.json(
        { ok: true, online: this.sockets.size, ts: Date.now() },
        { headers: cors },
      )
    }

    if (url.pathname === '/stats') {
      return Response.json(this.statsJson(), {
        headers: { ...cors, 'cache-control': 'no-cache' },
      })
    }

    if (url.pathname === '/playground') {
      const upgradeHeader = request.headers.get('Upgrade')
      if (upgradeHeader !== 'websocket') {
        return new Response('expected websocket', { status: 426, headers: cors })
      }
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]
      this.handleSocket(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    return new Response('not found', { status: 404, headers: cors })
  }

  async handleSocket(socket: WebSocket) {
    socket.accept()
    this.sockets.add(socket)
    this.socketMeta.set(socket, {})
    await this.bumpPeak()
    await this.scheduleAlarm()

    try {
      socket.send(JSON.stringify({ kind: 'hello', server: 'hermes.playground.cf-worker.v0', ts: Date.now() }))
      // bootstrap snapshot
      for (const p of this.presence.values()) {
        try { socket.send(JSON.stringify(p)) } catch {}
      }
      for (const c of this.chatRing) {
        try { socket.send(JSON.stringify(c)) } catch {}
      }
    } catch {}

    socket.addEventListener('message', (evt) => {
      let msg: any
      try { msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer)) } catch { return }
      if (!msg || typeof msg.kind !== 'string') return
      if (msg.kind === 'presence' && msg.id) {
        const m = { ...msg, ts: Date.now() } as PresenceMsg & { ts: number }
        this.presence.set(msg.id, m)
        const meta = this.socketMeta.get(socket)
        if (meta) meta.playerId = msg.id
        this.broadcast(socket, msg)
      } else if (msg.kind === 'chat' && msg.id) {
        this.chatRing.push(msg)
        if (this.chatRing.length > CHAT_RING_MAX) this.chatRing.shift()
        this.broadcast(socket, msg)
      } else if (msg.kind === 'leave' && msg.id) {
        this.presence.delete(msg.id)
        this.broadcast(socket, msg)
      }
    })

    const cleanup = () => {
      this.sockets.delete(socket)
      const meta = this.socketMeta.get(socket)
      if (meta?.playerId && this.presence.has(meta.playerId)) {
        this.presence.delete(meta.playerId)
        this.broadcast(null, { kind: 'leave', id: meta.playerId })
      }
    }
    socket.addEventListener('close', cleanup)
    socket.addEventListener('error', cleanup)
  }
}
