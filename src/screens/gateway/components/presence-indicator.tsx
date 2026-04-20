import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type PresenceUser = {
  id: string
  name: string
  color: string
  tab: string
  lastSeen: number
  cursor?: { x: number; y: number }
}

const PRESENCE_COLORS = [
  '#f43f5e', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b',
  '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#ef4444',
]

const STALE_THRESHOLD = 30000 // 30s without heartbeat = gone

// ── Presence State (localStorage broadcast channel) ───────────────────────────

function getPresenceId(): string {
  let id = sessionStorage.getItem('presence-id')
  if (!id) {
    id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    sessionStorage.setItem('presence-id', id)
  }
  return id
}

function getPresenceName(): string {
  // Try to get a user-friendly name
  return localStorage.getItem('clawsuite-username') || 'You'
}

function getPresenceColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PresenceIndicator({ currentTab }: { currentTab: string }) {
  const [peers, setPeers] = useState<PresenceUser[]>([])
  const myId = useRef(getPresenceId())
  const channelRef = useRef<BroadcastChannel | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const broadcastPresence = useCallback(() => {
    channelRef.current?.postMessage({
      type: 'presence',
      user: {
        id: myId.current,
        name: getPresenceName(),
        color: getPresenceColor(myId.current),
        tab: currentTab,
        lastSeen: Date.now(),
      },
    })
  }, [currentTab])

  useEffect(() => {
    // BroadcastChannel for cross-tab communication
    try {
      const channel = new BroadcastChannel('clawsuite-presence')
      channelRef.current = channel

      channel.onmessage = (event) => {
        const data = event.data as { type: string; user?: PresenceUser }
        if (data.type === 'presence' && data.user && data.user.id !== myId.current) {
          setPeers((prev) => {
            const without = prev.filter((p) => p.id !== data.user!.id)
            return [...without, data.user!]
          })
        }
        if (data.type === 'leave') {
          const userId = (event.data as { userId?: string }).userId
          if (userId) {
            setPeers((prev) => prev.filter((p) => p.id !== userId))
          }
        }
      }

      // Announce self
      broadcastPresence()

      // Heartbeat every 5s
      heartbeatRef.current = setInterval(broadcastPresence, 5000)

      // Cleanup stale peers every 10s
      const cleanupInterval = setInterval(() => {
        setPeers((prev) => prev.filter((p) => Date.now() - p.lastSeen < STALE_THRESHOLD))
      }, 10000)

      return () => {
        channel.postMessage({ type: 'leave', userId: myId.current })
        channel.close()
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        clearInterval(cleanupInterval)
      }
    } catch {
      // BroadcastChannel not supported — silently fail
      return
    }
  }, [broadcastPresence])

  // Re-broadcast when tab changes
  useEffect(() => {
    broadcastPresence()
  }, [currentTab, broadcastPresence])

  if (peers.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      {/* Peer avatars */}
      <div className="flex -space-x-1.5">
        {peers.slice(0, 5).map((peer) => (
          <div
            key={peer.id}
            className="relative flex size-6 items-center justify-center rounded-full border-2 border-white dark:border-slate-900 text-[9px] font-bold text-white shadow-sm"
            style={{ backgroundColor: peer.color }}
            title={`${peer.name} — viewing ${peer.tab}`}
          >
            {peer.name.charAt(0).toUpperCase()}
            {/* Viewing indicator dot */}
            <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-white dark:border-slate-900 bg-emerald-400" />
          </div>
        ))}
        {peers.length > 5 && (
          <div className="flex size-6 items-center justify-center rounded-full border-2 border-white dark:border-slate-900 bg-neutral-300 dark:bg-neutral-700 text-[9px] font-bold text-neutral-600 dark:text-neutral-300">
            +{peers.length - 5}
          </div>
        )}
      </div>

      {/* Label */}
      <span className={cn(
        'text-[10px] text-neutral-500 dark:text-neutral-400',
        peers.length > 0 && 'hidden sm:inline',
      )}>
        {peers.length === 1
          ? `${peers[0].name} is here`
          : `${peers.length} others online`}
      </span>
    </div>
  )
}
