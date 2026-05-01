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

type ReleaseNoteSection = {
  name: RemoteName
  label: string
  from: string | null
  to: string | null
  commits: Array<string>
}

type StoredReleaseNotes = {
  id: string
  updatedAt: number
  sections: Array<ReleaseNoteSection>
}

type UpdateResult = {
  ok: boolean
  updated?: Array<RemoteName>
  skipped?: Array<{ name: RemoteName; reason: string }>
  restartRequired?: boolean
  releaseNotes?: Array<ReleaseNoteSection>
  error?: string
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000
const DISMISS_KEY = 'hermes-update-dismissed-heads'
const AUTO_UPDATE_KEY = 'hermes-workspace-auto-update'
const RELEASE_NOTES_KEY = 'hermes-update-release-notes'
const RELEASE_NOTES_SEEN_KEY = 'hermes-update-release-notes-seen'

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

function releaseNotesId(sections: Array<ReleaseNoteSection>): string {
  return sections
    .map(
      (section) =>
        `${section.name}:${section.from ?? 'unknown'}:${section.to ?? 'unknown'}`,
    )
    .sort()
    .join('|')
}

function readStoredReleaseNotes(): StoredReleaseNotes | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(RELEASE_NOTES_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredReleaseNotes
    if (!parsed?.id || !Array.isArray(parsed.sections)) return null
    if (localStorage.getItem(RELEASE_NOTES_SEEN_KEY) === parsed.id) return null
    return parsed
  } catch {
    return null
  }
}

function storeReleaseNotes(
  sections: Array<ReleaseNoteSection>,
): StoredReleaseNotes | null {
  if (typeof window === 'undefined' || sections.length === 0) return null
  const notes: StoredReleaseNotes = {
    id: releaseNotesId(sections),
    updatedAt: Date.now(),
    sections,
  }
  localStorage.setItem(RELEASE_NOTES_KEY, JSON.stringify(notes))
  localStorage.removeItem(RELEASE_NOTES_SEEN_KEY)
  return notes
}

function markReleaseNotesSeen(notes: StoredReleaseNotes): void {
  localStorage.setItem(RELEASE_NOTES_SEEN_KEY, notes.id)
}

