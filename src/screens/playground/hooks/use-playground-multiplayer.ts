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
const KEEPALIVE_MS = 1500 // force a packet at least this often even if static
const STALE_AFTER_MS = 5000 // matches server prune
const POS_EPSILON = 0.04 // skip-send if both deltas under this
const YAW_EPSILON = 0.025 // ~1.4°
const RENDER_POS_EPSILON = 0.03 // suppress re-render for ultra-small jitters

let _selfId: string | null = null
function getSelfId() {
  if (_selfId) return _selfId
  if (typeof window !== 'undefined') {
    const k = 'hermes.playground.selfId'
    let v = window.localStorage.getItem(k)
    if (!v) {
      v = `p_${Math.random().toString(36).slice(2, 10)}`
      window.localStorage.setItem(k, v)
    }
    _selfId = v
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
          // tiny delta — keep ts fresh but skip render
          return { ...prev, [msg.id]: { ...cur, ts: msg.ts } }
        }
      }
      return { ...prev, [msg.id]: msg }
    })
  }, [])

  // Open WebSocket transport (optional, controlled by VITE_PLAYGROUND_WS_URL)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = (import.meta as any).env?.VITE_PLAYGROUND_WS_URL as string | undefined
    if (!url) return
    let ws: WebSocket | null = null
    let stop = false
    let retry = 0
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
          setRemotePlayers((prev) => { const { [msg.id]: _, ...rest } = prev; return rest })
        } else if (msg.kind === 'chat' && msg.id !== selfId) {
          onChatRef.current?.(msg as ChatWire)
        }
      })
      ws.addEventListener('close', () => {
        wsOpenRef.current = false
        wsRef.current = null
        setTransport((t) => (t === 'both' ? 'broadcast' : t === 'ws' ? 'offline' : t))
        if (!stop) {
          retry = Math.min(8, retry + 1)
          window.setTimeout(open, retry * 500)
        }
      })
      ws.addEventListener('error', () => { try { ws?.close() } catch {} })
    }
    open()
    return () => {
      stop = true
      try { ws?.close() } catch {}
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
    try { channelRef.current?.postMessage(wire) } catch {}
    if (wsOpenRef.current && wsRef.current) {
      try { wsRef.current.send(JSON.stringify(wire)) } catch {}
    }
  }, [selfId, myName, myColor, world])

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
