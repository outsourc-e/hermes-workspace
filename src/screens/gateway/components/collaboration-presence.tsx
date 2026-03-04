import { useEffect, useMemo, useRef, useState } from 'react'

type PresenceHeartbeat = {
  type: 'heartbeat'
  userId: string
  color: string
  name: 'User'
  timestamp: number
}

type PresenceLeave = {
  type: 'leave'
  userId: string
  timestamp: number
}

type PresenceMessage = PresenceHeartbeat | PresenceLeave

const CHANNEL_NAME = 'clawsuite-presence'
const LOCAL_STORAGE_KEY = 'clawsuite:presence:users'
const SESSION_USER_ID_KEY = 'clawsuite:presence:user-id'
const SESSION_COLOR_KEY = 'clawsuite:presence:color'
const HEARTBEAT_INTERVAL_MS = 3000
const STALE_AFTER_MS = 10000

function generateUserId(): string {
  return `user-${Math.random().toString(36).slice(2, 10)}`
}

function generateColor(): string {
  const hue = Math.floor(Math.random() * 360)
  return `hsl(${hue} 72% 52%)`
}

function readStoredUsers(): Record<string, PresenceHeartbeat> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, PresenceHeartbeat>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistUsers(users: Record<string, PresenceHeartbeat>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(users))
}

function pruneStaleUsers(users: Record<string, PresenceHeartbeat>, now: number): Record<string, PresenceHeartbeat> {
  const next: Record<string, PresenceHeartbeat> = {}
  for (const [id, user] of Object.entries(users)) {
    if (now - user.timestamp <= STALE_AFTER_MS) next[id] = user
  }
  return next
}

function getOrCreateIdentity() {
  if (typeof window === 'undefined') {
    return { userId: 'user-ssr', color: 'hsl(40 72% 52%)' }
  }
  let userId = window.sessionStorage.getItem(SESSION_USER_ID_KEY)
  if (!userId) {
    userId = generateUserId()
    window.sessionStorage.setItem(SESSION_USER_ID_KEY, userId)
  }

  let color = window.sessionStorage.getItem(SESSION_COLOR_KEY)
  if (!color) {
    color = generateColor()
    window.sessionStorage.setItem(SESSION_COLOR_KEY, color)
  }

  return { userId, color }
}

export function CollaborationPresence() {
  const identityRef = useRef(getOrCreateIdentity())
  const channelRef = useRef<BroadcastChannel | null>(null)
  const [usersById, setUsersById] = useState<Record<string, PresenceHeartbeat>>({})

  useEffect(() => {
    const syncFromStorage = () => {
      const pruned = pruneStaleUsers(readStoredUsers(), Date.now())
      setUsersById(pruned)
      persistUsers(pruned)
    }

    const upsertHeartbeat = (heartbeat: PresenceHeartbeat) => {
      setUsersById((prev) => {
        const next = pruneStaleUsers({ ...prev, [heartbeat.userId]: heartbeat }, Date.now())
        const merged = pruneStaleUsers({ ...readStoredUsers(), ...next }, Date.now())
        persistUsers(merged)
        return next
      })
    }

    const removeUser = (userId: string) => {
      setUsersById((prev) => {
        const next = { ...prev }
        delete next[userId]
        const merged = pruneStaleUsers({ ...readStoredUsers(), ...next }, Date.now())
        delete merged[userId]
        persistUsers(merged)
        return next
      })
    }

    const sendHeartbeat = () => {
      const heartbeat: PresenceHeartbeat = {
        type: 'heartbeat',
        userId: identityRef.current.userId,
        color: identityRef.current.color,
        name: 'User',
        timestamp: Date.now(),
      }
      upsertHeartbeat(heartbeat)
      channelRef.current?.postMessage(heartbeat)
    }

    syncFromStorage()
    sendHeartbeat()

    try {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channelRef.current = channel
      channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
        const message = event.data
        if (!message || typeof message !== 'object') return
        if (message.type === 'heartbeat') upsertHeartbeat(message)
        if (message.type === 'leave') removeUser(message.userId)
      }
    } catch {
      channelRef.current = null
    }

    const storageHandler = (event: StorageEvent) => {
      if (event.key !== LOCAL_STORAGE_KEY) return
      syncFromStorage()
    }
    window.addEventListener('storage', storageHandler)

    const heartbeatInterval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    const cleanupInterval = window.setInterval(syncFromStorage, HEARTBEAT_INTERVAL_MS)

    return () => {
      window.removeEventListener('storage', storageHandler)
      window.clearInterval(heartbeatInterval)
      window.clearInterval(cleanupInterval)

      const leaveMessage: PresenceLeave = {
        type: 'leave',
        userId: identityRef.current.userId,
        timestamp: Date.now(),
      }
      channelRef.current?.postMessage(leaveMessage)
      channelRef.current?.close()
      channelRef.current = null

      const stored = readStoredUsers()
      delete stored[identityRef.current.userId]
      persistUsers(pruneStaleUsers(stored, Date.now()))
    }
  }, [])

  const users = useMemo(() => {
    const now = Date.now()
    return Object.values(usersById)
      .filter((user) => now - user.timestamp <= STALE_AFTER_MS)
      .sort((a, b) => {
        if (a.userId === identityRef.current.userId) return -1
        if (b.userId === identityRef.current.userId) return 1
        return b.timestamp - a.timestamp
      })
  }, [usersById])

  const shownUsers = users.slice(0, 5)
  const overflowCount = Math.max(users.length - shownUsers.length, 0)
  const isSolo = users.length <= 1

  if (isSolo) return null

  return (
    <div className="flex items-center gap-2 rounded-full border border-primary-800/80 bg-primary-900/80 px-2.5 py-1 text-[10px] text-primary-300 shadow-sm backdrop-blur">
      <div className="flex -space-x-1">
        {shownUsers.map((user) => {
          const isSelf = user.userId === identityRef.current.userId
          const label = isSelf ? `${user.name} (You)` : user.name
          return (
            <div
              key={user.userId}
              className="flex size-5 items-center justify-center rounded-full border border-primary-900 text-[9px] font-semibold text-primary-100"
              style={{ backgroundColor: user.color }}
              title={label}
            >
              {isSelf ? 'Y' : 'U'}
            </div>
          )
        })}
      </div>
      {overflowCount > 0 ? <span className="text-primary-400">+{overflowCount} more</span> : null}
      <span className="hidden sm:inline text-primary-300">{isSolo ? 'Only you' : `${users.length} viewing`}</span>
    </div>
  )
}