export function HermesUpdateNotifier() {
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [autoUpdate, setAutoUpdate] = useState(false)
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState(0)
  const [releaseNotes, setReleaseNotes] = useState<StoredReleaseNotes | null>(
    null,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissed(localStorage.getItem(DISMISS_KEY))
    setAutoUpdate(localStorage.getItem(AUTO_UPDATE_KEY) === 'true')
    setReleaseNotes(readStoredReleaseNotes())
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
  const updateRemotes =
    data?.remotes.filter((remote) => remote.updateAvailable) ?? []
  const target =
    updateRemotes.length > 1 ? 'all' : (updateRemotes[0]?.name ?? 'origin')
  const visible = Boolean(
    data?.updateAvailable &&
    updateHeadsKey &&
    dismissed !== updateHeadsKey &&
    phase !== 'done',
  )
  const isUpdating = phase === 'updating'

  useEffect(() => {
    if (!autoUpdate || !data?.updateAvailable || !visible || phase !== 'idle')
      return
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
      const storedNotes = result.releaseNotes?.length
        ? storeReleaseNotes(result.releaseNotes)
        : null
      if (storedNotes) setReleaseNotes(storedNotes)
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

  function closeReleaseNotes() {
    if (releaseNotes) markReleaseNotesSeen(releaseNotes)
    setReleaseNotes(null)
  }

  return (
    <>
      <ReleaseNotesModal notes={releaseNotes} onClose={closeReleaseNotes} />
      <AnimatePresence>
        {visible && data ? (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="fixed left-1/2 top-[calc(var(--titlebar-h,0px)+1rem)] z-[9998] w-[90vw] max-w-md -translate-x-1/2 overflow-hidden rounded-2xl shadow-2xl"
            style={{
              background: 'var(--theme-card)',
              border: '1px solid var(--theme-border)',
              color: 'var(--theme-text)',
              boxShadow: 'var(--theme-shadow-3)',
            }}
          >
            {isUpdating ? (
              <motion.div
                className="h-0.5 origin-left"
                style={{ background: 'var(--theme-accent)' }}
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
                  phase === 'error'
                    ? 'bg-red-500/15'
                    : phase === 'done'
                      ? 'bg-green-500/15'
                      : '',
                )}
                style={
                  phase === 'idle' || phase === 'updating'
                    ? {
                        background:
                          'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                      }
                    : undefined
                }
              >
                {isUpdating ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={18}
                    strokeWidth={2}
                    className="animate-spin"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                ) : phase === 'done' ? (
                  <HugeiconsIcon
                    icon={Tick01Icon}
                    size={18}
                    strokeWidth={2}
                    className="text-green-400"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={ArrowUp02Icon}
                    size={18}
                    strokeWidth={2}
                    style={{ color: 'var(--theme-accent)' }}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold"
                  style={{ color: 'var(--theme-text)' }}
                >
                  {phase === 'updating'
                    ? 'Updating Hermes...'
                    : phase === 'error'
                      ? 'Hermes update failed'
                      : 'Hermes update available'}
                </p>
                <p
                  className="truncate text-xs"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  {phase === 'error'
                    ? errorMsg
                    : data.app.dirty
                      ? 'Local changes detected. Commit or stash before updating.'
                      : updateRemotes
                          .map(
                            (remote) =>
                              `${remote.label}: ${shortSha(remote.currentHead)} → ${shortSha(remote.remoteHead)}`,
                          )
                          .join(' · ')}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {(phase === 'idle' || phase === 'error') && !data.app.dirty ? (
                  <button
                    type="button"
                    onClick={handleUpdate}
                    className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: 'var(--theme-accent)' }}
                  >
                    {phase === 'error' ? 'Retry' : 'Install'}
                  </button>
                ) : null}
                {!isUpdating ? (
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="rounded-lg p-1.5 transition-colors hover:opacity-80"
                    style={{ color: 'var(--theme-muted)' }}
                    aria-label="Dismiss"
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      size={14}
                      strokeWidth={2}
                    />
                  </button>
                ) : null}
              </div>
            </div>

            {phase === 'idle' || phase === 'error' ? (
              <div
                className="flex items-center justify-between border-t px-5 py-2.5"
                style={{ borderColor: 'var(--theme-border)' }}
              >
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Settings02Icon}
                    size={14}
                    strokeWidth={2}
                    style={{ color: 'var(--theme-muted)' }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Auto-update Hermes when clean
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleAutoUpdate}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
                    autoUpdate ? '' : '',
                  )}
                  style={{
                    background: autoUpdate
                      ? 'var(--theme-accent)'
                      : 'var(--theme-card2)',
                  }}
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
    </>
  )
}

function ReleaseNotesModal({
  notes,
  onClose,
}: {
  notes: StoredReleaseNotes | null
  onClose: () => void
}) {
  if (!notes) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/45 px-4 pt-[calc(var(--titlebar-h,0px)+1.5rem)] backdrop-blur-sm sm:items-center sm:pt-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          className="w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
          style={{
            background: 'var(--theme-card)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text)',
            boxShadow: 'var(--theme-shadow-3)',
          }}
        >
          <div className="flex items-start gap-3 px-5 py-4">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background:
                  'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
              }}
            >
              <HugeiconsIcon
                icon={Tick01Icon}
                size={20}
                strokeWidth={2}
                style={{ color: 'var(--theme-accent)' }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-base font-semibold"
                style={{ color: 'var(--theme-text)' }}
              >
                Hermes updated
              </p>
              <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
                What changed in this Workspace / Agent update.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
              style={{ color: 'var(--theme-muted)' }}
              aria-label="Close release notes"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="max-h-[60vh] space-y-4 overflow-auto px-5 pb-5">
            {notes.sections.map((section) => (
              <section key={`${section.name}:${section.to ?? section.label}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    {section.label}
                  </h3>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
                    style={{
                      background: 'var(--theme-card2)',
                      color: 'var(--theme-muted)',
                    }}
                  >
                    {shortSha(section.from)} → {shortSha(section.to)}
                  </span>
                </div>
                {section.commits.length ? (
                  <ul className="space-y-1.5">
                    {section.commits.map((commit, index) => (
                      <li
                        key={`${section.name}-${index}-${commit}`}
                        className="rounded-xl px-3 py-2 text-sm"
                        style={{
                          background: 'var(--theme-card2)',
                          color: 'var(--theme-text)',
                        }}
                      >
                        {commit}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p
                    className="text-sm"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Updated to the latest available commit.
                  </p>
                )}
              </section>
            ))}
          </div>

          <div
            className="flex justify-end border-t px-5 py-3"
            style={{ borderColor: 'var(--theme-border)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--theme-accent)' }}
            >
              Continue
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
