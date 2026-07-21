/**
 * Playground multiplayer hook (optimized).
 *
 * Transports (lazy/parallel):
 *   - BroadcastChannel for same-origin tabs (zero-server).
 *   - WebSocket for cross-machine (when VITE_PLAYGROUND_WS_URL set).
 *
 * Optimizations vs v0:
 *   - 5 Hz presence (was 10 Hz). Halves bandwidth, looks identical with lerp.
 *   - Skip-send when player hasn't moved/turned within an epsilon.
 *   - Avatar config sent only on change (signature compare).
 *   - World-scoped local rendering: hide remotes from other worlds.
 *   - Position-delta gate before re-render: <0.04u changes are dropped.
 *   - Server-pushed online count via `count` events (zero polling).
 *   - Connection state: 'offline' | 'broadcast' | 'ws' | 'both' for HUD.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaygroundWorldId } from '../lib/playground-rpg'
import type { AvatarConfig } from '../lib/avatar-config'
import { loadAvatarConfig } from '../lib/avatar-config'

export type RemotePlayer = {
  id: string
  name: string
  color: string
  world: PlaygroundWorldId
  interior: string | null
  x: number
  y: number
  z: number
  yaw: number
  lastChat?: string
  lastChatAt?: number
  ts: number
  avatar?: AvatarConfig
}

type PresenceWire = RemotePlayer & { kind: 'presence' }
type ChatWire = { kind: 'chat'; id: string; name: string; color: string; world: PlaygroundWorldId; text: string; ts: number }
type LeaveWire = { kind: 'leave'; id: string }
type CountWire = { kind: 'count'; online: number; byWorld?: Record<string, number>; peakToday?: number; ts: number }
type Wire = PresenceWire | ChatWire | LeaveWire | CountWire

const CHANNEL_NAME = 'hermes.playground.v0'
const PRESENCE_INTERVAL_MS = 200 // 5 Hz, was 100
const KEEPALIVE_MS = 1000 // force a packet at least this often even if static
const STALE_AFTER_MS = 30000 // very lenient locally — we hold remotes 30s before pruning to forgive aggressive bg-tab throttling. Server prune is 12s but server reconnects gracefully now.
const POS_EPSILON = 0.04 // skip-send if both deltas under this
const YAW_EPSILON = 0.025 // ~1.4°
const RENDER_POS_EPSILON = 0.03 // suppress re-render for ultra-small jitters

let _selfId: string | null = null
function getSelfId() {
  if (_selfId) return _selfId
  if (typeof window !== 'undefined') {
    // sessionStorage is per-TAB, so two tabs in the same browser get distinct
    // self-ids and never collide on the WS hub. We also fold the tab-load
    // timestamp into the id so even duplicated tabs (which share sessionStorage)
    // get unique ids per fresh load.
    const k = 'hermes.playground.selfId'
    let v: string | null = null
    try { v = window.sessionStorage.getItem(k) } catch {}
    if (!v) {
      const stamp = Date.now().toString(36)
      const rand = Math.random().toString(36).slice(2, 10)
      v = `p_${stamp}_${rand}`
      try { window.sessionStorage.setItem(k, v) } catch {}
    }
    _selfId = v
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[Hermes MP] selfId:', v, '(if two tabs see the same id, MP will collide)')
    }
    return v
  }
  return 'p_unknown'
}

const COLORS = ['#22d3ee', '#a78bfa', '#fb7185', '#34d399', '#facc15', '#f472b6', '#38bdf8', '#fbbf24']
function pickColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

function avatarSig(a: AvatarConfig | null | undefined): string {
  if (!a) return ''
  return [a.skin, a.hair, a.hairStyle, a.eyes, a.outfit, a.outfitAccent, a.cape, a.helmet, a.weapon, a.portrait].join('|')
}

export type IncomingChat = { id: string; name: string; color: string; world: PlaygroundWorldId; text: string; ts: number }

export type ConnectionState = 'offline' | 'broadcast' | 'ws' | 'both'

export function usePlaygroundMultiplayer({
  world,
  interior,
  positionRef,
  yawRef,
  name,
  onChat,
}: {
  world: PlaygroundWorldId
  interior: string | null
  positionRef: React.MutableRefObject<{ x: number; y: number; z: number } | null>
  yawRef: React.MutableRefObject<number>
  name?: string
  onChat?: (msg: IncomingChat) => void
}) {
  const selfId = useMemo(() => getSelfId(), [])
  const myColor = useMemo(() => pickColor(selfId), [selfId])
  const myName = name && name.trim().length > 0 ? name.trim() : `Builder-${selfId.slice(2, 6)}`

  const channelRef = useRef<BroadcastChannel | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const wsOpenRef = useRef(false)
  const avatarRef = useRef<AvatarConfig | null>(loadAvatarConfig())
  const lastAvatarSigRef = useRef<string>(avatarSig(avatarRef.current))
  const lastSentRef = useRef<{ x: number; y: number; z: number; yaw: number; ts: number; world: PlaygroundWorldId | null }>({
    x: NaN, y: NaN, z: NaN, yaw: NaN, ts: 0, world: null,
  })
  useEffect(() => {
    const update = () => {
      const next = loadAvatarConfig()
      avatarRef.current = next
      lastAvatarSigRef.current = '' // force resend on next tick
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('hermes-playground-avatar-changed', update)
      window.addEventListener('storage', update)
      return () => {
        window.removeEventListener('hermes-playground-avatar-changed', update)
        window.removeEventListener('storage', update)
      }
    }
  }, [])
  const [remotePlayers, setRemotePlayers] = useState<Record<string, RemotePlayer>>({})
  const [online, setOnline] = useState(false)
  const [transport, setTransport] = useState<ConnectionState>('offline')
  const [serverCount, setServerCount] = useState<{ online: number; byWorld?: Record<string, number>; peakToday?: number } | null>(null)

  // Stable refs to avoid re-subscribing
  const onChatRef = useRef(onChat)
  useEffect(() => { onChatRef.current = onChat }, [onChat])

  // Merge a presence into remotePlayers, skipping if delta is tiny.
  const mergePresence = useCallback((msg: RemotePlayer) => {
    setRemotePlayers((prev) => {
      const cur = prev[msg.id]
      if (cur) {
        const dx = Math.abs(cur.x - msg.x)
        const dz = Math.abs(cur.z - msg.z)
        const dyaw = Math.abs(cur.yaw - msg.yaw)
        const sameWorld = cur.world === msg.world
        const sameAvatar = avatarSig(cur.avatar) === avatarSig(msg.avatar)
        const noChat = (cur.lastChatAt || 0) === (msg.lastChatAt || 0)
        if (sameWorld && sameAvatar && noChat && dx < RENDER_POS_EPSILON && dz < RENDER_POS_EPSILON && dyaw < YAW_EPSILON) {
          // Tiny deltas should not repaint the world. Refresh the stale timer at most once per second.
          if (msg.ts - cur.ts < 1000) return prev
          return { ...prev, [msg.id]: { ...cur, ts: msg.ts } }
        }
      }
      return { ...prev, [msg.id]: msg }
    })
  }, [])

  // Open WebSocket transport. URL precedence:
  //   1. window.__HERMES_PLAYGROUND_WS_URL (runtime override; survives stale bundles)
  //   2. VITE_PLAYGROUND_WS_URL (build-time env)
  //   3. Hardcoded public hub fallback (so shipping the public Cloudflare hub
  //      always Just Works even if the .env didn't propagate to the dev bundle)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url =
      (window as any).__HERMES_PLAYGROUND_WS_URL ||
      ((import.meta as any).env?.VITE_PLAYGROUND_WS_URL as string | undefined) ||
      'wss://hermes-playground-ws.myaurora-agi.workers.dev/playground'
    // eslint-disable-next-line no-console
    console.log('[Hermes MP] connecting to WS:', url)
    if (!url) return
    let ws: WebSocket | null = null
    let stop = false
    let retry = 0
    let retryTimer: number | null = null
    const open = () => {
      if (stop) return
      try {
        ws = new WebSocket(url + (url.endsWith('/playground') ? '' : '/playground'))
      } catch {
        return
      }
      wsRef.current = ws
      ws.addEventListener('open', () => {
        wsOpenRef.current = true
        retry = 0
        // Force avatar resend on reconnect
        lastAvatarSigRef.current = ''
        lastSentRef.current = { x: NaN, y: NaN, z: NaN, yaw: NaN, ts: 0, world: null }
        setTransport((t) => (t === 'broadcast' ? 'both' : 'ws'))
        // Send presence immediately so the hub counts us right away
        // (otherwise we wait up to PRESENCE_INTERVAL_MS for the first tick).
        try {
          const pos = positionRef.current
          if (pos) {
            const wire: PresenceWire = {
              kind: 'presence',
              id: selfId,
              name: myName,
              color: myColor,
              world,
              interior,
              x: pos.x,
              y: pos.y,
              z: pos.z,
              yaw: yawRef.current ?? 0,
              ts: Date.now(),
              avatar: avatarRef.current || undefined,
            }
            ws?.send(JSON.stringify(wire))
            lastSentRef.current = { x: pos.x, y: pos.y, z: pos.z, yaw: yawRef.current ?? 0, ts: Date.now(), world }
            lastAvatarSigRef.current = avatarSig(avatarRef.current)
          }
        } catch {}
      })
      ws.addEventListener('message', (ev) => {
        let msg: Wire | { kind: 'hello' }
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
        if (!msg || !('kind' in msg)) return
        if (msg.kind === 'hello') return
        if (msg.kind === 'count') {
          setServerCount({ online: msg.online, byWorld: msg.byWorld, peakToday: msg.peakToday })
        } else if (msg.kind === 'presence' && msg.id !== selfId) {
          mergePresence(msg as RemotePlayer)
        } else if (msg.kind === 'leave' && msg.id !== selfId) {
          // eslint-disable-next-line no-console
          console.log('[Hermes MP] received leave for', msg.id, '— removing remote')
          setRemotePlayers((prev) => { const { [msg.id]: _, ...rest } = prev; return rest })
        } else if (msg.kind === 'chat' && msg.id !== selfId) {
          onChatRef.current?.(msg as ChatWire)
        }
      })
      ws.addEventListener('close', (ev) => {
        wsOpenRef.current = false
        wsRef.current = null
        setTransport((t) => (t === 'both' ? 'broadcast' : t === 'ws' ? 'offline' : t))
        // eslint-disable-next-line no-console
        console.log('[Hermes MP] WS close', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean })
        if (!stop) {
          retry = Math.min(8, retry + 1)
          if (retryTimer != null) window.clearTimeout(retryTimer)
          retryTimer = window.setTimeout(open, retry * 500)
        }
      })
      ws.addEventListener('error', (e) => {
        // eslint-disable-next-line no-console
        console.warn('[Hermes MP] WS error', e)
        try { ws?.close() } catch {}
      })
    }
    open()
    return () => {
      stop = true
      if (retryTimer != null) window.clearTimeout(retryTimer)
      try { ws?.close() } catch {}
      wsOpenRef.current = false
      wsRef.current = null
    }
  }, [selfId, mergePresence])

  // Open BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = ch
    setOnline(true)
    setTransport((t) => (t === 'offline' ? 'broadcast' : t))
    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as Wire
      if (!msg || !msg.kind) return
      if (msg.kind === 'presence') {
        if (msg.id === selfId) return
        mergePresence(msg as RemotePlayer)
      } else if (msg.kind === 'leave') {
        if (msg.id === selfId) return
        setRemotePlayers((prev) => {
          const { [msg.id]: _, ...rest } = prev
          return rest
        })
      } else if (msg.kind === 'chat') {
        if (msg.id === selfId) return
        onChatRef.current?.(msg)
      }
    }
    ch.addEventListener('message', onMessage)
    const onUnload = () => {
      try { ch.postMessage({ kind: 'leave', id: selfId } satisfies LeaveWire) } catch {}
      try { wsRef.current?.send(JSON.stringify({ kind: 'leave', id: selfId })) } catch {}
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      try { ch.postMessage({ kind: 'leave', id: selfId } satisfies LeaveWire) } catch {}
      ch.removeEventListener('message', onMessage)
      window.removeEventListener('beforeunload', onUnload)
      ch.close()
      channelRef.current = null
      setOnline(false)
    }
  }, [selfId, mergePresence])

  // Tick: broadcast presence (skip-when-still) and prune stale remotes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tick = window.setInterval(() => {
      const ch = channelRef.current
      const pos = positionRef.current
      if (!pos) return
      const yaw = yawRef.current
      const last = lastSentRef.current
      const now = Date.now()
      const moved = Math.abs(pos.x - last.x) >= POS_EPSILON
        || Math.abs(pos.z - last.z) >= POS_EPSILON
        || Math.abs(yaw - last.yaw) >= YAW_EPSILON
        || world !== last.world
      const stale = now - last.ts >= KEEPALIVE_MS
      const avatarNow = avatarRef.current
      const sigNow = avatarSig(avatarNow)
      const avatarChanged = sigNow !== lastAvatarSigRef.current
      if (!moved && !stale && !avatarChanged) {
        // Even when not sending, prune local stale remotes
      } else {
        const wire: PresenceWire = {
          kind: 'presence',
          id: selfId,
          name: myName,
          color: myColor,
          world,
          interior,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          yaw,
          ts: now,
          // Only attach avatar config when it changed (or on keepalive every Nth)
          avatar: avatarChanged || stale ? (avatarNow || undefined) : undefined,
        }
        try { ch?.postMessage(wire) } catch {}
        if (wsOpenRef.current && wsRef.current) {
          try { wsRef.current.send(JSON.stringify(wire)) } catch {}
        }
        lastSentRef.current = { x: pos.x, y: pos.y, z: pos.z, yaw, ts: now, world }
        if (avatarChanged) lastAvatarSigRef.current = sigNow
      }
      // Stale prune
      const cutoff = now - STALE_AFTER_MS
      setRemotePlayers((prev) => {
        let dirty = false
        const next: Record<string, RemotePlayer> = {}
        for (const [id, p] of Object.entries(prev)) {
          if (p.ts >= cutoff) next[id] = p
          else dirty = true
        }
        return dirty ? next : prev
      })
    }, PRESENCE_INTERVAL_MS)
    return () => window.clearInterval(tick)
  }, [selfId, myName, myColor, world, interior, positionRef, yawRef])

  // ───── HTTP polling transport (reliable fallback) ─────
  // WebSockets have too many failure modes (CF DO hibernation, bg-tab
  // throttling, dev bundle env issues). HTTP polling is dead simple and
  // bulletproof: every 1s we POST our presence and get back the snapshot
  // of who else is in our world + recent chats. We use this in addition to
  // (not instead of) the WS — if WS works it's lower latency, but we
  // don't depend on it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const baseUrl =
      (window as any).__HERMES_PLAYGROUND_HTTP_URL ||
      ((import.meta as any).env?.VITE_PLAYGROUND_STATS_URL as string | undefined)?.replace(/\/stats$/, '') ||
      'https://hermes-playground-ws.myaurora-agi.workers.dev'
    let stop = false
    let lastChatTs = 0
    const tick = async () => {
      if (stop) return
      const pos = positionRef.current
      if (!pos) {
        if (!stop) window.setTimeout(tick, 1000)
        return
      }
      try {
        const r = await fetch(`${baseUrl}/presence`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: selfId,
            name: myName,
            color: myColor,
            world,
            interior,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw: yawRef.current ?? 0,
            avatar: avatarRef.current || undefined,
            sinceChatTs: lastChatTs,
          }),
          keepalive: document.visibilityState === 'hidden', // helps survive bg throttle
        })
        if (!stop && r.ok) {
          const data = await r.json() as { presences: any[]; chats: any[]; online: number; byWorld: Record<string, number>; peakToday: number }
          // Merge presences
          for (const p of data.presences || []) {
            mergePresence(p as RemotePlayer)
          }
          // Replay any chat messages we haven't seen + attach them to the
          // matching remote player so a speech bubble appears over their head.
          for (const c of data.chats || []) {
            if (typeof c.ts === 'number' && c.ts > lastChatTs) lastChatTs = c.ts
            onChatRef.current?.(c as ChatWire)
            if (c.id && typeof c.text === 'string') {
              setRemotePlayers((prev) => {
                const cur = prev[c.id]
                if (!cur) return prev
                return { ...prev, [c.id]: { ...cur, lastChat: c.text, lastChatAt: c.ts || Date.now() } }
              })
            }
          }
          // Push count update
          setServerCount({ online: data.online, byWorld: data.byWorld, peakToday: data.peakToday })
          // Mark transport as live (for the chat header chip)
          setTransport((t) => (t === 'ws' || t === 'both') ? t : 'ws')
        }
      } catch (err) {
        if (!stop) {
          // eslint-disable-next-line no-console
          console.warn('[Hermes MP] presence POST failed:', err)
        }
      }
      if (!stop) window.setTimeout(tick, 1000)
    }
    tick()
    // Send a leave on tab close so others see us go away immediately
    const onUnload = () => {
      try {
        navigator.sendBeacon(`${baseUrl}/leave`, JSON.stringify({ id: selfId }))
      } catch {}
    }
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      stop = true
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      onUnload()
    }
  }, [selfId, myName, myColor, world, interior, positionRef, yawRef, mergePresence])

  // Also send chats over HTTP so they propagate even when WS is dead.
  // We override sendChat to do both.
  const httpSendChat = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const baseUrl =
      (window as any).__HERMES_PLAYGROUND_HTTP_URL ||
      ((import.meta as any).env?.VITE_PLAYGROUND_STATS_URL as string | undefined)?.replace(/\/stats$/, '') ||
      'https://hermes-playground-ws.myaurora-agi.workers.dev'
    fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: selfId, name: myName, color: myColor, world, text: trimmed.slice(0, 240), ts: Date.now() }),
    }).catch(() => {})
  }, [selfId, myName, myColor, world])

  // Immediately re-send presence when the tab becomes visible (after being
  // backgrounded). Background tabs are throttled by the browser and can stop
  // ticking long enough for the server to prune them — this prevents the
  // "player disappears for a moment after switching tabs" flicker.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisible = () => {
      if (document.hidden) return
      const pos = positionRef.current
      if (!pos) return
      // Force a fresh presence on next tick by clearing the dedupe baseline.
      lastSentRef.current = { x: NaN, y: NaN, z: NaN, yaw: NaN, ts: 0, world: null }
      // Also send immediately if WS open.
      if (wsOpenRef.current && wsRef.current) {
        try {
          const wire: PresenceWire = {
            kind: 'presence',
            id: selfId,
            name: myName,
            color: myColor,
            world,
            interior,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw: yawRef.current ?? 0,
            ts: Date.now(),
            avatar: avatarRef.current || undefined,
          }
          wsRef.current.send(JSON.stringify(wire))
          lastSentRef.current = { x: pos.x, y: pos.y, z: pos.z, yaw: yawRef.current ?? 0, ts: Date.now(), world }
        } catch {}
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [selfId, myName, myColor, world, interior, positionRef, yawRef])

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const wire: ChatWire = {
      kind: 'chat',
      id: selfId,
      name: myName,
      color: myColor,
      world,
      text: trimmed.slice(0, 240),
      ts: Date.now(),
    }
    // Best-effort fan-out across all transports.
    try { channelRef.current?.postMessage(wire) } catch {}
    if (wsOpenRef.current && wsRef.current) {
      try { wsRef.current.send(JSON.stringify(wire)) } catch {}
    }
    httpSendChat(trimmed) // HTTP polling transport — always works
  }, [selfId, myName, myColor, world, httpSendChat])

  // World-scoped remote players: never render people from other worlds.
  const visibleRemotes = useMemo(() => {
    const out: Record<string, RemotePlayer> = {}
    for (const [id, p] of Object.entries(remotePlayers)) {
      if (p.world === world) out[id] = p
    }
    return out
  }, [remotePlayers, world])

  return {
    selfId,
    myName,
    myColor,
    online,
    transport,
    remotePlayers: visibleRemotes,
    allRemotes: remotePlayers,
    serverCount,
    sendChat,
  }
}
