import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGatewayChatStore } from '../stores/gateway-chat-store'

const EMPTY_TOOL_CALLS: never[] = []

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
 * Research card hook that reads directly from the same gateway chat
 * store selector path used by the thinking bubble.
 */
export function useResearchCard({
  sessionKey,
  isStreaming = false,
  resetKey,
}: UseResearchCardOptions = {}) {
  const effectiveSessionKey = sessionKey || 'main'
  const streamingToolCalls = useGatewayChatStore(
    (state) => state.streamingState.get(effectiveSessionKey)?.toolCalls ?? EMPTY_TOOL_CALLS,
  )
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

  // Mirror the active tool-call array from the store into a persistent
  // timeline so completed steps still render after streaming state clears.
  useEffect(() => {
    if (streamingToolCalls.length === 0) return

    const currentTime = Date.now()
    setNow(currentTime)

    setSteps((prevSteps) => {
      let changed = false
      const nextSteps = [...prevSteps]

      for (const toolCall of streamingToolCalls) {
        const toolId = toolCall.id
        const isDone = toolCall.phase === 'done' || toolCall.phase === 'result'
        const isError = toolCall.phase === 'error'
        const nextStatus: ResearchStep['status'] = isError
          ? 'error'
          : isDone
            ? 'done'
            : 'running'

        const existingIndex = nextSteps.findIndex((step) => step.id === toolId)

        if (existingIndex >= 0) {
          const existing = nextSteps[existingIndex]
          const nextDuration =
            isDone || isError ? currentTime - existing.startedAt : undefined
          if (
            existing.status !== nextStatus ||
            existing.label !== buildToolLabel(toolCall.name, toolCall.args) ||
            existing.toolName !== toolCall.name ||
            existing.durationMs !== nextDuration
          ) {
            nextSteps[existingIndex] = {
              ...existing,
              toolName: toolCall.name,
              label: buildToolLabel(toolCall.name, toolCall.args),
              status: nextStatus,
              durationMs: nextDuration,
            }
            changed = true
          }
          continue
        }

        if (seenToolIdsRef.current.has(toolId)) continue

        seenToolIdsRef.current.add(toolId)
        nextSteps.push({
          id: toolId,
          toolName: toolCall.name,
          label: buildToolLabel(toolCall.name, toolCall.args),
          status: nextStatus,
          startedAt: currentTime,
          durationMs: isDone || isError ? 0 : undefined,
        })
        changed = true
      }

      return changed ? nextSteps : prevSteps
    })

    setCollapsed(false)
  }, [streamingToolCalls])

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

  const isActive =
    isStreaming && steps.some((step) => step.status === 'running')

  return {
    steps,
    isActive,
    totalDurationMs,
    collapsed,
    setCollapsed,
  }
}
