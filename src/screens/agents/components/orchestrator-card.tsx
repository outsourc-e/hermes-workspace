import { Suspense, lazy, useState } from 'react'
import { Cancel01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AgentProgress } from '@/components/agent-view/agent-progress'
import { PixelAvatar } from '@/components/agent-swarm/pixel-avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ChatScreen = lazy(() =>
  import('@/screens/chat/chat-screen').then((m) => ({ default: m.ChatScreen })),
)

const ORCHESTRATOR_NAME_KEY = 'operations:orchestrator:name'
const DEFAULT_ORCHESTRATOR_NAME = 'Main Agent'

export function OrchestratorCard({
  totalAgents,
}: {
  totalAgents: number
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [orchestratorName, setOrchestratorName] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_ORCHESTRATOR_NAME
    return window.localStorage.getItem(ORCHESTRATOR_NAME_KEY) || DEFAULT_ORCHESTRATOR_NAME
  })
  const [draftName, setDraftName] = useState(orchestratorName)

  const openSettings = () => {
    setDraftName(orchestratorName)
    setSettingsOpen(true)
  }

  const saveSettings = () => {
    const nextName = draftName.trim() || DEFAULT_ORCHESTRATOR_NAME
    window.localStorage.setItem(ORCHESTRATOR_NAME_KEY, nextName)
    setOrchestratorName(nextName)
    setDraftName(nextName)
    setSettingsOpen(false)
  }

  return (
    <>
      <article className="flex h-[720px] min-h-[720px] flex-col rounded-[1.75rem] border border-[var(--theme-border)] border-l-4 border-l-[var(--theme-accent)] bg-[var(--theme-card)] p-4 shadow-[0_24px_80px_var(--theme-shadow)] lg:h-[800px] lg:min-h-[800px]">
        <div className="flex flex-col items-center gap-2 px-3 pt-1 text-center lg:gap-3">
          <div className="relative flex min-h-8 w-full items-center justify-center">
            <h2 className="text-base font-semibold text-[var(--theme-text)]">
              <span className="inline-flex items-center justify-center gap-2">
                <span>{orchestratorName}</span>
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full bg-emerald-500',
                    totalAgents > 0 && 'animate-pulse',
                  )}
                  aria-label="Active"
                  title="Active"
                />
              </span>
            </h2>

            <div className="absolute right-0 flex items-center">
              <button
                type="button"
                onClick={openSettings}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-text)]"
                aria-label="Orchestrator settings"
                title="Orchestrator settings"
              >
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          <div className="relative flex size-[56px] shrink-0 items-center justify-center">
            <AgentProgress
              value={82}
              status="running"
              size={56}
              strokeWidth={3}
              className="text-emerald-500"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <PixelAvatar
                size={44}
                color="#f59e0b"
                accentColor="#fbbf24"
                status="running"
              />
            </div>
          </div>

          <p className="text-sm text-[var(--theme-muted)]">
            Orchestrator · {totalAgents} agents reporting
          </p>

        </div>

        <div className="mt-3 flex min-h-0 flex-1 w-full flex-col overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
          <div className="flex-1 min-h-0 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-[var(--theme-card)] px-4 text-sm text-[var(--theme-muted)]">
                  Loading…
                </div>
              }
            >
              <div className="h-full w-full min-h-0 overflow-hidden">
                <ChatScreen
                  activeFriendlyId="main"
                  compact
                  embedded
                  isNewChat={false}
                />
              </div>
            </Suspense>
          </div>
        </div>
      </article>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_48%,transparent)] px-4 py-6 backdrop-blur-md"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-6 shadow-[0_30px_100px_var(--theme-shadow)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-accent)]">
                  <HugeiconsIcon icon={Settings01Icon} size={20} strokeWidth={1.8} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--theme-text)]">
                    Orchestrator Settings
                  </h2>
                  <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
                    Update the display name used on this card.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                aria-label="Close orchestrator settings"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
              </button>
            </div>

            <label className="mt-6 block space-y-2">
              <span className="text-sm font-medium text-[var(--theme-text)]">
                Display name
              </span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={DEFAULT_ORCHESTRATOR_NAME}
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
              />
            </label>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)}>
                Close
              </Button>
              <Button type="button" onClick={saveSettings}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
