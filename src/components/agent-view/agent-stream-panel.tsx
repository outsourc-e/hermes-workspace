import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { SteerModal } from './steer-modal'
import { killAgentSession, toggleAgentPause } from '@/lib/gateway-api'
import { toast } from '@/components/ui/toast'
import {
  fetchSessionCards,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'
import {
  buildAgentSessionCardRoute,
  resolveAgentSessionCardNavigation,
  resolveAgentSessionCardOperationBinding,
} from '@/components/agent-view/agent-session-card-navigation'

export type AgentStreamPanelProps = {
  sessionKey: string
  agentName: string
  agentColor: string
  onClose: () => void
}

const AGENT_COLOR_DOT_CLASS: Record<string, string> = {
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  cyan: 'bg-cyan-500',
  purple: 'bg-purple-500',
  violet: 'bg-violet-500',
}

function formatAgo(timestamp: number): string {
  if (!timestamp) return 'Unknown'
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000),
  )
  if (elapsedSeconds < 60) return 'Just now'
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  return `${Math.floor(elapsedHours / 24)}d ago`
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function AgentStreamPanel({
  sessionKey,
  agentName,
  agentColor,
  onClose,
}: AgentStreamPanelProps) {
  const navigate = useNavigate()
  const [steerOpen, setSteerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [pausePending, setPausePending] = useState(false)
  const [killPending, setKillPending] = useState(false)

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  const sessionCardsQuery = useQuery({
    queryKey: sessionCardQueryKeys.list(false),
    queryFn: () => fetchSessionCards(),
    retry: 1,
    staleTime: 5_000,
  })

  const chatNavigation = resolveAgentSessionCardNavigation(
    sessionCardsQuery.data,
    { sessionKey },
  )
  const cardBinding = resolveAgentSessionCardOperationBinding(
    sessionCardsQuery.data,
    chatNavigation,
  )

  const cardActivity = useMemo(() => {
    if (!chatNavigation) return null
    const parentCard = sessionCardsQuery.data?.cards.find(
      (card) => card.cardId === chatNavigation.cardId,
    )
    if (!parentCard) return null

    if (chatNavigation.inspectedChildCardId) {
      const childCard = parentCard.childNodes.find(
        (child) => child.cardId === chatNavigation.inspectedChildCardId,
      )
      if (!childCard) return null
      return {
        title: childCard.title,
        kind:
          childCard.relationshipKind === 'branch'
            ? 'Branch Card activity'
            : 'Child Card activity',
        status: formatStatus(childCard.status),
        updatedAt: childCard.updatedAt,
        continuationCount: childCard.continuationCount,
      }
    }

    return {
      title: parentCard.title,
      kind: 'Parent Card activity',
      status: null,
      updatedAt: parentCard.updatedAt,
      continuationCount: parentCard.continuationCount,
    }
  }, [chatNavigation, sessionCardsQuery.data])

  async function onPauseToggle() {
    if (pausePending || !chatNavigation) return
    setPausePending(true)
    const nextPaused = !isPaused
    try {
      await toggleAgentPause(
        chatNavigation.inspectedChildCardId
          ? {
              cardId: chatNavigation.inspectedChildCardId,
              parentCardId: chatNavigation.cardId,
            }
          : { cardId: chatNavigation.cardId },
        nextPaused,
      )
      setIsPaused(nextPaused)
      toast(`${agentName} ${nextPaused ? 'paused' : 'resumed'}`, {
        type: 'success',
      })
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to update pause state',
        { type: 'error' },
      )
    } finally {
      setPausePending(false)
      setMenuOpen(false)
    }
  }

  async function onKill() {
    if (killPending || !cardBinding) return
    setKillPending(true)
    try {
      await killAgentSession(cardBinding)
      toast(`${agentName} terminated`, { type: 'success' })
      onClose()
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Failed to terminate agent',
        { type: 'error' },
      )
    } finally {
      setKillPending(false)
      setMenuOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close live stream panel"
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      <aside className="fixed inset-x-0 bottom-0 z-50 h-[70vh] rounded-t-2xl border-t border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 md:right-0 md:bottom-0 md:left-auto md:top-[var(--titlebar-h,0px)] md:h-auto md:w-[400px] md:rounded-none md:border-t-0 md:border-l">
        <div className="flex h-full min-h-0 flex-col">
          <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700 md:hidden" />
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${AGENT_COLOR_DOT_CLASS[agentColor] ?? 'bg-neutral-400'}`}
                  />
                  <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {agentName}
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Live
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Validated Card activity
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label="Close panel"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            {cardActivity ? (
              <section
                aria-label="Card activity"
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
              >
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {cardActivity.kind}
                </p>
                <h4 className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {cardActivity.title}
                </h4>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  {cardActivity.status ? (
                    <div>
                      <dt className="text-neutral-500 dark:text-neutral-400">
                        Status
                      </dt>
                      <dd className="mt-1 font-medium text-neutral-800 dark:text-neutral-200">
                        {cardActivity.status}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-neutral-500 dark:text-neutral-400">
                      Activity
                    </dt>
                    <dd className="mt-1 font-medium text-neutral-800 dark:text-neutral-200">
                      {formatAgo(cardActivity.updatedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 dark:text-neutral-400">
                      History coverage
                    </dt>
                    <dd className="mt-1 font-medium text-neutral-800 dark:text-neutral-200">
                      {cardActivity.continuationCount}{' '}
                      {cardActivity.continuationCount === 1
                        ? 'segment'
                        : 'segments'}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : sessionCardsQuery.status === 'pending' ? (
              <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Resolving Card activity
                </h4>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Open Chat will be available after Card resolution is complete.
                </p>
              </section>
            ) : (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Card activity unavailable
                </h4>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                  This activity could not be resolved through a complete
                  validated Card projection. Open Chat is unavailable.
                </p>
              </section>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSteerOpen(true)}
                disabled={!cardBinding}
                className="rounded-lg border border-neutral-200 px-2 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Steer
              </button>
              <div className="relative">
                {menuOpen ? (
                  <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    <button
                      type="button"
                      onClick={() => void onPauseToggle()}
                      disabled={pausePending || !chatNavigation}
                      className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      {pausePending
                        ? 'Updating...'
                        : isPaused
                          ? 'Resume'
                          : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onKill()}
                      disabled={killPending || !cardBinding}
                      className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      {killPending ? 'Terminating...' : 'Kill'}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="w-full rounded-lg border border-neutral-200 px-2 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  Pause/Kill
                </button>
              </div>
              <button
                type="button"
                disabled={!chatNavigation || !cardActivity}
                onClick={() => {
                  if (!chatNavigation || !cardActivity) return
                  onClose()
                  void navigate(buildAgentSessionCardRoute(chatNavigation))
                }}
                title={
                  chatNavigation && cardActivity
                    ? undefined
                    : 'Open Chat unavailable until Card resolution is complete'
                }
                className="rounded-lg bg-accent-500 px-2 py-2 text-xs font-medium text-white hover:bg-accent-600 disabled:cursor-default disabled:opacity-50"
              >
                Open Chat
              </button>
            </div>
          </div>
        </div>
        {cardBinding ? (
          <SteerModal
            open={steerOpen}
            onOpenChange={setSteerOpen}
            agentName={agentName}
            cardBinding={cardBinding}
          />
        ) : null}
      </aside>
    </>
  )
}
