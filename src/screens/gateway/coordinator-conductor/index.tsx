import { useCallback, useEffect, useState } from 'react'
import { useCoordinator } from './hooks/use-coordinator'
import { Header } from './components/header'
import { MetricsPanel } from './components/metrics-panel'
import { CreateMissionForm } from './components/create-mission-form'
import { MissionList } from './components/mission-list'
import { GraphPanel } from './components/graph-panel'
import { DetailsPanel } from './components/details-panel'
import { ShortcutHelp } from './components/shortcuts'
import { Toast } from './components/shared'
import type { SpawnResponse } from './types'

function useToasts() {
  const [toasts, setToasts] = useState<
    Array<{ id: number; message: string; kind: 'success' | 'error' }>
  >([])

  const addToast = useCallback((message: string, kind: 'success' | 'error') => {
    const id = Date.now()
    setToasts((current) => [...current, { id, message, kind }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4_000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

function useSelection() {
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(
    null,
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const selectMission = useCallback((id: string) => {
    setSelectedMissionId(id)
    setSelectedNodeId(null)
  }, [])

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id)
  }, [])

  const clearNode = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  return {
    selectedMissionId,
    selectedNodeId,
    selectMission,
    selectNode,
    clearNode,
    setSelectedMissionId,
  }
}

function useKeyboardShortcuts(invalidate: () => Promise<void>) {
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === '?' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        setShowShortcuts((current) => !current)
      }
      if (event.key === 'Escape') {
        setShowShortcuts(false)
      }
      if (event.key === 'r' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        void invalidate()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [invalidate])

  return { showShortcuts, setShowShortcuts }
}

export function CoordinatorConductorSurface() {
  const { toasts, addToast, removeToast } = useToasts()
  const {
    selectedMissionId,
    selectedNodeId,
    selectMission,
    selectNode,
    clearNode,
  } = useSelection()
  const {
    missions,
    metrics,
    snapshot,
    selectedMission,
    run,
    spawn,
    isPending,
    invalidate,
  } = useCoordinator(selectedMissionId)
  const { showShortcuts, setShowShortcuts } = useKeyboardShortcuts(invalidate)

  const handleRun = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const result = await run(body)
        addToast('Action completed', 'success')
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        addToast(message, 'error')
        throw error
      }
    },
    [run, addToast],
  )

  const handleSpawn = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const result = await spawn(body)
        addToast('Conductor mission created', 'success')
        if (result.missionId || result.jobId) {
          selectMission(result.missionId ?? result.jobId!)
        }
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        addToast(message, 'error')
        throw error
      }
    },
    [spawn, addToast, selectMission],
  )

  return (
    <main className="min-h-dvh overflow-x-hidden bg-surface pb-20 text-ink">
      <div className="mx-auto w-full max-w-[1700px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        <Header
          live={!missions.isError}
          syncing={missions.isFetching}
          onRefresh={invalidate}
        />

        <MetricsPanel metrics={metrics} />

        <CreateMissionForm
          onTemplate={handleRun}
          onSpawn={handleSpawn}
          busy={isPending}
        />

        {toasts.length > 0 ? (
          <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
            {toasts.map((toast) => (
              <button
                key={toast.id}
                onClick={() => removeToast(toast.id)}
                className="text-left"
              >
                <Toast message={toast.message} kind={toast.kind} />
              </button>
            ))}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(280px,0.32fr)_minmax(0,1fr)_minmax(340px,0.36fr)]">
          <MissionList
            missions={missions.data?.missions ?? []}
            selectedId={selectedMissionId}
            loading={missions.isLoading}
            error={
              missions.error instanceof Error ? missions.error.message : null
            }
            onSelect={selectMission}
            onRun={handleRun}
            busy={isPending}
          />

          <GraphPanel
            mission={snapshot.data?.mission ?? selectedMission ?? null}
            selectedNodeId={selectedNodeId}
            onSelectNode={selectNode}
            onRun={handleRun}
            busy={isPending}
          />

          <DetailsPanel
            snapshot={snapshot.data ?? null}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => (id ? selectNode(id) : clearNode())}
            onRun={handleRun}
            busy={isPending}
          />
        </section>
      </div>

      {showShortcuts ? (
        <ShortcutHelp onClose={() => setShowShortcuts(false)} />
      ) : null}
    </main>
  )
}
