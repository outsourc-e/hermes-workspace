import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGatewayChatStore } from '../stores/gateway-chat-store'
import {
  CHAT_STREAM_DONE_EVENT,
  CHAT_TOOL_CALL_EVENT,
  CHAT_TOOL_RESULT_EVENT,
} from './use-gateway-chat-stream'

const EMPTY_TOOL_CALLS: never[] = []
const researchTimelineCache = new Map<
  string,
  { steps: ResearchStep[]; collapsed: boolean }
>()

// Dev helper: trigger a fake research card demo from the browser console.
// Usage: __triggerResearchDemo() or __triggerResearchDemo('agent:main:main')
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as any).__triggerResearchDemo = (sessionKey = 'agent:main:main') => {
    const tools = [
      { name: 'memory_search', args: '{"query":"test"}', delay: 0, duration: 800 },
      { name: 'Read', args: '{"path":"MEMORY.md"}', delay: 200, duration: 1200 },
      { name: 'exec', args: '{"command":"git log --oneline -5"}', delay: 500, duration: 2000 },
      { name: 'web_search', args: '{"query":"hermes agent latest"}', delay: 1000, duration: 1500 },
      { name: 'Edit', args: '{"path":"src/app.tsx"}', delay: 1500, duration: 900 },
    ]
    tools.forEach((tool, i) => {
      const toolCallId = `demo-${i}-${Date.now()}`
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CHAT_TOOL_CALL_EVENT, {
          detail: { sessionKey, toolCallId, name: tool.name, args: tool.args, phase: 'calling' }
        }))
      }, tool.delay)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CHAT_TOOL_RESULT_EVENT, {
          detail: { sessionKey, toolCallId, name: tool.name, phase: 'done' }
        }))
      }, tool.delay + tool.duration)
    })
  }
}

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

