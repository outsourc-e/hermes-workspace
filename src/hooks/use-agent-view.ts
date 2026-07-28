import { useEffect, useMemo, useState } from 'react'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCardChild } from '@/screens/chat/types'
import { resolveAgentSessionCardNavigation } from '@/components/agent-view/agent-session-card-navigation'

import { useMissionStore } from '@/stores/mission-store'

export type AgentModel = string

export type AgentCardNavigation = {
  cardId: string
  inspectedChildCardId: string
}

export type ActiveAgent = {
  id: string
  name: string
  task: string
  model: AgentModel
  status: string
  progress: number
  startedAtMs: number
  tokenCount: number
  estimatedCost: number
  isLive: boolean
  chatNavigation: AgentCardNavigation
}

export type QueuePriority = 'high' | 'normal' | 'low'

export type QueuedAgentTask = {
  id: string
  name: string
  description: string
  priority: QueuePriority
  chatNavigation: AgentCardNavigation
}

export type AgentHistoryStatus = 'success' | 'failed'

export type AgentHistoryItem = {
  id: string
  name: string
  description: string
  model: AgentModel
  status: AgentHistoryStatus
  runtimeSeconds: number
  tokenCount: number
  cost: number
  chatNavigation: AgentCardNavigation
}

type AgentViewState = {
  isOpen: boolean
  queueOpen: boolean
  historyOpen: boolean
  setOpen: (isOpen: boolean) => void
  toggleOpen: () => void
  setQueueOpen: (isOpen: boolean) => void
  setHistoryOpen: (isOpen: boolean) => void
}

const PANEL_WIDTH_PX = 288
const MIN_DESKTOP_WIDTH = 1024
const REFRESH_INTERVAL_MS = 5000

function inferInitialOpenState(): boolean {
  return false
}

function childActivityLabel(child: SessionCardChild): string {
  return child.relationshipKind === 'branch'
    ? 'Branch Card activity'
    : 'Child Card activity'
}

function childNavigation(
  response: SessionCardListWire,
  parentCardId: string,
  child: SessionCardChild,
): AgentCardNavigation | null {
  const target = resolveAgentSessionCardNavigation(response, {
    sessionKey: child.sessionKey,
    key: child.cardId,
  })
  if (
    !target ||
    target.cardId !== parentCardId ||
    target.inspectedChildCardId !== child.cardId
  ) {
    return null
  }
  return {
    cardId: target.cardId,
    inspectedChildCardId: target.inspectedChildCardId,
  }
}

function activeAgent(
  child: SessionCardChild,
  chatNavigation: AgentCardNavigation,
): ActiveAgent {
  return {
    id: child.cardId,
    name: child.title,
    task: childActivityLabel(child),
    model: 'Session Card',
    status: child.status,
    progress: child.status === 'running' ? 35 : 5,
    startedAtMs: child.updatedAt,
    tokenCount: 0,
    estimatedCost: 0,
    isLive: child.status === 'running',
    chatNavigation,
  }
}

function queuedAgent(
  child: SessionCardChild,
  chatNavigation: AgentCardNavigation,
): QueuedAgentTask {
  return {
    id: child.cardId,
    name: child.title,
    description: childActivityLabel(child),
    priority: 'normal',
    chatNavigation,
  }
}

function historyAgent(
  child: SessionCardChild,
  chatNavigation: AgentCardNavigation,
): AgentHistoryItem {
  return {
    id: child.cardId,
    name: child.title,
    description: childActivityLabel(child),
    model: 'Session Card',
    status: child.status === 'error' ? 'failed' : 'success',
    runtimeSeconds: 0,
    tokenCount: 0,
    cost: 0,
    chatNavigation,
  }
}

function projectCardActivities(response: SessionCardListWire): {
  activeAgents: Array<ActiveAgent>
  queuedAgents: Array<QueuedAgentTask>
  historyAgents: Array<AgentHistoryItem>
  unavailable: boolean
} {
  const activeAgents: Array<ActiveAgent> = []
  const queuedAgents: Array<QueuedAgentTask> = []
  const historyAgents: Array<AgentHistoryItem> = []
  response.cards.forEach((parentCard) => {
    parentCard.childNodes.forEach((child) => {
      // Delegated worker activity is represented only by direct child Cards.
      // Branch Cards are ordinary user conversations and do not belong here.
      if (child.relationshipKind !== 'child') return
      const navigation = childNavigation(response, parentCard.cardId, child)
      if (!navigation) {
        return
      }

      if (child.status === 'idle') {
        queuedAgents.push(queuedAgent(child, navigation))
        return
      }
      if (child.status === 'complete' || child.status === 'error') {
        historyAgents.push(historyAgent(child, navigation))
        return
      }
      activeAgents.push(activeAgent(child, navigation))
    })
  })

  const unresolvedActivityExists = response.cards.some((parentCard) =>
    parentCard.childNodes.some(
      (child) =>
        child.relationshipKind === 'child' &&
        childNavigation(response, parentCard.cardId, child) === null,
    ),
  )

  return {
    activeAgents,
    queuedAgents,
    historyAgents: historyAgents
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 10),
    unavailable: unresolvedActivityExists,
  }
}

export const useAgentViewStore = create<AgentViewState>()(
  persist(
    (set) => ({
      isOpen: inferInitialOpenState(),
      queueOpen: true,
      historyOpen: false,
      setOpen: function setOpen(isOpen) {
        set({ isOpen })
      },
      toggleOpen: function toggleOpen() {
        set((state) => ({ isOpen: !state.isOpen }))
      },
      setQueueOpen: function setQueueOpen(isOpen) {
        set({ queueOpen: isOpen })
      },
      setHistoryOpen: function setHistoryOpen(isOpen) {
        set({ historyOpen: isOpen })
      },
    }),
    {
      name: 'agent-view-state',
    },
  ),
)

