/**
 * Playground multiplayer hook.
 *
 * v0 transport: BroadcastChannel for same-origin tabs (zero-server demo).
 * v1 transport: swap to WebSocket once server is deployed; same shape.
 *
 * Each client publishes presence: id, name, color, world, position, yaw,
 * lastChat, ts. Snapshots are merged into a remotePlayers map.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaygroundWorldId } from '../lib/playground-rpg'

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
}

type PresenceWire = RemotePlayer & { kind: 'presence' }
type ChatWire = { kind: 'chat'; id: string; name: string; color: string; world: PlaygroundWorldId; text: string; ts: number }
type LeaveWire = { kind: 'leave'; id: string }
type Wire = PresenceWire | ChatWire | LeaveWire

const CHANNEL_NAME = 'hermes.playground.v0'
const PRESENCE_INTERVAL_MS = 100
const STALE_AFTER_MS = 4000

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

export type IncomingChat = { id: string; name: string; color: string; world: PlaygroundWorldId; text: string; ts: number }

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
  const [remotePlayers, setRemotePlayers] = useState<Record<string, RemotePlayer>>({})
  const [online, setOnline] = useState(false)
  const [transport, setTransport] = useState<'broadcast' | 'ws' | 'both'>('broadcast')

  // Stable refs to avoid re-subscribing
  const onChatRef = useRef(onChat)
  useEffect(() => { onChatRef.current = onChat }, [onChat])

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
        setTransport((t) => (t === 'broadcast' ? 'both' : 'ws'))
      })
      ws.addEventListener('message', (ev) => {
        let msg: Wire | { kind: 'hello' }
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
        if (!msg || !('kind' in msg)) return
        if (msg.kind === 'hello') return
        if (msg.kind === 'presence' && msg.id !== selfId) {
          setRemotePlayers((prev) => ({ ...prev, [msg.id]: msg as RemotePlayer }))
        } else if (msg.kind === 'leave' && msg.id !== selfId) {
          setRemotePlayers((prev) => { const { [msg.id]: _, ...rest } = prev; return rest })
        } else if (msg.kind === 'chat' && msg.id !== selfId) {
          onChatRef.current?.(msg as ChatWire)
        }
      })
      ws.addEventListener('close', () => {
        wsOpenRef.current = false
        wsRef.current = null
        setTransport((t) => (t === 'both' ? 'broadcast' : t === 'ws' ? 'broadcast' : t))
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
  }, [selfId])

  // Open channel
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = ch
    setOnline(true)
    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as Wire
      if (!msg || !msg.kind) return
      if (msg.kind === 'presence') {
        if (msg.id === selfId) return
        setRemotePlayers((prev) => ({ ...prev, [msg.id]: msg as RemotePlayer }))
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
  }, [selfId])

  // Tick: broadcast presence and prune stale remotes
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tick = window.setInterval(() => {
      const ch = channelRef.current
      if (!ch) return
      const pos = positionRef.current
      if (!pos) return
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
        yaw: yawRef.current,
        ts: Date.now(),
      }
      try { ch.postMessage(wire) } catch {}
      if (wsOpenRef.current && wsRef.current) {
        try { wsRef.current.send(JSON.stringify(wire)) } catch {}
      }
      const cutoff = Date.now() - STALE_AFTER_MS
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
    const ch = channelRef.current
    if (!ch || !text.trim()) return
    const wire: ChatWire = {
      kind: 'chat',
      id: selfId,
      name: myName,
      color: myColor,
      world,
      text: text.trim().slice(0, 240),
      ts: Date.now(),
    }
    try { ch.postMessage(wire) } catch {}
    if (wsOpenRef.current && wsRef.current) {
      try { wsRef.current.send(JSON.stringify(wire)) } catch {}
    }
  }, [selfId, myName, myColor, world])

  return {
    selfId,
    myName,
    myColor,
    online,
    transport,
    remotePlayers,
    sendChat,
  }
}
