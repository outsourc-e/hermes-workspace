/**
 * useAgoraRoom — real-presence room over WebSocket (/api/agora-ws).
 *
 * - Owns self position + facing, handles WASD/arrow + tap movement locally.
 * - Connects to the presence server, broadcasts self position + chat, and
 *   applies incoming peers/moves/chat so everyone sees each other live.
 * - Owns chat messages + speech-bubble TTL.
 *
 * Degrades gracefully: if the WS can't connect (e.g. vite dev, offline) the
 * room simply shows you alone — no crash, no fake users.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_WORLD,
  type AgoraFacing,
  type AgoraMessage,
  type AgoraProfile,
  type AgoraUser,
  type AgoraWorld,
} from '../lib/agora-types'

const MOVE_SPEED_PX = 6
const BUBBLE_TTL_MS = 7000
const MAX_BUBBLES = 80
const PROXIMITY_PX = 220
const MOVE_SEND_MS = 60 // broadcast self position at most ~16/s

interface UseAgoraRoomOpts {
  profile: AgoraProfile
  world?: AgoraWorld
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

export function useAgoraRoom({
  profile,
  world = DEFAULT_WORLD,
}: UseAgoraRoomOpts) {
  const [self, setSelf] = useState<AgoraUser>(() => ({
    profile,
    x: world.spawn.x,
    y: world.spawn.y,
    facing: 'down',
    isSelf: true,
    isMoving: false,
  }))

  // Peers keyed by server connection id. Each peer's profile.id is overwritten
  // with the connection id so React keys + speech-bubble mapping stay unique
  // even if two people share the same underlying profile.
  const [others, setOthers] = useState<AgoraUser[]>([])
  const othersMapRef = useRef<Map<string, AgoraUser>>(new Map())
  const [messages, setMessages] = useState<AgoraMessage[]>([])
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const selfRef = useRef(self)
  selfRef.current = self

  const syncOthers = useCallback(() => {
    setOthers([...othersMapRef.current.values()])
  }, [])

  const peerFromServer = useCallback(
    (p: {
      id: string
      profile: AgoraProfile
      x?: number
      y?: number
      facing?: string
      isMoving?: boolean
    }): AgoraUser => ({
      profile: { ...p.profile, id: p.id },
      x: typeof p.x === 'number' ? p.x : world.spawn.x,
      y: typeof p.y === 'number' ? p.y : world.spawn.y,
      facing: (p.facing as AgoraFacing) || 'down',
      isMoving: Boolean(p.isMoving),
    }),
    [world.spawn.x, world.spawn.y],
  )

  // ── WebSocket connection ───────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    let closedByUs = false
    let retry: number | undefined

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      let ws: WebSocket
      try {
        ws = new WebSocket(`${proto}://${window.location.host}/api/agora-ws`)
      } catch {
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        const s = selfRef.current
        ws.send(
          JSON.stringify({
            type: 'hello',
            profile: s.profile,
            x: s.x,
            y: s.y,
            facing: s.facing,
          }),
        )
      }

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(ev.data as string)
        } catch {
          return
        }
        switch (msg.type) {
          case 'roster': {
            const peers = (msg.peers as Array<Parameters<typeof peerFromServer>[0]>) || []
            othersMapRef.current = new Map(
              peers.map((p) => [p.id, peerFromServer(p)]),
            )
            syncOthers()
            break
          }
          case 'join': {
            const peer = msg.peer as Parameters<typeof peerFromServer>[0]
            othersMapRef.current.set(peer.id, peerFromServer(peer))
            syncOthers()
            break
          }
          case 'leave': {
            othersMapRef.current.delete(msg.id as string)
            syncOthers()
            break
          }
          case 'move': {
            const existing = othersMapRef.current.get(msg.id as string)
            if (existing) {
              othersMapRef.current.set(msg.id as string, {
                ...existing,
                x: msg.x as number,
                y: msg.y as number,
                facing: (msg.facing as AgoraFacing) || existing.facing,
                isMoving: Boolean(msg.isMoving),
              })
              syncOthers()
            }
            break
          }
          case 'profile': {
            const existing = othersMapRef.current.get(msg.id as string)
            if (existing) {
              othersMapRef.current.set(msg.id as string, {
                ...existing,
                profile: {
                  ...(msg.profile as AgoraProfile),
                  id: msg.id as string,
                },
              })
              syncOthers()
            }
            break
          }
          case 'chat': {
            setMessages((prev) => {
              const next = [
                ...prev,
                {
                  id: newId(),
                  userId: msg.id as string,
                  body: String(msg.body || '').slice(0, 280),
                  createdAt: Date.now(),
                },
              ]
              return next.length > MAX_BUBBLES ? next.slice(-MAX_BUBBLES) : next
            })
            break
          }
        }
      }

      const onClose = () => {
        setConnected(false)
        othersMapRef.current.clear()
        syncOthers()
        if (!closedByUs) {
          retry = window.setTimeout(connect, 2500)
        }
      }
      ws.onclose = onClose
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closedByUs = true
      if (retry) window.clearTimeout(retry)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [peerFromServer, syncOthers])

  // Re-announce profile to peers when it changes (avatar swap, status, etc).
  useEffect(() => {
    setSelf((prev) => ({ ...prev, profile }))
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'profile', profile }))
    }
  }, [profile])

  // Broadcast self position on a fixed cadence while connected.
  useEffect(() => {
    const id = window.setInterval(() => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const s = selfRef.current
      ws.send(
        JSON.stringify({
          type: 'move',
          x: Math.round(s.x),
          y: Math.round(s.y),
          facing: s.facing,
          isMoving: s.isMoving,
        }),
      )
    }, MOVE_SEND_MS)
    return () => window.clearInterval(id)
  }, [])

  // ── Movement (WASD / arrows) ───────────────────────────────
  const keysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      )
        return
      const k = e.key.toLowerCase()
      if (
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
        ].includes(k)
      ) {
        keysRef.current.add(k)
        e.preventDefault()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 16.67
      last = now
      const keys = keysRef.current
      let dx = 0
      let dy = 0
      if (keys.has('w') || keys.has('arrowup')) dy -= 1
      if (keys.has('s') || keys.has('arrowdown')) dy += 1
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1
      if (keys.has('d') || keys.has('arrowright')) dx += 1
      if (dx !== 0 || dy !== 0) {
        const mag = Math.hypot(dx, dy) || 1
        const moveX = (dx / mag) * MOVE_SPEED_PX * dt
        const moveY = (dy / mag) * MOVE_SPEED_PX * dt
        let facing: AgoraFacing
        if (Math.abs(dx) > Math.abs(dy)) facing = dx > 0 ? 'right' : 'left'
        else facing = dy > 0 ? 'down' : 'up'
        setSelf((prev) => ({
          ...prev,
          x: Math.max(40, Math.min(world.width - 40, prev.x + moveX)),
          y: Math.max(40, Math.min(world.height - 40, prev.y + moveY)),
          facing,
          isMoving: true,
        }))
      } else {
        setSelf((prev) => (prev.isMoving ? { ...prev, isMoving: false } : prev))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world.width, world.height])

  // ── Tap-to-walk (mobile) ───────────────────────────────────
  const moveSelfToward = useCallback(
    (targetX: number, targetY: number) => {
      setSelf((prev) => {
        const dx = targetX - prev.x
        const dy = targetY - prev.y
        const dist = Math.hypot(dx, dy) || 1
        const step = Math.min(60, dist)
        const nx = prev.x + (dx / dist) * step
        const ny = prev.y + (dy / dist) * step
        let facing: AgoraFacing
        if (Math.abs(dx) > Math.abs(dy)) facing = dx > 0 ? 'right' : 'left'
        else facing = dy > 0 ? 'down' : 'up'
        return {
          ...prev,
          x: Math.max(40, Math.min(world.width - 40, nx)),
          y: Math.max(40, Math.min(world.height - 40, ny)),
          facing,
          isMoving: true,
        }
      })
    },
    [world.width, world.height],
  )

  // ── Chat ──────────────────────────────────────────────────
  const sendMessage = useCallback(
    (body: string) => {
      const trimmed = body.trim().slice(0, 280)
      if (!trimmed) return
      setMessages((prev) => {
        const next = [
          ...prev,
          {
            id: newId(),
            userId: profile.id,
            body: trimmed,
            createdAt: Date.now(),
          },
        ]
        return next.length > MAX_BUBBLES ? next.slice(-MAX_BUBBLES) : next
      })
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat', body: trimmed }))
      }
    },
    [profile.id],
  )

  // ── Derived: active speech bubbles per user ────────────────
  const activeBubbles = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, AgoraMessage>()
    for (const msg of messages) {
      if (now - msg.createdAt < BUBBLE_TTL_MS) {
        map.set(msg.userId, msg)
      }
    }
    return map
  }, [messages])

  // Force re-render every second so bubbles expire smoothly.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // ── Proximity: who is "near me" ────────────────────────────
  const nearbyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const o of others) {
      if (Math.hypot(o.x - self.x, o.y - self.y) < PROXIMITY_PX)
        ids.add(o.profile.id)
    }
    return ids
  }, [others, self.x, self.y])

  return {
    world,
    self,
    others,
    messages,
    activeBubbles,
    nearbyIds,
    sendMessage,
    moveSelfToward,
    connected,
  }
}