type ToolEventDetail = {
  sessionKey?: string
  toolCallId?: string
  name?: string
  phase?: string
  args?: unknown
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
  const timelineKey = `${effectiveSessionKey}:${String(resetKey ?? 'default')}`
  const streamingToolCalls = useGatewayChatStore(
    (state) => state.streamingState.get(effectiveSessionKey)?.toolCalls ?? EMPTY_TOOL_CALLS,
  )
  const [steps, setSteps] = useState<ResearchStep[]>(
    () => researchTimelineCache.get(timelineKey)?.steps ?? [],
  )
  const [collapsed, setCollapsed] = useState(
    () => researchTimelineCache.get(timelineKey)?.collapsed ?? false,
  )
  const [now, setNow] = useState(() => Date.now())
  const seenToolIdsRef = useRef<Set<string>>(new Set())
  const stepsRef = useRef(steps)

  useEffect(() => {
    stepsRef.current = steps
  }, [steps])

  const writeTimelineSnapshot = useCallback(
    (nextSteps: ResearchStep[], nextCollapsed: boolean) => {
      researchTimelineCache.set(timelineKey, {
        steps: nextSteps,
        collapsed: nextCollapsed,
      })
    },
    [timelineKey],
  )

  useEffect(() => {
    const cached = researchTimelineCache.get(timelineKey)
    const nextSteps = cached?.steps ?? []
    const nextCollapsed = cached?.collapsed ?? false
    setSteps(nextSteps)
    setCollapsed(nextCollapsed)
    seenToolIdsRef.current = new Set(nextSteps.map((step) => step.id))
  }, [timelineKey])

  useEffect(() => {
    writeTimelineSnapshot(steps, collapsed)
  }, [collapsed, steps, writeTimelineSnapshot])

  const upsertStep = useCallback(
    (
      toolId: string,
      toolName: string,
      args: unknown,
      status: ResearchStep['status'],
      currentTime = Date.now(),
    ) => {
      setNow(currentTime)
      setSteps((prevSteps) => {
        const existingIndex = prevSteps.findIndex((step) => step.id === toolId)

        if (existingIndex >= 0) {
          const existing = prevSteps[existingIndex]
          const nextDuration =
            status === 'running' ? undefined : currentTime - existing.startedAt
          const nextLabel = buildToolLabel(toolName, args)

          if (
            existing.toolName === toolName &&
            existing.label === nextLabel &&
            existing.status === status &&
            existing.durationMs === nextDuration
          ) {
            return prevSteps
          }

          const nextSteps = [...prevSteps]
          nextSteps[existingIndex] = {
            ...existing,
            toolName,
            label: nextLabel,
            status,
            durationMs: nextDuration,
          }
          return nextSteps
        }

        if (seenToolIdsRef.current.has(toolId)) return prevSteps

        seenToolIdsRef.current.add(toolId)
        return [
          ...prevSteps,
          {
            id: toolId,
            toolName,
            label: buildToolLabel(toolName, args),
            status,
            startedAt: currentTime,
            durationMs: status === 'running' ? undefined : 0,
          },
        ]
      })
    },
    [],
  )

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming && steps.length > 0) {
      setCollapsed(true)
    }
  }, [isStreaming, steps.length])

  // Tick timer for duration display
  useEffect(() => {
    if (!steps.some((step) => step.status === 'running')) return
    setNow(Date.now())
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [steps])

  // Mirror the active tool-call array from the store into a persistent
  // timeline so completed steps still render after streaming state clears.
  useEffect(() => {
    if (streamingToolCalls.length === 0) return

    const currentTime = Date.now()
    for (const toolCall of streamingToolCalls) {
      const isDone = toolCall.phase === 'done' || toolCall.phase === 'result'
      const isError = toolCall.phase === 'error'
      const nextStatus: ResearchStep['status'] = isError
        ? 'error'
        : isDone
          ? 'done'
          : 'running'

      upsertStep(
        toolCall.id,
        toolCall.name,
        toolCall.args,
        nextStatus,
        currentTime,
      )
    }

    setCollapsed(false)
  }, [streamingToolCalls, upsertStep])

  // Track tool activity directly from SSE tool events so quick runs still
  // populate the timeline even if streamingState is cleared before a render.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleToolCall = (event: Event) => {
      const detail = (event as CustomEvent<ToolEventDetail>).detail
      if (detail.sessionKey !== effectiveSessionKey) return
      const toolId = detail.toolCallId?.trim()
      const toolName = detail.name?.trim()
      if (!toolId || !toolName) return
      upsertStep(toolId, toolName, detail.args, 'running')
      setCollapsed(false)
    }

    const handleToolResult = (event: Event) => {
      const detail = (event as CustomEvent<ToolEventDetail>).detail
      if (detail.sessionKey !== effectiveSessionKey) return
      const toolId = detail.toolCallId?.trim()
      const toolName = detail.name?.trim()
      if (!toolId || !toolName) return
      upsertStep(
        toolId,
        toolName,
        detail.args,
        detail.phase === 'error' ? 'error' : 'done',
      )
      setCollapsed(false)
    }

    const handleStreamDone = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionKey?: string }>).detail
      if (detail.sessionKey !== effectiveSessionKey) return
      setCollapsed((current) => (stepsRef.current.length > 0 ? true : current))
    }

    window.addEventListener(CHAT_TOOL_CALL_EVENT, handleToolCall as EventListener)
    window.addEventListener(
      CHAT_TOOL_RESULT_EVENT,
      handleToolResult as EventListener,
    )
    window.addEventListener(
      CHAT_STREAM_DONE_EVENT,
      handleStreamDone as EventListener,
    )

    return () => {
      window.removeEventListener(
        CHAT_TOOL_CALL_EVENT,
        handleToolCall as EventListener,
      )
      window.removeEventListener(
        CHAT_TOOL_RESULT_EVENT,
        handleToolResult as EventListener,
      )
      window.removeEventListener(
        CHAT_STREAM_DONE_EVENT,
        handleStreamDone as EventListener,
      )
    }
  }, [effectiveSessionKey, upsertStep])

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

  const isActive = steps.some((step) => step.status === 'running')

  return {
    steps,
    isActive,
    totalDurationMs,
    collapsed,
    setCollapsed,
  }
}
