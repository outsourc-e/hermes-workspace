'use client'

import { useQuery } from '@tanstack/react-query'

type ConnectionStatus = {
  status: 'connected' | 'enhanced' | 'partial' | 'disconnected'
  label: 'Connected' | 'Enhanced' | 'Partial' | 'Disconnected'
  detail: string
  health: boolean
  chatReady: boolean
  modelConfigured: boolean
  activeModel: string
  chatMode: 'enhanced-claude' | 'portable' | 'disconnected'
  capabilities: Record<string, boolean>
  claudeUrl: string
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const response = await fetch('/api/connection-status', {
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) {
    return {
      status: 'disconnected',
      label: 'Disconnected',
      detail: 'No compatible backend detected.',
      health: false,
      chatReady: false,
      modelConfigured: false,
      activeModel: '',
      chatMode: 'disconnected',
      capabilities: {},
      claudeUrl: '',
    }
  }
  return response.json() as Promise<ConnectionStatus>
}

function statusToColors(
  status: ConnectionStatus['status'] | undefined,
  isLoading: boolean,
) {
  if (isLoading || status === undefined) {
    return {
      dot: 'bg-yellow-400',
      pulse: 'bg-yellow-400/40',
      label: 'Checking...',
    }
  }
  switch (status) {
    case 'enhanced':
      return { dot: 'bg-cyan-400', pulse: 'bg-cyan-400/40', label: 'Enhanced' }
    case 'connected':
      return {
        dot: 'bg-emerald-400',
        pulse: 'bg-emerald-400/40',
        label: 'Connected',
      }
    case 'partial':
      return {
        dot: 'bg-yellow-400',
        pulse: 'bg-yellow-400/40',
        label: 'Partial',
      }
    case 'disconnected':
    default:
      return {
        dot: 'bg-red-400',
        pulse: 'bg-red-400/40',
        label: 'Disconnected',
      }
  }
}

function buildTooltip(
  data: ConnectionStatus | undefined,
  label: string,
): string {
  if (!data) return `Backend: ${label}`
  const parts: Array<string> = [`Backend: ${label}`]
  if (data.detail) parts.push(data.detail)
  if (data.status === 'partial') {
    if (!data.chatReady) parts.push('Missing /v1/chat/completions')
    if (!data.modelConfigured) parts.push('No model selected')
  }
  if (data.status === 'enhanced') {
    parts.push('Hermes Agent gateway enhancements detected')
  }
  if (data.activeModel) parts.push(`Model: ${data.activeModel}`)
  return parts.join(' · ')
}

/**
 * Minimal dot-only status indicator (no text).
 * Shows connected, enhanced, partial, or disconnected backend state.
 */
export function StatusDot() {
  const { data, isLoading } = useQuery({
    queryKey: ['claude', 'connection-status'],
    queryFn: fetchConnectionStatus,
    refetchInterval: 15_000,
    retry: false,
  })

  const { dot: dotColor, label } = statusToColors(data?.status, isLoading)
  const isConnected =
    data?.status === 'connected' || data?.status === 'enhanced'
  const tooltip = buildTooltip(data, label)

  return (
    <span className="relative flex h-2 w-2 shrink-0" title={tooltip}>
      {isConnected && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/40" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`}
      />
    </span>
  )
}

export function StatusIndicator({
  collapsed,
  inline,
}: {
  collapsed?: boolean
  inline?: boolean
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['claude', 'connection-status'],
    queryFn: fetchConnectionStatus,
    refetchInterval: 15_000,
    retry: false,
  })

  const {
    dot: dotColor,
    pulse: pulseColor,
    label,
  } = statusToColors(data?.status, isLoading)
  const isConnected =
    data?.status === 'connected' || data?.status === 'enhanced'
  const isPartial = data?.status === 'partial'
  const tooltip = buildTooltip(data, label)

  if (inline) {
    return (
      <span className="flex items-center gap-1.5" title={tooltip}>
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {(isLoading || isConnected || isPartial) && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pulseColor}`}
            />
          )}
          <span
            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColor}`}
          />
        </span>
        <span className="text-[10px] text-primary-400 dark:text-gray-500">
          {label}
        </span>
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5" title={tooltip}>
      <span className="relative flex h-2 w-2 shrink-0">
        {(isLoading || isConnected || isPartial) && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pulseColor}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`}
        />
      </span>
      {!collapsed && (
        <span className="truncate text-[11px] text-primary-500 dark:text-gray-400">
          {label}
        </span>
      )}
    </div>
  )
}
