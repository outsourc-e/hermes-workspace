/**
 * useAgoraRoom — local mock room state for v0.0.
 *
 * - Owns self position + facing
 * - Owns mock other-user list with gentle ambient drift
 * - Handles WASD/arrow movement (desktop)
 * - Owns chat messages + speech-bubble TTL
 *
 * Replaced by real WebSocket sync in v0.1.
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
import { buildMockAgoraUsers, driftUser } from '../lib/agora-mock'

const MOVE_SPEED_PX = 6
const BUBBLE_TTL_MS = 7000
const MAX_BUBBLES = 80
const PROXIMITY_PX = 220

interface UseAgoraRoomOpts {
  profile: AgoraProfile
  world?: AgoraWorld
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

  const [others, setOthers] = useState<AgoraUser[]>(() =>
    buildMockAgoraUsers({ worldWidth: world.width, worldHeight: world.height }),
  )

  const [messages, setMessages] = useState<AgoraMessage[]>([])

  // Sync self.profile when external profile changes (e.g. avatar swap).
  useEffect(() => {
    setSelf((prev) => ({ ...prev, profile }))
  }, [profile])

  // ── Movement (WASD / arrows) ───────────────────────────────
  const keysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
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

  // Movement tick
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 16.67 // normalized to ~60fps
      last = now
      const keys = keysRef.current
      let dx = 0
      let dy = 0
      if (keys.has('w') || keys.has('arrowup')) dy -= 1
      if (keys.has('s') || keys.has('arrowdown')) dy += 1
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1
      if (keys.has('d') || keys.has('arrowright')) dx += 1
      if (dx !== 0 || dy !== 0) {
        // normalize diagonal
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

  // ── Ambient drift for fake users ──────────────────────────
  useEffect(() => {
    const id = window.setInterval(() => {
      setOthers((prev) =>
        prev.map((u) =>
          Math.random() < 0.5
            ? driftUser(u, { worldWidth: world.width, worldHeight: world.height })
            : { ...u, isMoving: false },
        ),
      )
    }, 1100)
    return () => window.clearInterval(id)
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
      const msg: AgoraMessage = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        userId: profile.id,
        body: trimmed,
        createdAt: Date.now(),
      }
      setMessages((prev) => {
        const next = [...prev, msg]
        return next.length > MAX_BUBBLES ? next.slice(-MAX_BUBBLES) : next
      })
    },
    [profile.id],
  )

  // Random fake-user chatter for demo flavor (~every 12-25s)
  useEffect(() => {
    const lines = [
      'gm builders',
      'shipped a fix to the Agora protocol',
      'who wants to pair on skill packaging?',
      'trying out the new Codex spark model',
      'wow this lobby actually works',
      'brb building',
      'anyone testing the voice POC?',
      'where do I drop bug reports',
      'love the Greek pantheon',
      'just installed Hermes Workspace, hi everyone',
    ]
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      if (others.length === 0) return
      const speaker = others[Math.floor(Math.random() * others.length)]
      const line = lines[Math.floor(Math.random() * lines.length)]
      setMessages((prev) => {
        const next: AgoraMessage[] = [
          ...prev,
          {
            id:
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`,
            userId: speaker.profile.id,
            body: line,
            createdAt: Date.now(),
          },
        ]
        return next.length > MAX_BUBBLES ? next.slice(-MAX_BUBBLES) : next
      })
      window.setTimeout(tick, 12000 + Math.random() * 13000)
    }
    const initial = window.setTimeout(tick, 4000)
    return () => {
      cancelled = true
      window.clearTimeout(initial)
    }
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived: active speech bubbles per user ────────────────
  const activeBubbles = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, AgoraMessage>()
    for (const msg of messages) {
      if (now - msg.createdAt < BUBBLE_TTL_MS) {
        map.set(msg.userId, msg) // last msg per user wins
      }
    }
    return map
  }, [messages])

  // Force re-render every second so bubbles expire smoothly
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // ── Proximity: who is "near me" ────────────────────────────
  const nearbyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const o of others) {
      if (Math.hypot(o.x - self.x, o.y - self.y) < PROXIMITY_PX) ids.add(o.profile.id)
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
  }
}
