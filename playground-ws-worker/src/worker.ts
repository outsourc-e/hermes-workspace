/**
 * Hermes Playground multiplayer hub — Cloudflare Worker + Durable Object.
 *
 * One Durable Object instance per "room" (currently global). Stateless relay
 * that mirrors the Node sidecar (`scripts/playground-ws.mjs`) protocol so
 * the client (`use-playground-multiplayer.ts`) connects unchanged.
 *
 * v1 hardening (2026-05-03):
 *   - World-scoped fan-out: only broadcast presence to clients in same world.
 *   - Server pushes `count` events on changes (HUD doesn't need to poll).
 *   - Per-socket rate limit: 30 msgs/sec token bucket (drop excess).
 *   - Dedupe: skip relaying identical presence within 50ms per player.
 *   - Stale prune at 5s (matches client).
 *
 * Endpoints
 *   GET  /playground   — WebSocket upgrade (presence + chat fan-out)
 *   GET  /stats        — JSON { online, byWorld, peakToday, ts }
 *   GET  /health       — JSON { ok: true, online, ts }
 */

export interface Env {
  PLAYGROUND_HUB: DurableObjectNamespace
}

interface PresenceMsg {
  kind: 'presence'
  id: string
  worldId?: string
  world?: string
  x?: number
  y?: number
  z?: number
  yaw?: number
  ts?: number
  [key: string]: unknown
}

const STALE_AFTER_MS = 12000 // bumped from 5000 — forgive bg-tab throttling so avatars don't flicker
const CHAT_RING_MAX = 50
const PRESENCE_DEDUPE_MS = 50
const RATE_BUCKET_CAP = 30 // msgs
const RATE_REFILL_PER_SEC = 30

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.PLAYGROUND_HUB.idFromName('global')
    const stub = env.PLAYGROUND_HUB.get(id)
    return stub.fetch(request)
  },
}

interface SocketMeta {
  playerId?: string
  world?: string
  bucket: number
  bucketTs: number
  lastPresenceTs: number
}

export class PlaygroundHub {
  state: DurableObjectState
  sockets = new Set<WebSocket>()
  socketMeta = new WeakMap<WebSocket, SocketMeta>()
  presence = new Map<string, PresenceMsg & { ts: number }>()
  chatRing: any[] = []
  peakToday = 0
  peakDay = ''
  // Sliding count for push notifications when set changes.
  lastBroadcastCount = -1

