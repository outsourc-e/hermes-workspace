import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGatewayChatStore } from '../stores/gateway-chat-store'

export type ResearchStep = {
  id: string
  toolName: string
  label: string
  status: 'running' | 'done' | 'error'
  startedAt: number
  durationMs?: number
}

export type UseResearchCardResult = {
  steps: ResearchStep[]
  isActive: boolean
  totalDurationMs: number
  collapsed: boolean
  setCollapsed: Dispatch<SetStateAction<boolean>>
}

type UseResearchCardOptions = {
  sessionKey?: string
  isStreaming?: boolean
  resetKey?: string | number
}

function basename(path: string): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

function extractFileTarget(args: unknown): string {
  if (!args) return ''

  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as unknown
      return extractFileTarget(parsed)
    } catch {
      // Not JSON — try regex
      const patterns = [
        /"(?:path|file_path|file|filepath)"\s*:\s*"([^"]+)"/i,
        /path=([^\s,]+)/i,
      ]
      for (const pattern of patterns) {
        const match = pattern.exec(args)
        if (match?.[1]) return basename(match[1])
      }
      return ''
    }
  }

  if (typeof args === 'object' && args !== null) {
    const record = args as Record<string, unknown>
    for (const key of ['path', 'filePath', 'file_path', 'filepath', 'filename', 'file', 'target_file']) {
      const val = record[key]
      if (typeof val === 'string' && val.trim()) return basename(val.trim())
    }
  }

  return ''
}

function buildToolLabel(toolName: string, args: unknown): string {
  const fileTarget = extractFileTarget(args)

  switch (toolName) {
    case 'exec':
      return 'Running command'
    case 'Read':
    case 'read':
      return fileTarget ? `Reading ${fileTarget}` : 'Reading file'
    case 'Write':
    case 'write':
      return fileTarget ? `Writing ${fileTarget}` : 'Writing file'
    case 'Edit':
    case 'edit':
      return fileTarget ? `Editing ${fileTarget}` : 'Editing file'
    case 'web_search':
      return 'Searching the web'
    case 'web_fetch':
      return 'Fetching page'
    case 'sessions_spawn':
      return 'Spawning agent'
    case 'sessions_send':
      return 'Steering agent'
    case 'memory_search':
      return 'Searching memory'
    case 'browser':
      return 'Controlling browser'
    case 'image':
      return 'Analyzing image'
    default:
      return toolName
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

/**
 * Research card hook that reads directly from the gateway chat store
 * instead of relying on CustomEvents. This is more reliable because
 * the store is already proven to receive tool events (the thinking
 * bubble uses the same data path).
 */
export function useResearchCard({
  sessionKey,
  isStreaming = false,
  resetKey,
}: UseResearchCardOptions = {}) {
  const [steps, setSteps] = useState<ResearchStep[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const seenToolIdsRef = useRef<Set<string>>(new Set())

  // Reset when session or resetKey changes
  useEffect(() => {
    setSteps([])
    setCollapsed(false)
    seenToolIdsRef.current.clear()
  }, [resetKey, sessionKey])

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming && steps.length > 0) {
      setCollapsed(true)
    }
  }, [isStreaming, steps.length])

  // Tick timer for duration display
  useEffect(() => {
    if (!isStreaming || steps.length === 0) return
    setNow(Date.now())
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [isStreaming, steps.length])

  // Subscribe to store changes — this is the key difference from the
  // CustomEvent approach. We poll the store's streamingState for tool
  // calls and build the timeline from that.
  useEffect(() => {
    const unsubscribe = useGatewayChatStore.subscribe((state) => {
      const key = sessionKey || 'main'
      const streaming = state.streamingState.get(key)
      if (!streaming?.toolCalls?.length) return

      const currentTime = Date.now()
      setNow(currentTime)

      setSteps((prevSteps) => {
        let changed = false
        const nextSteps = [...prevSteps]

        for (const toolCall of streaming.toolCalls) {
          const toolId = toolCall.id
          const isDone = toolCall.phase === 'done' || toolCall.phase === 'result'
          const isError = toolCall.phase === 'error'

          const existingIndex = nextSteps.findIndex((s) => s.id === toolId)

          if (existingIndex >= 0) {
            // Update existing step
            const existing = nextSteps[existingIndex]
            const newStatus = isError ? 'error' : isDone ? 'done' : 'running'
            if (existing.status !== newStatus) {
              nextSteps[existingIndex] = {
                ...existing,
                status: newStatus,
                durationMs: (isDone || isError) ? currentTime - existing.startedAt : undefined,
              }
              changed = true
            }
          } else if (!seenToolIdsRef.current.has(toolId)) {
            // New tool call
            seenToolIdsRef.current.add(toolId)
            nextSteps.push({
              id: toolId,
              toolName: toolCall.name,
              label: buildToolLabel(toolCall.name, toolCall.args),
              status: isError ? 'error' : isDone ? 'done' : 'running',
              startedAt: currentTime,
              durationMs: (isDone || isError) ? 0 : undefined,
            })
            changed = true
          }
        }

        return changed ? nextSteps : prevSteps
      })

      setCollapsed(false)
    })

    return unsubscribe
  }, [sessionKey])

  const totalDurationMs = useMemo(() => {
    if (steps.length === 0) return 0
    const startedAt = Math.min(...steps.map((step) => step.startedAt))
    const endedAt = Math.max(
      ...steps.map((step) =>
        step.startedAt + (step.durationMs ?? (isStreaming ? now - step.startedAt : 0)),
      ),
    )
    return Math.max(0, endedAt - startedAt)
  }, [isStreaming, now, steps])

  const isActive = isStreaming && steps.length > 0

  return {
    steps,
    isActive,
    totalDurationMs,
    collapsed,
    setCollapsed,
  }
}
