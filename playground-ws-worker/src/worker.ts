/**
 * Hermes Playground multiplayer hub — Cloudflare Worker + Durable Object.
 *
 * One Durable Object instance per "room" (currently global).
 *
 * v2 (2026-05-04): Hibernation API — uses state.acceptWebSocket() so the DO
 * can hibernate when idle without killing live WebSocket connections. Without
 * this, the DO worker would hibernate after ~10s of inactivity and silently
 * close every WS, causing the "everyone disappears" bug for users on the
 * title screen or with bg tabs.
 *
 * v1 hardening:
 *   - World-scoped fan-out: only broadcast presence to clients in same world.
 *   - Server pushes `count` events on changes (HUD doesn't need to poll).
 *   - Per-socket rate limit: 30 msgs/sec token bucket (drop excess).
 *   - Dedupe: skip relaying identical presence within 50ms per player.
 *   - Stale prune at 12s.
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

const STALE_AFTER_MS = 12000
const CHAT_RING_MAX = 50
const PRESENCE_DEDUPE_MS = 50
const RATE_BUCKET_CAP = 30
const RATE_REFILL_PER_SEC = 30

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.PLAYGROUND_HUB.idFromName('global')
    const stub = env.PLAYGROUND_HUB.get(id)
    return stub.fetch(request)
  },
}

// Per-socket meta is attached via state.serializeAttachment so it survives
// hibernation. We persist only what we need to route messages.
interface SocketAttach {
  playerId?: string
  world?: string
  bucket: number
  bucketTs: number
  lastPresenceTs: number
}

export class PlaygroundHub {
  state: DurableObjectState
  presence = new Map<string, PresenceMsg & { ts: number }>()
  chatRing: any[] = []
  peakToday = 0
  peakDay = ''
  lastBroadcastCount = -1

  constructor(state: DurableObjectState) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<{ peak: number; day: string }>('peak')
      if (stored) {
        this.peakToday = stored.peak
        this.peakDay = stored.day
      }
      // Restore presence map from storage so we survive hibernation.
      const presStored = await this.state.storage.get<Array<[string, PresenceMsg & { ts: number }]>>('presence')
      if (presStored) this.presence = new Map(presStored)
      const chatStored = await this.state.storage.get<any[]>('chatRing')
      if (chatStored) this.chatRing = chatStored
    })
    this.state.blockConcurrencyWhile(async () => {
      this.scheduleAlarm()
    })
  }

  // ───── Persistence helpers ─────
  async persistPresence() {
    try {
      await this.state.storage.put('presence', [...this.presence.entries()])
    } catch {}
  }

  async persistChat() {
    try {
      await this.state.storage.put('chatRing', this.chatRing)
    } catch {}
  }

  // ───── Alarm-driven prune ─────
  async scheduleAlarm() {
    const cur = await this.state.storage.getAlarm()
    if (!cur) await this.state.storage.setAlarm(Date.now() + 1000)
  }

  async alarm() {
    await this.pruneStale()
    if (this.state.getWebSockets().length > 0 || this.presence.size > 0) {
      await this.state.storage.setAlarm(Date.now() + 1000)
    }
  }

  async pruneStale() {
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
    if (removed) {
      await this.persistPresence()
      this.maybeBroadcastCount()
    }
  }

  // ───── Hibernation-safe socket helpers ─────
  attach(socket: WebSocket): SocketAttach {
    let attached = socket.deserializeAttachment() as SocketAttach | undefined
    if (!attached) {
      attached = {
        bucket: RATE_BUCKET_CAP,
        bucketTs: Date.now(),
        lastPresenceTs: 0,
      }
      socket.serializeAttachment(attached)
    }
    return attached
  }

  saveAttach(socket: WebSocket, a: SocketAttach) {
    socket.serializeAttachment(a)
  }

  worldOf(socket: WebSocket): string | undefined {
    const a = socket.deserializeAttachment() as SocketAttach | undefined
    return a?.world
  }

  broadcast(origin: WebSocket | null, data: any, opts?: { world?: string }) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    for (const sock of this.state.getWebSockets()) {
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

  maybeBroadcastCount() {
    const live = this.presence.size
    if (live === this.lastBroadcastCount) return
    this.lastBroadcastCount = live
    const payload = this.countMessage()
    for (const sock of this.state.getWebSockets()) {
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

  spend(a: SocketAttach): boolean {
    const now = Date.now()
    const dt = (now - a.bucketTs) / 1000
    a.bucket = Math.min(RATE_BUCKET_CAP, a.bucket + dt * RATE_REFILL_PER_SEC)
    a.bucketTs = now
    if (a.bucket < 1) return false
    a.bucket -= 1
    return true
  }

  // ───── Fetch handler ─────
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const cors: HeadersInit = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
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

    // ───── HTTP polling endpoints (reliable fallback for WebSockets) ─────
    // POST /presence  body: { id, name, color, world, x, y, z, yaw, avatar?, lastChatAt? }
    //   Updates presence + returns { presences: [...other-players-in-world], chats: [...recent], count, byWorld, peakToday }
    if (url.pathname === '/presence' && request.method === 'POST') {
      let body: any
      try { body = await request.json() } catch { return new Response('bad json', { status: 400, headers: cors }) }
      if (!body || typeof body.id !== 'string') return new Response('missing id', { status: 400, headers: cors })
      const now = Date.now()
      const world = (body.world || body.worldId) as string | undefined
      const wire: PresenceMsg & { ts: number } = { ...body, kind: 'presence', ts: now }
      const wasNew = !this.presence.has(body.id)
      this.presence.set(body.id, wire)
      if (wasNew) {
        await this.bumpPeak()
        this.maybeBroadcastCount()
      }
      // Persist async — don't block the response
      this.persistPresence().catch(() => {})
      // Mirror to any active WebSockets (so clients on either transport see each other)
      this.broadcast(null, wire, { world })
      // Return: presences in same world (excluding caller), recent chats, count summary
      const presences = []
      for (const [id, p] of this.presence) {
        if (id === body.id) continue
        const pw = (p.world || p.worldId) as string | undefined
        if (world && pw && pw !== world) continue
        presences.push(p)
      }
      const sinceTs = typeof body.sinceChatTs === 'number' ? body.sinceChatTs : (now - 30000)
      const chats = this.chatRing.filter((c: any) => {
        if (typeof c.ts !== 'number' || c.ts <= sinceTs) return false
        if (c.id === body.id) return false
        const cw = (c.world || c.worldId) as string | undefined
        if (world && cw && cw !== world) return false
        return true
      })
      return Response.json({
        presences,
        chats,
        online: this.presence.size,
        byWorld: this.byWorld(),
        peakToday: this.peakToday,
        ts: now,
      }, { headers: { ...cors, 'cache-control': 'no-cache' } })
    }

    // POST /chat   body: { id, name, color, world, text, ts }
    if (url.pathname === '/chat' && request.method === 'POST') {
      let body: any
      try { body = await request.json() } catch { return new Response('bad json', { status: 400, headers: cors }) }
      if (!body || typeof body.id !== 'string' || typeof body.text !== 'string') {
        return new Response('missing fields', { status: 400, headers: cors })
      }
      if (body.text.length > 240) body.text = body.text.slice(0, 240)
      body.kind = 'chat'
      body.ts = Date.now()
      this.chatRing.push(body)
      if (this.chatRing.length > CHAT_RING_MAX) this.chatRing.shift()
      this.persistChat().catch(() => {})
      const world = (body.world || body.worldId) as string | undefined
      this.broadcast(null, body, { world })
      return Response.json({ ok: true, ts: body.ts }, { headers: cors })
    }

    // POST /leave   body: { id }
    if (url.pathname === '/leave' && request.method === 'POST') {
      let body: any
      try { body = await request.json() } catch { return new Response('bad json', { status: 400, headers: cors }) }
      if (!body || typeof body.id !== 'string') return new Response('missing id', { status: 400, headers: cors })
      const prior = this.presence.get(body.id)
      const world = (prior?.world || prior?.worldId) as string | undefined
      this.presence.delete(body.id)
      this.broadcast(null, { kind: 'leave', id: body.id }, { world })
      this.maybeBroadcastCount()
      this.persistPresence().catch(() => {})
      return Response.json({ ok: true }, { headers: cors })
    }

    if (url.pathname === '/playground') {
      const upgradeHeader = request.headers.get('Upgrade')
      if (upgradeHeader !== 'websocket') {
        return new Response('expected websocket', { status: 426, headers: cors })
      }
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]
      // KEY CHANGE: state.acceptWebSocket allows the DO to hibernate without
      // killing the WS. Messages route to webSocketMessage() below.
      this.state.acceptWebSocket(server)
      this.attach(server)
      await this.scheduleAlarm()

      // Send initial bootstrap (hello + count + presence snapshot + chat ring).
      try {
        server.send(JSON.stringify({ kind: 'hello', server: 'hermes.playground.cf-worker.v2-hibernation', ts: Date.now() }))
        server.send(this.countMessage())
        for (const p of this.presence.values()) {
          try { server.send(JSON.stringify(p)) } catch {}
        }
        for (const c of this.chatRing) {
          try { server.send(JSON.stringify(c)) } catch {}
        }
      } catch {}

      return new Response(null, { status: 101, webSocket: client })
    }

    return new Response('not found', { status: 404, headers: cors })
  }

  // ───── Hibernation event handlers ─────
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const meta = this.attach(socket)
    if (!this.spend(meta)) {
      this.saveAttach(socket, meta)
      return
    }
    let msg: any
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    } catch {
      this.saveAttach(socket, meta)
      return
    }
    if (!msg || typeof msg.kind !== 'string') {
      this.saveAttach(socket, meta)
      return
    }

    if (msg.kind === 'presence' && typeof msg.id === 'string') {
      const now = Date.now()
      if (now - meta.lastPresenceTs < PRESENCE_DEDUPE_MS) {
        this.saveAttach(socket, meta)
        return
      }
      meta.lastPresenceTs = now
      const world = (msg.world || msg.worldId) as string | undefined
      meta.playerId = msg.id
      meta.world = world
      this.saveAttach(socket, meta)
      const wire: PresenceMsg & { ts: number } = { ...msg, ts: now }
      const wasNew = !this.presence.has(msg.id)
      this.presence.set(msg.id, wire)
      if (wasNew) {
        await this.bumpPeak()
        this.maybeBroadcastCount()
      }
      // Persist periodically (every ~5 presence updates per id is enough).
      // We keep this synchronous-ish for correctness on hibernation.
      await this.persistPresence()
      this.broadcast(socket, wire, { world })
    } else if (msg.kind === 'chat' && typeof msg.id === 'string') {
      if (typeof msg.text === 'string' && msg.text.length > 240) {
        msg.text = msg.text.slice(0, 240)
      }
      this.chatRing.push(msg)
      if (this.chatRing.length > CHAT_RING_MAX) this.chatRing.shift()
      await this.persistChat()
      const world = (msg.world || msg.worldId) as string | undefined
      this.broadcast(socket, msg, { world })
      this.saveAttach(socket, meta)
    } else if (msg.kind === 'leave' && typeof msg.id === 'string') {
      const prior = this.presence.get(msg.id)
      const world = (prior?.world || prior?.worldId) as string | undefined
      this.presence.delete(msg.id)
      await this.persistPresence()
      this.broadcast(socket, msg, { world })
      this.maybeBroadcastCount()
      this.saveAttach(socket, meta)
    } else {
      this.saveAttach(socket, meta)
    }
  }

  async webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    // Hibernation API closes don't necessarily mean the user left — they could
    // be the DO hibernating mid-session. Just age the presence; the alarm prune
    // will clean it up after STALE_AFTER_MS if no reconnect happens.
    const meta = socket.deserializeAttachment() as SocketAttach | undefined
    if (meta?.playerId && this.presence.has(meta.playerId)) {
      const cur = this.presence.get(meta.playerId)
      if (cur) {
        ;(cur as any).ts = Date.now() - (STALE_AFTER_MS / 2)
        this.presence.set(meta.playerId, cur)
        await this.persistPresence()
      }
    }
  }

  async webSocketError(socket: WebSocket, _err: unknown) {
    // Same treatment as close — let prune handle the actual disappearance.
    return this.webSocketClose(socket, 0, '', false)
  }
}
