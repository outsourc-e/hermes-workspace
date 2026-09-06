import { useEffect, useMemo, useRef, useState } from 'react'

const AGENT_SPAWN_LAYOUT_PREFIX = 'agent-spawn'
const DEFAULT_SPAWN_TTL_MS = 360
const DEFAULT_SPAWN_STAGGER_MS = 60

function toAgentIdSet(agentIds: Array<string>): Set<string> {
  return new Set(agentIds)
}

function getSpawnLayoutId(kind: 'card' | 'chat', agentId: string): string {
  return `${AGENT_SPAWN_LAYOUT_PREFIX}-${kind}-${agentId}`
}

function getSharedSpawnLayoutId(agentId: string): string {
  return `${AGENT_SPAWN_LAYOUT_PREFIX}-shared-${agentId}`
}

function addSetItems(base: Set<string>, items: Array<string>): Set<string> {
  const next = new Set(base)
  for (const item of items) {
    next.add(item)
  }
  return next
}

function removeSetItems(base: Set<string>, items: Array<string>): Set<string> {
  const next = new Set(base)
  for (const item of items) {
    next.delete(item)
  }
  return next
}

function intersectSet(base: Set<string>, activeIds: Set<string>): Set<string> {
  // If the intersection would be identical to base, return the same reference
  // to avoid triggering unnecessary re-renders.
  const allIds: Array<string> = []
  base.forEach(function collectIds(id) {
    if (activeIds.has(id)) allIds.push(id)
  })
  if (allIds.length === base.size) return base

  const next = new Set<string>(allIds)
  return next
}

export type AgentSpawnState = {
  isSpawning: (agentId: string) => boolean
  shouldRenderCard: (agentId: string) => boolean
  getCardLayoutId: (agentId: string) => string
  getChatBubbleLayoutId: (agentId: string) => string
  getSharedLayoutId: (agentId: string) => string
}

export function useAgentSpawn(
  activeAgentIds: Array<string>,
  ttlMs = DEFAULT_SPAWN_TTL_MS,
  staggerMs = DEFAULT_SPAWN_STAGGER_MS,
): AgentSpawnState {
  const initializedRef = useRef(false)
  const previousIdsRef = useRef<Set<string>>(new Set())
  const timeoutByAgentIdRef = useRef<Map<string, Array<number>>>(new Map())
  const [spawningAgentIds, setSpawningAgentIds] = useState<Set<string>>(
    function createInitialSpawningSet() {
      return new Set()
    },
  )
  const [renderedAgentIds, setRenderedAgentIds] = useState<Set<string>>(
    function createInitialRenderedSet() {
      return new Set(activeAgentIds)
    },
  )

  useEffect(function clearAllSpawnTimersOnUnmount() {
    return function cleanup() {
      timeoutByAgentIdRef.current.forEach(function clearTimer(timeoutIds) {
        timeoutIds.forEach(function clearTimeoutById(timeoutId) {
          window.clearTimeout(timeoutId)
        })
      })
      timeoutByAgentIdRef.current.clear()
    }
  }, [])

  useEffect(
    function detectNewAgents() {
      const currentIds = toAgentIdSet(activeAgentIds)
      const previousIds = previousIdsRef.current

      if (!initializedRef.current) {
        initializedRef.current = true
        previousIdsRef.current = currentIds
        setRenderedAgentIds(new Set(activeAgentIds))
        return
      }

      setRenderedAgentIds(function keepRenderedIdsAligned(previousRendered) {
        return intersectSet(previousRendered, currentIds)
      })
      setSpawningAgentIds(function keepSpawningIdsAligned(previousSpawned) {
        return intersectSet(previousSpawned, currentIds)
      })

      const removedIds = Array.from(previousIds).filter(
        function findRemoved(agentId) {
          return !currentIds.has(agentId)
        },
      )
      removedIds.forEach(function clearRemovedAgentTimers(agentId) {
        const timeoutIds = timeoutByAgentIdRef.current.get(agentId)
        if (!timeoutIds) return
        timeoutIds.forEach(function clearTimer(timeoutId) {
          window.clearTimeout(timeoutId)
        })
        timeoutByAgentIdRef.current.delete(agentId)
      })

      const newIds = activeAgentIds.filter(function findNewId(agentId) {
        return !previousIds.has(agentId)
      })

      if (newIds.length > 0) {
        newIds.forEach(function setupSpawnTimer(agentId, index) {
          const existingTimers = timeoutByAgentIdRef.current.get(agentId)
          if (existingTimers) {
            existingTimers.forEach(function clearExisting(timeoutId) {
              window.clearTimeout(timeoutId)
            })
          }

          const delayMs = index * staggerMs
          const startSpawnTimeoutId = window.setTimeout(
            function beginSpawnState() {
              setSpawningAgentIds(function addSpawnedId(previousSpawned) {
                return addSetItems(previousSpawned, [agentId])
              })
            },
            delayMs,
          )

          const revealCardTimeoutId = window.setTimeout(
            function revealSpawnedCard() {
              setRenderedAgentIds(function addRenderedId(previousRendered) {
                return addSetItems(previousRendered, [agentId])
              })
              setSpawningAgentIds(function removeSpawnedId(previousSpawned) {
                return removeSetItems(previousSpawned, [agentId])
              })
              timeoutByAgentIdRef.current.delete(agentId)
            },
            delayMs + ttlMs,
          )

          timeoutByAgentIdRef.current.set(agentId, [
            startSpawnTimeoutId,
            revealCardTimeoutId,
          ])
        })
      }

      previousIdsRef.current = currentIds
    },
    [activeAgentIds, staggerMs, ttlMs],
  )

  return useMemo(
    function buildSpawnState() {
      return {
        isSpawning: function isSpawning(agentId: string): boolean {
          return spawningAgentIds.has(agentId)
        },
        shouldRenderCard: function shouldRenderCard(agentId: string): boolean {
          return renderedAgentIds.has(agentId)
        },
        getCardLayoutId: function getCardLayoutId(agentId: string): string {
          return getSpawnLayoutId('card', agentId)
        },
        getChatBubbleLayoutId: function getChatBubbleLayoutId(
          agentId: string,
        ): string {
          return getSpawnLayoutId('chat', agentId)
        },
        getSharedLayoutId: function getSharedLayoutId(agentId: string): string {
          return getSharedSpawnLayoutId(agentId)
        },
      }
    },
    [renderedAgentIds, spawningAgentIds],
  )
}

export function buildAgentCardLayoutId(agentId: string): string {
  return getSpawnLayoutId('card', agentId)
}

export function buildAgentChatBubbleLayoutId(agentId: string): string {
  return getSpawnLayoutId('chat', agentId)
}

export function buildAgentSharedLayoutId(agentId: string): string {
  return getSharedSpawnLayoutId(agentId)
}