export type AgentViewResult = {
  isOpen: boolean
  queueOpen: boolean
  historyOpen: boolean
  isDesktop: boolean
  shouldAutoOpen: boolean
  panelVisible: boolean
  showFloatingToggle: boolean
  panelWidth: number
  panelOffset: number
  nowMs: number
  lastRefreshedMs: number
  activeAgents: Array<ActiveAgent>
  missionActiveAgents: Array<ActiveAgent>
  nonMissionActiveAgents: Array<ActiveAgent>
  queuedAgents: Array<QueuedAgentTask>
  historyAgents: Array<AgentHistoryItem>
  activeMissionName: string
  activeMissionState: string | null
  activeCount: number
  isLoading: boolean
  isDemoMode: boolean
  isLiveConnected: boolean
  errorMessage: string | null
  setOpen: (isOpen: boolean) => void
  toggleOpen: () => void
  setQueueOpen: (isOpen: boolean) => void
  setHistoryOpen: (isOpen: boolean) => void
}

export function useAgentView(
  sessionCardList: SessionCardListWire | undefined,
): AgentViewResult {
  const isOpen = useAgentViewStore((state) => state.isOpen)
  const queueOpen = useAgentViewStore((state) => state.queueOpen)
  const historyOpen = useAgentViewStore((state) => state.historyOpen)
  const setOpen = useAgentViewStore((state) => state.setOpen)
  const toggleOpen = useAgentViewStore((state) => state.toggleOpen)
  const setQueueOpen = useAgentViewStore((state) => state.setQueueOpen)
  const setHistoryOpen = useAgentViewStore((state) => state.setHistoryOpen)
  const activeMission = useMissionStore((state) => state.activeMission)
  const missionSessionMap = useMissionStore((state) => state.agentSessionMap)

  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') return MIN_DESKTOP_WIDTH
    return window.innerWidth
  })
  const [nowMs, setNowMs] = useState(() => Date.now())

  const lastRefreshedMs = useMemo(() => Date.now(), [sessionCardList])

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return function cleanupResize() {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, REFRESH_INTERVAL_MS)

    return function cleanupTimer() {
      window.clearInterval(timer)
    }
  }, [])

  const projection = useMemo(
    () =>
      sessionCardList
        ? projectCardActivities(sessionCardList)
        : {
            activeAgents: [],
            queuedAgents: [],
            historyAgents: [],
            unavailable: false,
          },
    [sessionCardList],
  )

  const missionCardIds = useMemo(() => {
    const ids = new Set<string>()
    const response = sessionCardList
    if (!response) return ids
    Object.values(missionSessionMap).forEach((identity) => {
      const target = resolveAgentSessionCardNavigation(response, {
        sessionKey: identity,
      })
      if (target?.inspectedChildCardId) ids.add(target.inspectedChildCardId)
    })
    return ids
  }, [missionSessionMap, sessionCardList])

  const missionActiveAgents = useMemo(
    () =>
      activeMission
        ? projection.activeAgents.filter((agent) =>
            missionCardIds.has(agent.id),
          )
        : [],
    [activeMission, missionCardIds, projection.activeAgents],
  )
  const nonMissionActiveAgents = useMemo(
    () =>
      activeMission
        ? projection.activeAgents.filter(
            (agent) => !missionCardIds.has(agent.id),
          )
        : projection.activeAgents,
    [activeMission, missionCardIds, projection.activeAgents],
  )

  const isDesktop = viewportWidth >= MIN_DESKTOP_WIDTH
  const panelVisible = isDesktop && isOpen
  const showFloatingToggle = isDesktop && !isOpen
  const panelOffset = panelVisible ? PANEL_WIDTH_PX : 0
  const errorMessage =
    !sessionCardList || projection.unavailable
      ? 'Card activity unavailable'
      : null

  return useMemo(
    () => ({
      isOpen,
      queueOpen,
      historyOpen,
      isDesktop,
      shouldAutoOpen: false,
      panelVisible,
      showFloatingToggle,
      panelWidth: PANEL_WIDTH_PX,
      panelOffset,
      nowMs,
      lastRefreshedMs,
      activeAgents: projection.activeAgents,
      missionActiveAgents,
      nonMissionActiveAgents,
      queuedAgents: projection.queuedAgents,
      historyAgents: projection.historyAgents,
      activeMissionName: activeMission?.name || '',
      activeMissionState: activeMission?.state ?? null,
      activeCount: projection.activeAgents.length,
      isLoading: !sessionCardList,
      isDemoMode: false,
      isLiveConnected: Boolean(sessionCardList),
      errorMessage,
      setOpen,
      toggleOpen,
      setQueueOpen,
      setHistoryOpen,
    }),
    [
      activeMission,
      errorMessage,
      historyOpen,
      isDesktop,
      isOpen,
      lastRefreshedMs,
      missionActiveAgents,
      nonMissionActiveAgents,
      nowMs,
      panelOffset,
      panelVisible,
      projection.activeAgents,
      projection.historyAgents,
      projection.queuedAgents,
      queueOpen,
      sessionCardList,
      setHistoryOpen,
      setOpen,
      setQueueOpen,
      showFloatingToggle,
      toggleOpen,
    ],
  )
}

export function formatRuntime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(3)}`
}
