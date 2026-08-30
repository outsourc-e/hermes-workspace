import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SessionMeta } from '@/screens/chat/types'
import { chatQueryKeys } from '@/screens/chat/chat-queries'
import { toast } from '@/components/ui/toast'

const LEGACY_STORAGE_KEY = 'pinned-sessions'
const MIGRATION_MARKER = 'pinned-sessions-backend-migrated-v1'
let migrationStarted = false

function getStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function setStorageItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function removeStorageItem(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

export async function writeSessionPin(
  session: SessionMeta,
  pinned: boolean,
) {
  const response = await fetch('/api/sessions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionKey: session.key,
      friendlyId: session.friendlyId,
      pinned,
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    pinned?: boolean
  }
  if (!response.ok) {
    throw new Error(payload.error || `Pin update failed (${response.status})`)
  }
  if (payload.pinned !== pinned) {
    throw new Error('Hermes backend did not confirm the session pin update')
  }
}

function readLegacyPinnedKeys(): Array<string> | null {
  try {
    const raw = getStorageItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as {
      state?: { pinnedSessionKeys?: unknown }
    }
    if (!Array.isArray(parsed.state?.pinnedSessionKeys)) return null
    return parsed.state.pinnedSessionKeys.filter(
      (key): key is string => typeof key === 'string' && key.length > 0,
    )
  } catch {
    return null
  }
}

function writeLegacyPinnedKeys(keys: Array<string>) {
  if (keys.length === 0) {
    removeStorageItem(LEGACY_STORAGE_KEY)
    return
  }
  setStorageItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({ state: { pinnedSessionKeys: keys }, version: 0 }),
  )
}

export function splitPinnedSessions(sessions: Array<SessionMeta>) {
  const pinned: Array<SessionMeta> = []
  const unpinned: Array<SessionMeta> = []
  for (const session of sessions) {
    if (session.pinned) pinned.push(session)
    else unpinned.push(session)
  }
  return [pinned, unpinned] as const
}

export function planLegacyPinMigration(
  legacyKeys: Array<string>,
  sessions: Array<SessionMeta>,
) {
  const unresolved = new Set(legacyKeys)
  const candidates: Array<{ legacyKey: string; session: SessionMeta }> = []
  for (const legacyKey of legacyKeys) {
    const session = sessions.find(
      (row) => row.key === legacyKey || row.friendlyId === legacyKey,
    )
    if (!session || session.source === 'local') continue
    if (session.pinned) {
      unresolved.delete(legacyKey)
      continue
    }
    candidates.push({ legacyKey, session })
  }
  return { candidates, unresolved }
}

export function usePinnedSessions() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ session, pinned }: { session: SessionMeta; pinned: boolean }) =>
      writeSessionPin(session, pinned),
    onMutate: async ({ session, pinned }) => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.sessions })
      const previous = queryClient.getQueryData<Array<SessionMeta>>(
        chatQueryKeys.sessions,
      )
      queryClient.setQueryData<Array<SessionMeta>>(
        chatQueryKeys.sessions,
        (current = []) =>
          current.map((row) =>
            row.key === session.key || row.friendlyId === session.friendlyId
              ? { ...row, pinned }
              : row,
          ),
      )
      return { previous }
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(chatQueryKeys.sessions, context.previous)
      }
      toast(
        error instanceof Error ? error.message : 'Failed to update session pin',
        { type: 'error' },
      )
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions }),
        queryClient.invalidateQueries({ queryKey: ['command-center-sessions'] }),
      ])
    },
  })

  return {
    togglePinnedSession: (session: SessionMeta) => {
      if (session.source === 'local') return
      mutation.mutate({ session, pinned: !session.pinned })
    },
  }
}

export function usePinnedSessionMigration(sessions: Array<SessionMeta>) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (migrationStarted || sessions.length === 0) return
    if (getStorageItem(MIGRATION_MARKER) === '1') return
    migrationStarted = true

    const legacyKeys = readLegacyPinnedKeys()
    if (legacyKeys === null) return
    const { candidates, unresolved } = planLegacyPinMigration(
      legacyKeys,
      sessions,
    )
    void Promise.allSettled(
      candidates.map(({ session }) => writeSessionPin(session, true)),
    ).then(async (results) => {
      let migrated = 0
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return
        const candidate = candidates[index]
        unresolved.delete(candidate.legacyKey)
        migrated += 1
      })

      const remaining = [...unresolved]
      writeLegacyPinnedKeys(remaining)
      setStorageItem(MIGRATION_MARKER, '1')
      if (migrated > 0) {
        await queryClient.invalidateQueries({
          queryKey: chatQueryKeys.sessions,
        })
      }
    })
  }, [queryClient, sessions])
}
