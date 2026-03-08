import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGatewayChatStore } from '../stores/gateway-chat-store'
import {
  CHAT_STREAM_DONE_EVENT,
  CHAT_TOOL_CALL_EVENT,
  CHAT_TOOL_RESULT_EVENT,
} from './use-gateway-chat-stream'

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
  const streamingToolCalls = useGatewayChatStore(
    (state) => state.streamingState.get(effectiveSessionKey)?.toolCalls ?? EMPTY_TOOL_CALLS,
  )
  const [steps, setSteps] = useState<ResearchStep[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const seenToolIdsRef = useRef<Set<string>>(new Set())

  const upsertStep = useMemo(
    () =>
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
      setCollapsed((current) => (steps.length > 0 ? true : current))
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
  }, [effectiveSessionKey, steps.length, upsertStep])

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
