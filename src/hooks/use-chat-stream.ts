// Stub — Hermes Workspace uses claude-api.ts for chat streaming, not legacy SSE.
// This hook is kept as a no-op to satisfy use-realtime-chat-history imports.

export function useChatStream(_opts: {
  sessionKey?: string
  enabled?: boolean
  onReconnect?: () => void
  onSilentTimeout?: (ms: number) => void
  onUserMessage?: (message: any, source?: string) => void
  onApprovalRequest?: (approval: Record<string, unknown>) => void
  onCompactionStart?: () => void
  onCompactionEnd?: () => void
  onCompaction?: (...args: Array<any>) => void
  onDone?: (...args: Array<any>) => void
}) {
  return {
    connectionState: 'connected' as const,
    lastError: null as string | null,
    reconnect: () => {},
  }
}