  constructor(state: DurableObjectState) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<{ peak: number; day: string }>('peak')
      if (stored) {
        this.peakToday = stored.peak
        this.peakDay = stored.day
      }
    })
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
    let removed = false
    for (const [id, p] of this.presence) {
      const ts = (p as any).ts
      if (typeof ts === 'number' && ts < cutoff) {
        this.presence.delete(id)
        const world = (p.world || p.worldId) as string | undefined
        this.broadcast(null, { kind: 'leave', id }, { world })
        removed = true
      }
    }
    if (removed) this.maybeBroadcastCount()
  }

  worldOf(socket: WebSocket): string | undefined {
    return this.socketMeta.get(socket)?.world
  }

  broadcast(origin: WebSocket | null, data: any, opts?: { world?: string }) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    for (const sock of this.sockets) {
      if (sock === origin) continue
      if (opts?.world && this.worldOf(sock) && this.worldOf(sock) !== opts.world) continue
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
    const live = this.presence.size
    if (live > this.peakToday) {
      this.peakToday = live
      await this.state.storage.put('peak', { peak: this.peakToday, day: this.peakDay })
    }
  }

  byWorld(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const p of this.presence.values()) {
      const w = (p.world || p.worldId) as string | undefined
      if (!w) continue
      out[w] = (out[w] || 0) + 1
    }
    return out
  }

  countMessage() {
    return JSON.stringify({
      kind: 'count',
      online: this.presence.size,
      byWorld: this.byWorld(),
      peakToday: this.peakToday,
      ts: Date.now(),
    })
  }

  /** Push a count update to all sockets when the count actually changed. */
  maybeBroadcastCount() {
    const live = this.presence.size
    if (live === this.lastBroadcastCount) return
    this.lastBroadcastCount = live
    const payload = this.countMessage()
    for (const sock of this.sockets) {
      try { sock.send(payload) } catch {}
    }
  }

  statsJson() {
    return {
      online: this.presence.size,
      byWorld: this.byWorld(),
      peakToday: this.peakToday,
      peakDay: this.peakDay,
      ts: Date.now(),
    }
  }

  // Token bucket: returns true if allowed, false if rate-limited.
  spend(meta: SocketMeta): boolean {
    const now = Date.now()
    const dt = (now - meta.bucketTs) / 1000
    meta.bucket = Math.min(RATE_BUCKET_CAP, meta.bucket + dt * RATE_REFILL_PER_SEC)
    meta.bucketTs = now
    if (meta.bucket < 1) return false
    meta.bucket -= 1
    return true
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
        { ok: true, online: this.presence.size, ts: Date.now() },
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
    this.socketMeta.set(socket, {
      bucket: RATE_BUCKET_CAP,
      bucketTs: Date.now(),
      lastPresenceTs: 0,
    })
    await this.scheduleAlarm()

    try {
      socket.send(JSON.stringify({ kind: 'hello', server: 'hermes.playground.cf-worker.v1', ts: Date.now() }))
      // Send current count baseline immediately for HUD.
      socket.send(this.countMessage())
      // bootstrap presence snapshot
      for (const p of this.presence.values()) {
        try { socket.send(JSON.stringify(p)) } catch {}
      }
      for (const c of this.chatRing) {
        try { socket.send(JSON.stringify(c)) } catch {}
      }
    } catch {}

    socket.addEventListener('message', async (evt) => {
      const meta = this.socketMeta.get(socket)
      if (!meta) return
      if (!this.spend(meta)) return // dropped (rate limited)
      let msg: any
      try { msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer)) } catch { return }
      if (!msg || typeof msg.kind !== 'string') return

      if (msg.kind === 'presence' && typeof msg.id === 'string') {
        const now = Date.now()
        if (now - meta.lastPresenceTs < PRESENCE_DEDUPE_MS) return
        meta.lastPresenceTs = now
        const world = (msg.world || msg.worldId) as string | undefined
        meta.playerId = msg.id
        meta.world = world
        const wire: PresenceMsg & { ts: number } = { ...msg, ts: now }
        const wasNew = !this.presence.has(msg.id)
        this.presence.set(msg.id, wire)
        if (wasNew) {
          await this.bumpPeak()
          this.maybeBroadcastCount()
        }
        // World-scoped fan-out
        this.broadcast(socket, wire, { world })
      } else if (msg.kind === 'chat' && typeof msg.id === 'string') {
        // Truncate text defensively
        if (typeof msg.text === 'string' && msg.text.length > 240) {
          msg.text = msg.text.slice(0, 240)
        }
        this.chatRing.push(msg)
        if (this.chatRing.length > CHAT_RING_MAX) this.chatRing.shift()
        const world = (msg.world || msg.worldId) as string | undefined
        this.broadcast(socket, msg, { world })
      } else if (msg.kind === 'leave' && typeof msg.id === 'string') {
        const prior = this.presence.get(msg.id)
        const world = (prior?.world || prior?.worldId) as string | undefined
        this.presence.delete(msg.id)
        this.broadcast(socket, msg, { world })
        this.maybeBroadcastCount()
      }
    })

    const cleanup = () => {
      this.sockets.delete(socket)
      const meta = this.socketMeta.get(socket)
      this.socketMeta.delete(socket)
      // Do NOT immediately broadcast 'leave' on socket close — the client may
      // be reconnecting transparently (browser idle hibernation, network blip,
      // bg-tab throttling). Let the alarm-driven pruneStale handle it after
      // STALE_AFTER_MS (12s) of no presence packets. This eliminates the
      // 'avatar disappeared then came back' flicker that was happening every
      // time a tab momentarily lost focus.
      if (meta?.playerId && this.presence.has(meta.playerId)) {
        // Mark presence as 'aging' by setting an old ts so prune picks it up
        // if no reconnect happens within STALE_AFTER_MS.
        const cur = this.presence.get(meta.playerId)
        if (cur) {
          ;(cur as any).ts = Date.now() - (STALE_AFTER_MS / 2)
          this.presence.set(meta.playerId, cur)
        }
      }
    }
    socket.addEventListener('close', cleanup)
    socket.addEventListener('error', cleanup)
  }
}
