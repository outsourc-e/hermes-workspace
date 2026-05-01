'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowUp02Icon,
  Cancel01Icon,
  Loading03Icon,
  Settings02Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

type RemoteName = 'origin' | 'upstream'
type UpdatePhase = 'idle' | 'updating' | 'done' | 'error'

type RemoteStatus = {
  name: RemoteName
  label: string
  remoteHead: string | null
  currentHead: string | null
  updateAvailable: boolean
  error: string | null
}

type UpdateStatus = {
  ok: boolean
  app: {
    version: string
    branch: string | null
    currentHead: string | null
    dirty: boolean
  }
  remotes: Array<RemoteStatus>
  updateAvailable: boolean
}

type UpdateResult = {
  ok: boolean
  updated?: Array<RemoteName>
  skipped?: Array<{ name: RemoteName; reason: string }>
  restartRequired?: boolean
  error?: string
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000
const DISMISS_KEY = 'hermes-update-dismissed-heads'
const AUTO_UPDATE_KEY = 'hermes-workspace-auto-update'

function shortSha(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : 'unknown'
}

function headsKey(remotes: Array<RemoteStatus>): string {
  return remotes
    .filter((remote) => remote.updateAvailable)
    .map((remote) => `${remote.name}:${remote.remoteHead ?? 'unknown'}`)
    .sort()
    .join('|')
}

export function HermesUpdateNotifier() {
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [autoUpdate, setAutoUpdate] = useState(false)
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissed(localStorage.getItem(DISMISS_KEY))
    setAutoUpdate(localStorage.getItem(AUTO_UPDATE_KEY) === 'true')
  }, [])

  const { data } = useQuery({
    queryKey: ['hermes-update-check'],
    queryFn: async () => {
      const res = await fetch('/api/claude-update')
      if (!res.ok) return null
      return res.json() as Promise<UpdateStatus>
    },
    refetchInterval: CHECK_INTERVAL_MS,
    staleTime: CHECK_INTERVAL_MS,
    retry: false,
  })

  const updateHeadsKey = useMemo(
    () => headsKey(data?.remotes ?? []),
    [data?.remotes],
  )
  const updateRemotes = data?.remotes.filter((remote) => remote.updateAvailable) ?? []
  const target = updateRemotes.length > 1 ? 'all' : updateRemotes[0]?.name ?? 'origin'
  const visible = Boolean(data?.updateAvailable && updateHeadsKey && dismissed !== updateHeadsKey && phase !== 'done')
  const isUpdating = phase === 'updating'

  useEffect(() => {
    if (!autoUpdate || !data?.updateAvailable || !visible || phase !== 'idle') return
    if (data.app.dirty) return
    void handleUpdate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpdate, data?.updateAvailable, data?.app.dirty, visible, phase])

  function handleDismiss() {
    if (!updateHeadsKey) return
    localStorage.setItem(DISMISS_KEY, updateHeadsKey)
    setDismissed(updateHeadsKey)
  }

  function toggleAutoUpdate() {
    const next = !autoUpdate
    setAutoUpdate(next)
    localStorage.setItem(AUTO_UPDATE_KEY, String(next))
  }

  async function handleUpdate() {
    setPhase('updating')
    setErrorMsg('')
    setProgress(10)

    const progressTimer = window.setInterval(() => {
      setProgress((value) => Math.min(value + 3, 88))
    }, 400)

    try {
      const res = await fetch('/api/claude-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      })
      const result = (await res.json()) as UpdateResult
      window.clearInterval(progressTimer)

      if (!res.ok || !result.ok) {
        setPhase('error')
        setProgress(0)
        setErrorMsg(result.error || 'Update failed')
        return
      }

      setProgress(100)
      setPhase('done')
      if (updateHeadsKey) {
        localStorage.setItem(DISMISS_KEY, updateHeadsKey)
        setDismissed(updateHeadsKey)
      }
      await queryClient.invalidateQueries({ queryKey: ['hermes-update-check'] })
      toast(
        result.restartRequired
          ? 'Hermes update installed. Restart the Workspace process to run the new code.'
          : 'Hermes is already up to date.',
        { type: 'success', duration: 7000 },
      )
    } catch (err) {
      window.clearInterval(progressTimer)
      setPhase('error')
      setProgress(0)
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <AnimatePresence>
      {visible && data ? (
        <motion.div
          initial={{ opacity: 0, y: -40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.96 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className={cn(
            'fixed left-1/2 top-[calc(var(--titlebar-h,0px)+1rem)] z-[9998] w-[92vw] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl',
            'border border-primary-800/70 bg-primary-950 text-white shadow-2xl shadow-black/40',
          )}
        >
          {isUpdating ? (
            <motion.div
              className="h-0.5 origin-left bg-accent-500"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: progress / 100 }}
              transition={{ duration: 0.25 }}
            />
          ) : null}
          {phase === 'done' ? <div className="h-0.5 bg-green-500" /> : null}

          <div className="flex items-center gap-3 px-5 py-3.5">
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl',
                phase === 'error' ? 'bg-red-500/20' : phase === 'done' ? 'bg-green-500/20' : 'bg-accent-500/20',
              )}
            >
              {isUpdating ? (
                <HugeiconsIcon icon={Loading03Icon} size={18} strokeWidth={2} className="animate-spin text-accent-300" />
              ) : phase === 'done' ? (
                <HugeiconsIcon icon={Tick01Icon} size={18} strokeWidth={2} className="text-green-400" />
              ) : (
                <HugeiconsIcon icon={ArrowUp02Icon} size={18} strokeWidth={2} className="text-accent-300" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {phase === 'updating'
                  ? 'Updating Hermes...'
                  : phase === 'error'
                    ? 'Hermes update failed'
                    : 'Hermes update available'}
              </p>
              <p className="truncate text-xs text-primary-400">
                {phase === 'error'
                  ? errorMsg
                  : data.app.dirty
                    ? 'Local changes detected. Commit or stash before updating.'
                    : updateRemotes
                        .map((remote) => `${remote.label}: ${shortSha(remote.currentHead)} → ${shortSha(remote.remoteHead)}`)
                        .join(' · ')}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {(phase === 'idle' || phase === 'error') && !data.app.dirty ? (
                <button
                  type="button"
                  onClick={handleUpdate}
                  className="rounded-lg bg-accent-500 px-4 py-1.5 text-xs font-semibold text-primary-950 transition-colors hover:bg-accent-400"
                >
                  {phase === 'error' ? 'Retry' : 'Install'}
                </button>
              ) : null}
              {!isUpdating ? (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-full p-1 text-primary-500 transition-colors hover:text-primary-300"
                  aria-label="Dismiss"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
                </button>
              ) : null}
            </div>
          </div>

          {(phase === 'idle' || phase === 'error') ? (
            <div className="flex items-center justify-between border-t border-primary-800/60 px-5 py-2.5">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Settings02Icon} size={14} strokeWidth={2} className="text-primary-500" />
                <span className="text-xs text-primary-400">Auto-update Hermes when clean</span>
              </div>
              <button
                type="button"
                onClick={toggleAutoUpdate}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
                  autoUpdate ? 'bg-accent-500' : 'bg-primary-700',
                )}
                role="switch"
                aria-checked={autoUpdate}
              >
                <span
                  className={cn(
                    'pointer-events-none mt-0.5 inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                    autoUpdate ? 'translate-x-[17px]' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
