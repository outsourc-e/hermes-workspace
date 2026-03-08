import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  CHAT_STREAM_DONE_EVENT,
  CHAT_TOOL_CALL_EVENT,
  CHAT_TOOL_RESULT_EVENT,
} from './use-gateway-chat-stream'

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

type ToolEventDetail = {
  phase?: string
  name?: string
  toolCallId?: string
  args?: unknown
  runId?: string
  sessionKey?: string
  isError?: boolean
  error?: string
}

type DoneEventDetail = {
  state?: string
  sessionKey?: string
}

type UseResearchCardOptions = {
  sessionKey?: string
  isStreaming?: boolean
  resetKey?: string | number
}

function matchesSession(eventSessionKey: string | undefined, sessionKey: string | undefined): boolean {
  if (!sessionKey || sessionKey === 'new') return true
  return eventSessionKey === sessionKey
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFirstString(input: unknown, keys: string[]): string {
  const record = asRecord(input)
  if (!record) return ''
  for (const key of keys) {
    const value = readString(record[key])
    if (value) return value
  }
  return ''
}

function basename(path: string): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

function extractFileTarget(args: unknown): string {
  if (typeof args === 'string') {
    const trimmed = args.trim()
    if (!trimmed) return ''

    try {
      const parsed = JSON.parse(trimmed) as unknown
      const fromParsed = extractFileTarget(parsed)
      if (fromParsed) return fromParsed
    } catch {
      // Plain string tool args are common; fall through to text heuristics.
    }

    const patterns = [
      /"path"\s*:\s*"([^"]+)"/i,
      /"file(?:name|path)?"\s*:\s*"([^"]+)"/i,
      /path=([^\s,]+)/i,
      /file=([^\s,]+)/i,
    ]
    for (const pattern of patterns) {
      const match = pattern.exec(trimmed)
      if (match?.[1]) return basename(match[1])
    }
    return ''
  }

  const direct =
    readFirstString(args, ['path', 'filePath', 'filepath', 'filename', 'file', 'target_file']) ||
    readFirstString(asRecord(args)?.target, ['path', 'filePath', 'filepath', 'filename', 'file']) ||
    readFirstString(asRecord(args)?.input, ['path', 'filePath', 'filepath', 'filename', 'file'])
  return direct ? basename(direct) : ''
}

function capitalizeLabel(toolName: string): string {
  if (!toolName) return 'Working'
  return toolName
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
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
      return capitalizeLabel(toolName)
  }
}

export function useResearchCard({
  sessionKey,
  isStreaming = false,
  resetKey,
}: UseResearchCardOptions = {}) {
  const [steps, setSteps] = useState<ResearchStep[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setSteps([])
    setCollapsed(false)
  }, [resetKey, sessionKey])

  useEffect(() => {
    if (!isStreaming && steps.length > 0) {
      setCollapsed(true)
    }
  }, [isStreaming, steps.length])

  useEffect(() => {
    if (!isStreaming || steps.length === 0) return
    setNow(Date.now())
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [isStreaming, steps.length])

  useEffect(() => {
    function handleToolCall(event: Event) {
      const detail = (event as CustomEvent<ToolEventDetail>).detail
      console.log('[research-card-debug] handleToolCall', detail.name, detail.sessionKey, 'match:', matchesSession(detail.sessionKey, sessionKey), 'hook sessionKey:', sessionKey)
      if (!matchesSession(detail.sessionKey, sessionKey)) return

      const toolName = detail.name ?? 'tool'
      const stepId =
        detail.toolCallId ??
        `${toolName}-${detail.runId ?? detail.sessionKey ?? 'main'}-${Date.now()}`
      const startedAt = Date.now()
      setNow(startedAt)

      setSteps((current) => {
        const existingIndex = current.findIndex((step) => step.id === stepId)
        const nextStep: ResearchStep = {
          id: stepId,
          toolName,
          label: buildToolLabel(toolName, detail.args),
          status: 'running',
          startedAt,
        }

        if (existingIndex >= 0) {
          const next = [...current]
          next[existingIndex] = {
            ...next[existingIndex],
            ...nextStep,
            startedAt: next[existingIndex].startedAt,
          }
          return next
        }

        return [...current, nextStep]
      })
      setCollapsed(false)
    }

    function handleToolResult(event: Event) {
      const detail = (event as CustomEvent<ToolEventDetail>).detail
      if (!matchesSession(detail.sessionKey, sessionKey)) return

      const toolName = detail.name ?? 'tool'
      const stepId = detail.toolCallId
      const finishedAt = Date.now()
      setNow(finishedAt)

      setSteps((current) => {
        if (!stepId) {
          return [
            ...current,
            {
              id: `${toolName}-${detail.runId ?? detail.sessionKey ?? 'main'}-${finishedAt}`,
              toolName,
              label: buildToolLabel(toolName, detail.args),
              status: detail.isError || detail.error ? 'error' : 'done',
              startedAt: finishedAt,
              durationMs: 0,
            },
          ]
        }

        const existingIndex = current.findIndex((step) => step.id === stepId)
        if (existingIndex === -1) return current

        const next = [...current]
        const existing = next[existingIndex]
        next[existingIndex] = {
          ...existing,
          status: detail.isError || detail.error ? 'error' : 'done',
          durationMs: Math.max(0, finishedAt - existing.startedAt),
        }
        return next
      })
    }

    function handleDone(event: Event) {
      const detail = (event as CustomEvent<DoneEventDetail>).detail
      if (!matchesSession(detail.sessionKey, sessionKey)) return
      setNow(Date.now())
      setCollapsed(true)
    }

    window.addEventListener(CHAT_TOOL_CALL_EVENT, handleToolCall as EventListener)
    window.addEventListener(CHAT_TOOL_RESULT_EVENT, handleToolResult as EventListener)
    window.addEventListener(CHAT_STREAM_DONE_EVENT, handleDone as EventListener)

    return () => {
      window.removeEventListener(CHAT_TOOL_CALL_EVENT, handleToolCall as EventListener)
      window.removeEventListener(CHAT_TOOL_RESULT_EVENT, handleToolResult as EventListener)
      window.removeEventListener(CHAT_STREAM_DONE_EVENT, handleDone as EventListener)
    }
  }, [sessionKey])

  const totalDurationMs = useMemo(() => {
    if (steps.length === 0) return 0
    const startedAt = Math.min(...steps.map((step) => step.startedAt))
    const endedAt = Math.max(
          ...steps.map((step) => step.startedAt + (step.durationMs ?? (isStreaming ? now - step.startedAt : 0))),
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
