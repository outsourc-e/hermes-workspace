import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  AiBrain03Icon,
  PlusSignIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { seedAgentPresets } from './agent-presets'
import { OperationsAgentCard } from './components/operations-agent-card'
import { OperationsAgentDetail } from './components/operations-agent-detail'
import { OperationsNewAgentModal } from './components/operations-new-agent-modal'
import { OperationsSettingsModal } from './components/operations-settings-modal'
import { useOperations } from './hooks/use-operations'
import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/button'

export const THEME_STYLE: CSSProperties = {
  ['--theme-bg' as string]: 'var(--color-surface)',
  ['--theme-card' as string]: 'var(--color-primary-50)',
  ['--theme-card2' as string]: 'var(--color-primary-100)',
  ['--theme-border' as string]: 'var(--color-primary-200)',
  ['--theme-border2' as string]: 'var(--color-primary-400)',
  ['--theme-text' as string]: 'var(--color-ink)',
  ['--theme-muted' as string]: 'var(--color-primary-700)',
  ['--theme-muted-2' as string]: 'var(--color-primary-600)',
  ['--theme-accent' as string]: 'var(--color-accent-500)',
  ['--theme-accent-strong' as string]: 'var(--color-accent-600)',
  ['--theme-accent-soft' as string]:
    'color-mix(in srgb, var(--color-accent-500) 12%, transparent)',
  ['--theme-accent-soft-strong' as string]:
    'color-mix(in srgb, var(--color-accent-500) 18%, transparent)',
  ['--theme-shadow' as string]:
    'color-mix(in srgb, var(--color-primary-950) 14%, transparent)',
  ['--theme-danger' as string]: 'var(--color-red-600, #dc2626)',
  ['--theme-danger-soft' as string]:
    'color-mix(in srgb, var(--theme-danger) 12%, transparent)',
  ['--theme-danger-soft-strong' as string]:
    'color-mix(in srgb, var(--theme-danger) 18%, transparent)',
  ['--theme-danger-border' as string]:
    'color-mix(in srgb, var(--theme-danger) 35%, white)',
  ['--theme-warning' as string]: 'var(--color-amber-600, #d97706)',
  ['--theme-warning-soft' as string]:
    'color-mix(in srgb, var(--theme-warning) 12%, transparent)',
  ['--theme-warning-soft-strong' as string]:
    'color-mix(in srgb, var(--theme-warning) 18%, transparent)',
  ['--theme-warning-border' as string]:
    'color-mix(in srgb, var(--theme-warning) 35%, white)',
}

export function OperationsScreen() {
  useEffect(() => {
    seedAgentPresets()
  }, [])
  const [newAgentOpen, setNewAgentOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsAgentId, setSettingsAgentId] = useState<string | null>(null)
  const {
    agents,
    configQuery,
    sessionsQuery,
    cronJobsQuery,
    settings,
    saveSettings,
    defaultModel,
    createAgent,
    isCreatingAgent,
    saveAgent,
    isSavingAgent,
    deleteAgent,
    isDeletingAgent,
  } = useOperations()

  const isLoading =
    configQuery.isPending || sessionsQuery.isPending || cronJobsQuery.isPending
  const error =
    (configQuery.error instanceof Error && configQuery.error.message) ||
    (sessionsQuery.error instanceof Error && sessionsQuery.error.message) ||
    (cronJobsQuery.error instanceof Error && cronJobsQuery.error.message) ||
    null
  const settingsAgent =
    agents.find((agent) => agent.id === settingsAgentId) ?? null

  return (
    <main
      className="min-h-full bg-surface px-3 pb-24 pt-5 text-primary-900 md:px-5 md:pt-8"
      style={THEME_STYLE}
    >
      <section className="mx-auto w-full max-w-[1320px] space-y-4">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-accent)] shadow-sm">
              <HugeiconsIcon icon={AiBrain03Icon} size={22} strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-primary-900">
                Assistants
              </h1>
              <p className="mt-1 text-sm text-primary-600">
                Configure persistent agents and their defaults
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)]"
              onClick={() => setNewAgentOpen(true)}
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.8} />
              New Assistant
            </Button>
            <Button
              variant="secondary"
              className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
              onClick={() => setSettingsOpen(true)}
            >
              <HugeiconsIcon
                icon={Settings01Icon}
                size={16}
                strokeWidth={1.8}
              />
              Settings
            </Button>
          </div>
        </header>

        {isLoading ? (
          <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-6 py-12 text-center text-sm text-[var(--theme-muted)] shadow-[0_24px_80px_var(--theme-shadow)]">
            Loading assistants…
          </section>
        ) : error ? (
          <section className="rounded-3xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-6 py-12 text-center text-sm text-[var(--theme-text)] shadow-[0_24px_80px_var(--theme-shadow)]">
            {error}
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3 text-sm">
              <span className="text-primary-600">
                {agents.length} configured assistant
                {agents.length === 1 ? '' : 's'}
              </span>
              <span className="text-primary-500">
                {agents.filter((agent) => agent.status === 'active').length}{' '}
                active
              </span>
            </div>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent, index) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.22 }}
                >
                  <OperationsAgentCard
                    agent={agent}
                    onOpenSettings={(agentId) => setSettingsAgentId(agentId)}
                  />
                </motion.div>
              ))}
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: agents.length * 0.04, duration: 0.22 }}
                onClick={() => setNewAgentOpen(true)}
                className="flex min-h-[19rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] p-4 text-center shadow-[0_20px_60px_color-mix(in_srgb,var(--theme-shadow)_10%,transparent)] transition-colors hover:border-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft)]"
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  size={32}
                  strokeWidth={1.7}
                  className="text-[var(--theme-muted)]"
                />
                <span className="mt-3 text-sm text-[var(--theme-muted)]">
                  Add Assistant
                </span>
              </motion.button>
            </section>
          </>
        )}
      </section>

      <OperationsNewAgentModal
        open={newAgentOpen}
        defaultModel={defaultModel}
        onClose={() => setNewAgentOpen(false)}
        onCreate={createAgent}
        isSaving={isCreatingAgent}
      />

      <OperationsSettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
      />

      <OperationsAgentDetail
        open={Boolean(settingsAgent)}
        agent={settingsAgent}
        onClose={() => setSettingsAgentId(null)}
        onSave={saveAgent}
        onDelete={async (agentId) => {
          await deleteAgent(agentId)
          setSettingsAgentId((current) =>
            current === agentId ? null : current,
          )
        }}
        isSaving={isSavingAgent}
        isDeleting={isDeletingAgent}
      />
    </main>
  )
}
