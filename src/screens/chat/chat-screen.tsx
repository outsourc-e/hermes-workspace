import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deriveFriendlyIdFromKey,
  isMissingGatewayAuth,
  readError,
  textFromMessage,
} from './utils'
import { createOptimisticMessage } from './chat-screen-utils'
import {
  appendHistoryMessage,
  chatQueryKeys,
  clearHistoryMessages,
  fetchGatewayStatus,
  updateHistoryMessageByClientId,
  updateSessionLastMessage,
} from './chat-queries'
import { ChatHeader } from './components/chat-header'
import { ChatMessageList } from './components/chat-message-list'
import { ChatEmptyState } from './components/chat-empty-state'
import { ChatComposer } from './components/chat-composer'
import { GatewayStatusMessage } from './components/gateway-status-message'
import {
  consumePendingSend,
  hasPendingGeneration,
  hasPendingSend,
  isRecentSession,
  resetPendingSend,
  setPendingGeneration,
} from './pending-send'
import { useChatMeasurements } from './hooks/use-chat-measurements'
import { useChatHistory } from './hooks/use-chat-history'
import { useRealtimeChatHistory } from './hooks/use-realtime-chat-history'
import { useSmoothStreamingText } from './hooks/use-smooth-streaming-text'
import { useChatMobile } from './hooks/use-chat-mobile'
import { useChatSessions } from './hooks/use-chat-sessions'
import { useAutoSessionTitle } from './hooks/use-auto-session-title'
import { useRenameSession } from './hooks/use-rename-session'
import { useContextAlert } from './hooks/use-context-alert'
import { ContextBar } from './components/context-bar'
import {
  addApproval,
  loadApprovals,
  saveApprovals,
} from '@/screens/gateway/lib/approvals-store'
import type {
  ChatComposerAttachment,
  ChatComposerHandle,
  ChatComposerHelpers,
  ThinkingLevel,
} from './components/chat-composer'
import type { ApprovalRequest } from '@/screens/gateway/lib/approvals-store'
import type { GatewayAttachment, GatewayMessage, SessionMeta } from './types'
import { stripQueuedWrapper } from '@/lib/strip-queued-wrapper'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { hapticTap } from '@/lib/haptics'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { SEARCH_MODAL_EVENTS } from '@/hooks/use-search-modal'
import { SIDEBAR_TOGGLE_EVENT } from '@/hooks/use-global-shortcuts'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { TerminalPanel } from '@/components/terminal-panel'
import { AgentViewPanel } from '@/components/agent-view/agent-view-panel'
import { useAgentViewStore } from '@/hooks/use-agent-view'
import { useTerminalPanelStore } from '@/stores/terminal-panel-store'
import { useModelSuggestions } from '@/hooks/use-model-suggestions'
import { ModelSuggestionToast } from '@/components/model-suggestion-toast'
import { useChatActivityStore } from '@/stores/chat-activity-store'
import { MobileSessionsPanel } from '@/components/mobile-sessions-panel'
import { ContextAlertModal } from '@/components/usage-meter/context-alert-modal'
import { useGatewayChatStore } from '@/stores/gateway-chat-store'
// MOBILE_TAB_BAR_OFFSET removed — tab bar always hidden in chat
import { useTapDebug } from '@/hooks/use-tap-debug'
import { BrailleSpinner } from '@/components/ui/braille-spinner'

type ChatScreenProps = {
  activeFriendlyId: string
  isNewChat?: boolean
  onSessionResolved?: (payload: {
    sessionKey: string
    friendlyId: string
  }) => void
  forcedSessionKey?: string
  /** Hide header + file explorer + terminal for panel mode */
  compact?: boolean
}

function normalizeMimeType(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function isImageMimeType(value: unknown): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('image/')
}

function readDataUrlMimeType(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = /^data:([^;,]+)[^,]*,/i.exec(value.trim())
  return match?.[1]?.trim().toLowerCase() || ''
}

function stripDataUrlPrefix(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const commaIndex = trimmed.indexOf(',')
  if (trimmed.toLowerCase().startsWith('data:') && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1).trim()
  }
  return trimmed
}

function normalizeMessageValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function messageFallbackSignature(message: GatewayMessage): string {
  const raw = message as Record<string, unknown>
  const timestamp = normalizeMessageValue(
    typeof raw.timestamp === 'number' ? String(raw.timestamp) : raw.timestamp,
  )

  const contentParts = Array.isArray(message.content)
    ? message.content
        .map((part: any) => {
          if (part.type === 'text') {
            return `t:${typeof part.text === 'string' ? part.text.trim() : ''}`
          }
          if (part.type === 'thinking') {
            return `th:${typeof (part as any).thinking === 'string' ? (part as any).thinking : ''}`
          }
          if (part.type === 'toolCall') {
            const toolPart = part as any
            return `tc:${toolPart.id ?? ''}:${toolPart.name ?? ''}`
          }
          return `p:${(part as any).type ?? ''}`
        })
        .join('|')
    : ''

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment) => {
          const name = typeof attachment?.name === 'string' ? attachment.name : ''
          const size = typeof attachment?.size === 'number' ? String(attachment.size) : ''
          const type =
            typeof attachment?.contentType === 'string'
              ? attachment.contentType
              : ''
          return `${name}:${size}:${type}`
        })
        .join('|')
    : ''

  return `${message.role ?? 'unknown'}:${timestamp}:${contentParts}:${attachments}`
}

function getMessageClientId(message: GatewayMessage): string {
  const raw = message as Record<string, unknown>
  const directClientId = normalizeMessageValue(raw.clientId)
  if (directClientId) return directClientId

  const alternateClientId = normalizeMessageValue(raw.client_id)
  if (alternateClientId) return alternateClientId

  const optimisticId = normalizeMessageValue(raw.__optimisticId)
  if (optimisticId.startsWith('opt-')) {
    return optimisticId.slice(4)
  }
  return ''
}

function getRetryMessageKey(message: GatewayMessage): string {
  const clientId = getMessageClientId(message)
  if (clientId) return `client:${clientId}`

  const raw = message as Record<string, unknown>
  const optimisticId = normalizeMessageValue(raw.__optimisticId)
  if (optimisticId) return `optimistic:${optimisticId}`

  const messageId = normalizeMessageValue(raw.id)
  if (messageId) return `id:${messageId}`

  const timestamp = normalizeMessageValue(
    typeof raw.timestamp === 'number' ? String(raw.timestamp) : raw.timestamp,
  )
  const messageText = textFromMessage(message).trim()
  return `fallback:${message.role ?? 'unknown'}:${timestamp}:${messageText}`
}

function isRetryableQueuedMessage(message: GatewayMessage): boolean {
  if ((message.role || '') !== 'user') return false
  const raw = message as Record<string, unknown>
  const status = normalizeMessageValue(raw.status)
  // Only retry on explicit failure states. 'queued' = delivered, '' = confirmed.
  // Previously also triggered on __optimisticId presence, which caused false
  // Retry when history refetch cleared the status field on delivered messages.
  return status === 'sending' || status === 'error'
}

function getMessageRetryAttachments(
  message: GatewayMessage,
): Array<GatewayAttachment> {
  if (!Array.isArray(message.attachments)) return []
  return message.attachments.filter((attachment) => {
    return Boolean(attachment) && typeof attachment === 'object'
  })
}

function stripQueuedWrapperFromUserMessage(message: GatewayMessage): GatewayMessage {
  if (message.role !== 'user') return message

  const text = textFromMessage(message)
  const cleanedText = stripQueuedWrapper(text)
  if (cleanedText === text) return message

  return {
    ...message,
    content: [{ type: 'text', text: cleanedText }],
    text: cleanedText,
    body: cleanedText,
    message: cleanedText,
  }
}

function CompactingOverlay({ onDismiss }: { onDismiss: () => void }) {
  // Auto-dismiss after 30s in case onCompactionEnd never fires
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 30_000)
    return () => window.clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="flex flex-col items-center gap-4 rounded-2xl border border-primary-200/60 bg-primary-50 px-10 py-8 shadow-2xl dark:border-primary-300/20 dark:bg-primary-100"
        onClick={(e) => e.stopPropagation()}
      >
        <BrailleSpinner preset="claw" size={36} className="text-primary-500 dark:text-primary-400" speed={90} />
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">Compacting context</p>
          <p className="mt-0.5 text-xs text-primary-500">Summarizing older messages to free up space…</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-[10px] text-primary-400 hover:text-primary-600 transition-colors"
        >
          dismiss
        </button>
      </div>
    </div>
  )
}

export function ChatScreen({
  activeFriendlyId,
  isNewChat = false,
  onSessionResolved,
  forcedSessionKey,
  compact = false,
}: ChatScreenProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)
  const [_creatingSession, setCreatingSession] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const { headerRef, composerRef, mainRef, pinGroupMinHeight, headerHeight } =
    useChatMeasurements()
  useTapDebug(mainRef, { label: 'chat-main' })
  const [waitingForResponse, setWaitingForResponse] = useState(
    () => hasPendingSend() || hasPendingGeneration(),
  )
  const [liveToolActivity, setLiveToolActivity] = useState<
    Array<{ name: string; timestamp: number }>
  >([])
  const streamTimer = useRef<number | null>(null)
  const streamIdleTimer = useRef<number | null>(null)
  const failsafeTimerRef = useRef<number | null>(null)
  const lastAssistantSignature = useRef('')
  const refreshHistoryRef = useRef<() => void>(() => {})
  const retriedQueuedMessageKeysRef = useRef(new Set<string>())
  const hasSeenGatewayDisconnectRef = useRef(false)
  const hadGatewayErrorRef = useRef(false)
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>(
    [],
  )
  const [isCompacting, setIsCompacting] = useState(false)
  // Per-session thinking level — stored in sessionStorage keyed by session
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(() => {
    if (typeof window === 'undefined') return 'low'
    const key = `clawsuite-thinking-${activeFriendlyId || 'new'}`
    const stored = window.sessionStorage.getItem(key)
    if (stored === 'off' || stored === 'low' || stored === 'adaptive') return stored
    return 'low'
  })
  const { alertOpen, alertThreshold, alertPercent, dismissAlert } =
    useContextAlert()

  const pendingStartRef = useRef(false)
  const composerHandleRef = useRef<ChatComposerHandle | null>(null)
  // Idempotency guard prevents duplicate sends on paste/attach double-fire.
  const lastSendKeyRef = useRef('')
  const lastSendAtRef = useRef(0)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('clawsuite-file-explorer-collapsed')
    return stored === null ? true : stored === 'true'
  })
  const { isMobile } = useChatMobile(queryClient)
  const mobileKeyboardInset = useWorkspaceStore((s) => s.mobileKeyboardInset)
  const mobileComposerFocused = useWorkspaceStore((s) => s.mobileComposerFocused)
  const mobileKeyboardActive = mobileKeyboardInset > 0 || mobileComposerFocused
  void mobileKeyboardActive // kept for future use
  const isAgentViewOpen = useAgentViewStore((state) => state.isOpen)
  const setAgentViewOpen = useAgentViewStore((state) => state.setOpen)
  const isTerminalPanelOpen = useTerminalPanelStore(
    (state) => state.isPanelOpen,
  )
  const terminalPanelHeight = useTerminalPanelStore(
    (state) => state.panelHeight,
  )
  const { renameSession, renaming: renamingSessionTitle } = useRenameSession()
  const sseConnectionState = useGatewayChatStore((s) => s.connectionState)

  const {
    sessionsQuery,
    sessions,
    activeSession,
    activeExists,
    activeSessionKey,
    activeTitle,
    sessionsError,
    sessionsLoading: _sessionsLoading,
    sessionsFetching: _sessionsFetching,
    refetchSessions: _refetchSessions,
  } = useChatSessions({ activeFriendlyId, isNewChat, forcedSessionKey })
  const {
    historyQuery,
    historyMessages,
    messageCount,
    historyError,
    resolvedSessionKey,
    activeCanonicalKey,
    sessionKeyForHistory,
  } = useChatHistory({
    activeFriendlyId,
    activeSessionKey,
    forcedSessionKey,
    isNewChat,
    isRedirecting,
    activeExists,
    sessionsReady: sessionsQuery.isSuccess,
    queryClient,
    historyRefetchInterval: sseConnectionState === 'connected' ? 30_000 : 5_000,
  })

  // Wire SSE realtime stream for instant message delivery
  const {
    messages: realtimeMessages,
    lastCompletedRunAt,
    connectionState,
    isRealtimeStreaming,
    realtimeStreamingText,
    realtimeStreamingThinking,
    completedStreamingText,
    completedStreamingThinking,
    activeToolCalls,
  } = useRealtimeChatHistory({
      sessionKey: resolvedSessionKey || activeCanonicalKey,
      friendlyId: activeFriendlyId,
      historyMessages,
      enabled: !isNewChat && !isRedirecting,
      onUserMessage: useCallback(() => {
        // External message arrived (e.g. from Telegram) — show thinking indicator
        setWaitingForResponse(true)
        setPendingGeneration(true)
      }, []),
      onApprovalRequest: useCallback((payload: Record<string, unknown>) => {
        const gatewayApprovalId =
          typeof payload.id === 'string'
            ? payload.id
            : typeof payload.approvalId === 'string'
              ? payload.approvalId
              : typeof payload.gatewayApprovalId === 'string'
                ? payload.gatewayApprovalId
                : ''

        const currentApprovals = loadApprovals()
        if (
          gatewayApprovalId &&
          currentApprovals.some((entry) => {
            return (
              entry.status === 'pending' &&
              entry.gatewayApprovalId === gatewayApprovalId
            )
          })
        ) {
          setPendingApprovals(
            currentApprovals.filter((entry) => entry.status === 'pending'),
          )
          return
        }

        const actionValue = payload.action ?? payload.tool ?? payload.command
        const action =
          typeof actionValue === 'string'
            ? actionValue
            : actionValue
              ? JSON.stringify(actionValue)
              : 'Tool call requires approval'
        const contextValue = payload.context ?? payload.input ?? payload.args
        const context =
          typeof contextValue === 'string'
            ? contextValue
            : contextValue
              ? JSON.stringify(contextValue)
              : ''
        const agentNameValue = payload.agentName ?? payload.agent ?? payload.source
        const agentName =
          typeof agentNameValue === 'string' && agentNameValue.trim().length > 0
            ? agentNameValue
            : 'Agent'
        const agentIdValue = payload.agentId ?? payload.sessionKey ?? payload.source
        const agentId =
          typeof agentIdValue === 'string' && agentIdValue.trim().length > 0
            ? agentIdValue
            : 'gateway'

        addApproval({
          agentId,
          agentName,
          action,
          context,
          source: 'gateway',
          gatewayApprovalId: gatewayApprovalId || undefined,
        })
        setPendingApprovals(loadApprovals().filter((entry) => entry.status === 'pending'))
      }, []),
      onCompactionStart: useCallback(() => {
        setIsCompacting(true)
      }, []),
      onCompactionEnd: useCallback(() => {
        setIsCompacting(false)
      }, []),
    })

  // Apply smooth character-reveal animation to the raw SSE text
  const smoothRealtimeStreamingText = useSmoothStreamingText(
    realtimeStreamingText,
    isRealtimeStreaming,
  )

  // Keep activity stream open persistently — opens on mount so it's ready
  // before the first tool call fires (avoids connection latency gap).
  const waitingForResponseRef = useRef(waitingForResponse)
  useEffect(() => { waitingForResponseRef.current = waitingForResponse }, [waitingForResponse])

  useEffect(() => {
    const events = new EventSource('/api/events')
    const onActivity = (event: MessageEvent) => {
      // Only populate pills while waiting — but connection stays warm always
      if (!waitingForResponseRef.current) return
      try {
        const payload = JSON.parse(event.data) as {
          type?: unknown
          title?: unknown
        }
        if (payload.type !== 'tool' || typeof payload.title !== 'string') {
          return
        }
        const name = payload.title
          .replace(/^Tool activity:\s*/i, '')
          .trim()
        if (!name) return
        setLiveToolActivity((prev) => {
          const filtered = prev.filter((entry) => entry.name !== name)
          return [{ name, timestamp: Date.now() }, ...filtered].slice(0, 5)
        })
      } catch {
        // Ignore malformed activity events.
      }
    }
    events.addEventListener('activity', onActivity)
    return () => {
      events.removeEventListener('activity', onActivity)
      events.close()
    }
  }, []) // mount only — stays open for session lifetime

  // Clear tool pills after response arrives (with brief delay so last pill is visible)
  useEffect(() => {
    if (waitingForResponse) return
    const timer = window.setTimeout(() => setLiveToolActivity([]), 800)
    return () => window.clearTimeout(timer)
  }, [waitingForResponse])

  useEffect(() => {
    function checkApprovals() {
      const all = loadApprovals()
      setPendingApprovals(all.filter((entry) => entry.status === 'pending'))
    }
    checkApprovals()
    const id = window.setInterval(checkApprovals, 2000)
    return () => window.clearInterval(id)
  }, [])

  const resolvePendingApproval = useCallback(
    async (approval: ApprovalRequest, status: 'approved' | 'denied') => {
      const nextApprovals = loadApprovals().map((entry) => {
        if (entry.id !== approval.id) return entry
        return {
          ...entry,
          status,
          resolvedAt: Date.now(),
        }
      })
      saveApprovals(nextApprovals)
      setPendingApprovals(
        nextApprovals.filter((entry) => entry.status === 'pending'),
      )
      if (!approval.gatewayApprovalId) return

      const endpoint =
        status === 'approved'
          ? `/api/approvals/${approval.gatewayApprovalId}/approve`
          : `/api/approvals/${approval.gatewayApprovalId}/deny`
      try {
        await fetch(endpoint, { method: 'POST' })
      } catch {
        // Local resolution still succeeds when API endpoint is unavailable.
      }
    },
    [],
  )

  // Use realtime-merged messages for display (SSE + history)
  // Re-apply display filter to realtime messages
  const finalDisplayMessages = useMemo(() => {
    // Rebuild display filter on merged messages
    const filtered = realtimeMessages.filter((msg) => {
      if (msg.role === 'user') {
        const text = stripQueuedWrapper(textFromMessage(msg))
        if (text.startsWith('A subagent task')) return false
        return true
      }
      if (msg.role === 'assistant') {
        if (msg.__streamingStatus === 'streaming') return true
        if ((msg as any).__optimisticId && !msg.content?.length) return true
        const content = msg.content
        if (!content || !Array.isArray(content)) return false
        if (content.length === 0) return false
        const hasText = content.some(
          (c) =>
            c.type === 'text' &&
            typeof c.text === 'string' &&
            c.text.trim().length > 0,
        )
        return hasText
      }
      return false
    })
    // Dedup: SSE + history merge can produce duplicates (optimistic + SSE).
    // Prefer stable identifiers (id/messageId/clientId/nonce), then fallback signature.
    // Bug 1 fix: also normalise clientId so that an optimistic message (key =
    // "opt-<uuid>") and the server's confirmed copy (key = clientId "<uuid>")
    // collapse to the same dedup slot, preferring the non-optimistic copy.
    //
    // Strategy:
    //   1. Collect all candidate IDs, including extracting the bare UUID from
    //      "__optimisticId" (strip the "opt-" prefix).
    //   2. For each candidate key, mark it seen. The first message wins.
    //   3. Before filtering, sort so that non-optimistic messages (server
    //      confirmed, have a real .id) come before optimistic ones — this way
    //      the server copy wins the dedup race.
    const sortedForDedup = [...filtered].sort((a, b) => {
      const aRaw = a as Record<string, unknown>
      const bRaw = b as Record<string, unknown>
      const aIsOptimistic =
        normalizeMessageValue(aRaw.__optimisticId).startsWith('opt-') &&
        !normalizeMessageValue(aRaw.id)
      const bIsOptimistic =
        normalizeMessageValue(bRaw.__optimisticId).startsWith('opt-') &&
        !normalizeMessageValue(bRaw.id)
      if (aIsOptimistic && !bIsOptimistic) return 1
      if (!aIsOptimistic && bIsOptimistic) return -1
      return 0
    })
    const seen = new Set<string>()
    const dedupedSet = new Set<GatewayMessage>()
    for (const msg of sortedForDedup) {
      const raw = msg as Record<string, unknown>
      const rawOptimisticId = normalizeMessageValue(raw.__optimisticId)
      // Bare UUID from optimistic id — strips "opt-" prefix so that the
      // optimistic and confirmed copies share the same dedup key.
      const bareOptimisticUuid = rawOptimisticId.startsWith('opt-')
        ? rawOptimisticId.slice(4)
        : ''
      const idCandidates = [
        normalizeMessageValue(raw.id),
        normalizeMessageValue(raw.messageId),
        normalizeMessageValue(raw.clientId),
        normalizeMessageValue(raw.client_id),
        normalizeMessageValue(raw.nonce),
        normalizeMessageValue(raw.idempotencyKey),
        bareOptimisticUuid,
        rawOptimisticId,
      ].filter(Boolean)

      const primaryKey =
        idCandidates.length > 0
          ? `${msg.role}:id:${idCandidates[0]}`
          : `${msg.role}:fallback:${messageFallbackSignature(msg)}`

      if (seen.has(primaryKey)) continue

      // Text-based dedup for ALL messages: the realtime version (from SSE done
      // event) and the history version (from API refetch) may have different IDs
      // or no IDs at all, causing ID-based dedup to miss. Normalised text
      // catches the overlap regardless of message shape or ID availability.
      {
        const text = stripQueuedWrapper(textFromMessage(msg)).trim()
        if (text.length > 0) {
          // Normalize all whitespace (newlines, tabs, multiple spaces) to a
          // single space before comparing.  The gateway may collapse \n to
          // spaces when echoing back, causing the optimistic (with newlines)
          // and the echo (with spaces) to have different raw text.
          const normalizedText = text.replace(/\s+/g, ' ')
          const textKey = `${msg.role}:text:${normalizedText}`
          if (seen.has(textKey)) continue
          seen.add(textKey)
        }
      }

      seen.add(primaryKey)
      // Register all candidate keys so later messages that share any ID are
      // collapsed (handles the optimistic-nonce = server-clientId overlap).
      for (const candidate of idCandidates.slice(1)) {
        seen.add(`${msg.role}:id:${candidate}`)
      }
      dedupedSet.add(msg)
    }
    // Restore original order (filtered array order, not sort order).
    const deduped = filtered
      .filter((msg) => dedupedSet.has(msg))
      .map((msg) => stripQueuedWrapperFromUserMessage(msg))

    // Only inject the streaming placeholder when SSE streaming is actually
    // active. The ThinkingBubble (in chat-message-list) handles the visual
    // indicator during the waitingForResponse phase before SSE starts.
    //
    // Previous bug: gating on `!waitingForResponse` caused a phantom streaming
    // placeholder to be injected after `done` cleared streamingState but before
    // waitingForResponse was cleared, leading to a race where the real response
    // flashed then disappeared when history refetched.
    if (!isRealtimeStreaming) {
      return deduped
    }

    // Always inject the streaming placeholder as soon as isRealtimeStreaming is
    // true — do NOT gate on realtimeStreamingText.trim().length > 0.
    //
    // Gating on text content breaks word-by-word streaming because:
    //   1. React batches state updates, so multiple chunks arrive before the
    //      placeholder even mounts.
    //   2. Each mount/unmount resets MessageItem's internal reveal timer,
    //      causing all accumulated text to display at once instead of
    //      streaming word by word.
    //
    // Visual blank-box problem is solved differently:
    //   • The placeholder is always mounted (DOM node stays alive, timer persists).
    //   • When text is empty the chat-message-list wraps it with opacity:0 so
    //     nothing is visually shown.
    //   • ThinkingBubble stays visible via the `streamingButEmpty` condition in
    //     showTypingIndicator (isStreaming && !streamingText).
    //   • First chunk arrives → opacity:1 → text streams word-by-word.
    //   • ThinkingBubble hides once streamingText has content.

    const nextMessages = [...deduped]
    const streamToolCalls = activeToolCalls.map((toolCall) => ({
      ...toolCall,
      phase: toolCall.phase,
    }))

    const streamingMsg = {
      role: 'assistant',
      content: [],
      __optimisticId: 'streaming-current',
      __streamingStatus: 'streaming',
      __streamingText: realtimeStreamingText,
      __streamingThinking: realtimeStreamingThinking,
      __streamToolCalls: streamToolCalls,
    } as GatewayMessage

    const existingStreamIdx = nextMessages.findIndex(
      (message) => message.__streamingStatus === 'streaming',
    )

    if (existingStreamIdx >= 0) {
      // Always update the existing placeholder — never remove it while streaming.
      // Removing it resets the reveal timer and causes batched/all-at-once display.
      nextMessages[existingStreamIdx] = {
        ...nextMessages[existingStreamIdx],
        ...streamingMsg,
      }
      return nextMessages
    }

    // Insert streaming message after the last user message to prevent
    // user messages appearing after the assistant response (race condition)
    const lastUserIdx = nextMessages.reduce(
      (lastIdx, msg, idx) => (msg.role === 'user' ? idx : lastIdx),
      -1,
    )
    if (lastUserIdx >= 0 && lastUserIdx === nextMessages.length - 1) {
      // User message is last — append streaming after it (normal case)
      nextMessages.push(streamingMsg)
    } else if (lastUserIdx >= 0) {
      // User message is NOT last — insert streaming right after it
      nextMessages.splice(lastUserIdx + 1, 0, streamingMsg)
    } else {
      nextMessages.push(streamingMsg)
    }
    return nextMessages
  }, [
    activeToolCalls,
    isRealtimeStreaming,
    realtimeMessages,
    realtimeStreamingText,
    realtimeStreamingThinking,
  ])

  // Derive streaming state from realtime SSE state (bug #2 fix)
  const derivedStreamingInfo = useMemo(() => {
    // Use actual realtime streaming state when available
    if (isRealtimeStreaming) {
      const last = finalDisplayMessages[finalDisplayMessages.length - 1]
      const id = last?.role === 'assistant'
        ? ((last as any).__optimisticId || (last as any).id || null)
        : null
      return { isStreaming: true, streamingMessageId: id }
    }
    // Fallback: waiting for response + last message is assistant
    if (waitingForResponse && finalDisplayMessages.length > 0) {
      const last = finalDisplayMessages[finalDisplayMessages.length - 1]
      if (last && last.role === 'assistant') {
        const id = (last as any).__optimisticId || (last as any).id || null
        return { isStreaming: true, streamingMessageId: id }
      }
    }
    return { isStreaming: false, streamingMessageId: null as string | null }
  }, [waitingForResponse, finalDisplayMessages, isRealtimeStreaming])

  // --- Stream management ---
  const streamStop = useCallback(() => {
    if (streamTimer.current) {
      window.clearTimeout(streamTimer.current)
      streamTimer.current = null
    }
    if (streamIdleTimer.current) {
      window.clearTimeout(streamIdleTimer.current)
      streamIdleTimer.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      streamStop()
      if (failsafeTimerRef.current) {
        window.clearTimeout(failsafeTimerRef.current)
        failsafeTimerRef.current = null
      }
    }
  }, [streamStop])

  const streamFinish = useCallback(() => {
    streamStop()
    if (failsafeTimerRef.current) {
      window.clearTimeout(failsafeTimerRef.current)
      failsafeTimerRef.current = null
    }
    setPendingGeneration(false)
    setWaitingForResponse(false)
  }, [streamStop])

  const streamStart = useCallback(() => {
    if (!activeFriendlyId || isNewChat) return
    // Bug #3 fix: no more 350ms polling loop — SSE handles realtime updates.
    // Single delayed fetch as fallback to catch the initial response.
    if (streamTimer.current) window.clearTimeout(streamTimer.current)
    streamTimer.current = window.setTimeout(() => {
      refreshHistoryRef.current()
    }, 2000)
  }, [activeFriendlyId, isNewChat])

  refreshHistoryRef.current = function refreshHistory() {
    if (historyQuery.isFetching) return
    void historyQuery.refetch()
  }

  // Track message count when waiting started — only clear when NEW assistant msg appears
  const messageCountAtSendRef = useRef(0)

  useEffect(() => {
    if (waitingForResponse) {
      messageCountAtSendRef.current = finalDisplayMessages.length
    }
  }, [waitingForResponse]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear waitingForResponse when a NEW assistant message appears after send
  // Use a ref to prevent the cleanup/restart race condition
  const clearTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (!waitingForResponse) {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
      return
    }
    // Only check if display has grown since we sent
    if (finalDisplayMessages.length <= messageCountAtSendRef.current) return
    const last = finalDisplayMessages[finalDisplayMessages.length - 1]
    if (last && last.role === 'assistant') {
      // Already scheduled? Don't restart
      if (clearTimerRef.current) return
      clearTimerRef.current = window.setTimeout(() => {
        clearTimerRef.current = null
        streamFinish()
      }, 50) // Tiny delay to let React render the message first
    }
  }, [finalDisplayMessages.length, waitingForResponse, streamFinish])

  // Failsafe: clear after done event + 10s if response never shows in display
  useEffect(() => {
    if (lastCompletedRunAt && waitingForResponse) {
      const timer = window.setTimeout(() => streamFinish(), 10000)
      return () => window.clearTimeout(timer)
    }
  }, [lastCompletedRunAt, waitingForResponse, streamFinish])

  // Hard failsafe: if waiting for 5s+ and SSE missed the done event, refetch history
  useEffect(() => {
    if (!waitingForResponse) return
    const fallback = window.setTimeout(() => {
      refreshHistoryRef.current()
    }, 5000)
    return () => window.clearTimeout(fallback)
  }, [waitingForResponse])

  useAutoSessionTitle({
    friendlyId: activeFriendlyId,
    sessionKey: resolvedSessionKey,
    activeSession,
    messages: historyMessages,
    messageCount,
    enabled:
      !isNewChat && Boolean(resolvedSessionKey) && historyQuery.isSuccess,
  })


  // Phase 4.1: Smart Model Suggestions
  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const res = await fetch('/api/models')
      if (!res.ok) return { models: [] }
      const data = await res.json()
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const currentModelQuery = useQuery({
    queryKey: ['gateway', 'session-status-model'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/session-status')
        if (!res.ok) return ''
        const data = await res.json()
        const payload = data.payload ?? data
        // Same logic as chat-composer: read model from status payload
        if (payload.model) return String(payload.model)
        if (payload.currentModel) return String(payload.currentModel)
        if (payload.modelAlias) return String(payload.modelAlias)
        if (payload.resolved?.modelProvider && payload.resolved?.model) {
          return `${payload.resolved.modelProvider}/${payload.resolved.model}`
        }
        return ''
      } catch {
        return ''
      }
    },
    refetchInterval: 30_000,
    retry: false,
  })

  const availableModelIds = useMemo(() => {
    const models = modelsQuery.data?.models || []
    return models.map((m: any) => m.id).filter((id: string) => id)
  }, [modelsQuery.data])

  const currentModel = currentModelQuery.data || ''

  // Ref so sendMessage can always read latest thinkingLevel without being in deps
  const thinkingLevelRef = useRef<ThinkingLevel>(thinkingLevel)
  useEffect(() => { thinkingLevelRef.current = thinkingLevel }, [thinkingLevel])

  // Auto-upgrade thinking to adaptive for Claude 4.6 when session first loads
  const thinkingInitializedRef = useRef(false)
  useEffect(() => {
    if (!currentModel) return
    if (thinkingInitializedRef.current) return
    thinkingInitializedRef.current = true
    const is46 = currentModel.toLowerCase().includes('4-6') || currentModel.toLowerCase().includes('claude-4.6')
    if (is46) {
      const key = `clawsuite-thinking-${activeFriendlyId || 'new'}`
      const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null
      // Only auto-set if not explicitly configured
      if (!stored) {
        setThinkingLevel('adaptive')
      }
    }
  }, [currentModel, activeFriendlyId])

  // Persist thinking level changes to sessionStorage
  const handleThinkingLevelChange = useCallback((level: ThinkingLevel) => {
    setThinkingLevel(level)
    if (typeof window !== 'undefined') {
      const key = `clawsuite-thinking-${activeFriendlyId || 'new'}`
      window.sessionStorage.setItem(key, level)
    }
  }, [activeFriendlyId])

  const { suggestion, dismiss, dismissForSession } = useModelSuggestions({
    currentModel, // Real model from session-status (fail closed if empty)
    sessionKey: resolvedSessionKey || 'main',
    messages: historyMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: textFromMessage(m),
    })) as any,
    availableModels: availableModelIds,
  })

  const handleSwitchModel = useCallback(async () => {
    if (!suggestion) return

    try {
      const res = await fetch('/api/model-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: resolvedSessionKey || 'main',
          model: suggestion.suggestedModel,
        }),
      })

      if (res.ok) {
        dismiss()
        // Optionally show success toast or update UI
      }
    } catch (err) {
      setError(
        `Failed to switch model. ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }, [suggestion, resolvedSessionKey, dismiss])

  // Sync chat activity to global store for sidebar orchestrator avatar
  const setLocalActivity = useChatActivityStore((s) => s.setLocalActivity)
  useEffect(() => {
    if (liveToolActivity.length > 0) {
      setLocalActivity('tool-use')
    } else if (isRealtimeStreaming) {
      setLocalActivity('responding')
    } else if (waitingForResponse) {
      setLocalActivity('thinking')
    } else {
      setLocalActivity('idle')
    }
  }, [waitingForResponse, isRealtimeStreaming, liveToolActivity, setLocalActivity])

  const gatewayStatusQuery = useQuery({
    queryKey: ['gateway', 'status'],
    queryFn: fetchGatewayStatus,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 30_000,
    refetchInterval: 60_000, // Re-check every 60s to clear stale errors
  })
  // Don't show gateway errors for new chats or when SSE is connected (proves gateway works)
  const gatewayStatusError =
    !isNewChat && connectionState !== 'connected'
      ? gatewayStatusQuery.error instanceof Error
        ? {
            message: gatewayStatusQuery.error.message,
            status: (gatewayStatusQuery.error as Error & { status?: number })
              .status,
          }
        : gatewayStatusQuery.data && !gatewayStatusQuery.data.ok
          ? {
              message: gatewayStatusQuery.data.error || 'Gateway unavailable',
              status: gatewayStatusQuery.data.status,
            }
          : null
      : null
  const gatewayError = gatewayStatusError?.message ?? sessionsError ?? historyError
  const gatewayErrorStatus = gatewayStatusError?.status
  const showErrorNotice = Boolean(gatewayError) && !isNewChat
  const handleGatewayRefetch = useCallback(() => {
    void gatewayStatusQuery.refetch()
    void sessionsQuery.refetch()
    void historyQuery.refetch()
  }, [gatewayStatusQuery, sessionsQuery, historyQuery])

  const handleRefreshHistory = useCallback(() => {
    void historyQuery.refetch()
  }, [historyQuery])

  useEffect(() => {
    const handleRefreshRequest = () => {
      void historyQuery.refetch()
    }
    window.addEventListener('clawsuite:chat-refresh', handleRefreshRequest)
    return () => {
      window.removeEventListener('clawsuite:chat-refresh', handleRefreshRequest)
    }
  }, [historyQuery])

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        void historyQuery.refetch()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [historyQuery])

  useEffect(() => {
    function handleSSEDrop() {
      void historyQuery.refetch()
    }
    window.addEventListener('clawsuite:sse-dropped', handleSSEDrop)
    return () => {
      window.removeEventListener('clawsuite:sse-dropped', handleSSEDrop)
    }
  }, [historyQuery])

  const terminalPanelInset =
    !isMobile && isTerminalPanelOpen ? terminalPanelHeight : 0
  // --chat-composer-height is the measured offsetHeight of the composer wrapper,
  // which already includes its own paddingBottom (tab bar + safe area).
  // So content just needs composer-height + a small breathing gap.
  const mobileScrollBottomOffset = useMemo(() => {
    if (!isMobile) return 0
    return 'var(--chat-composer-height, 56px)'
  }, [isMobile])

  // Keep message list clear of composer, keyboard, and desktop terminal panel.
  const stableContentStyle = useMemo<React.CSSProperties>(() => {
    if (isMobile) {
      return {
        paddingBottom: 'calc(var(--chat-composer-height, 56px) + 8px)',
      }
    }
    return {
      paddingBottom:
        terminalPanelInset > 0
          ? `${terminalPanelInset + 16}px`
          : '16px',
    }
  }, [isMobile, terminalPanelInset])

  const shouldRedirectToNew =
    !isNewChat &&
    !forcedSessionKey &&
    !isRecentSession(activeFriendlyId) &&
    sessionsQuery.isSuccess &&
    sessions.length > 0 &&
    !sessions.some((session) => session.friendlyId === activeFriendlyId) &&
    !historyQuery.isFetching &&
    !historyQuery.isSuccess

  useEffect(() => {
    if (isRedirecting) {
      if (error) setError(null)
      return
    }
    if (shouldRedirectToNew) {
      if (error) setError(null)
      return
    }
    if (
      sessionsQuery.isSuccess &&
      !activeExists &&
      !sessionsError &&
      !historyError
    ) {
      if (error) setError(null)
      return
    }
    const messageText =
      sessionsError ?? historyError ?? gatewayStatusError?.message
    if (!messageText) {
      if (error?.startsWith('Failed to load')) {
        setError(null)
      }
      return
    }
    if (isMissingGatewayAuth(messageText)) {
      navigate({ to: '/connect', replace: true })
    }
    const message = sessionsError
      ? `Failed to load sessions. ${sessionsError}`
      : historyError
        ? `Failed to load history. ${historyError}`
        : gatewayStatusError
          ? `Gateway unavailable. ${gatewayStatusError.message}`
          : null
    if (message) setError(message)
  }, [
    activeExists,
    error,
    gatewayStatusError,
    historyError,
    isRedirecting,
    navigate,
    sessionsError,
    sessionsQuery.isSuccess,
    shouldRedirectToNew,
  ])

  useEffect(() => {
    if (!isRedirecting) return
    if (isNewChat) {
      setIsRedirecting(false)
      return
    }
    if (!shouldRedirectToNew && sessionsQuery.isSuccess) {
      setIsRedirecting(false)
    }
  }, [isNewChat, isRedirecting, sessionsQuery.isSuccess, shouldRedirectToNew])

  useEffect(() => {
    if (isNewChat) return
    if (!sessionsQuery.isSuccess) return
    if (sessions.length === 0) return
    if (!shouldRedirectToNew) return
    resetPendingSend()
    clearHistoryMessages(queryClient, activeFriendlyId, sessionKeyForHistory)
    navigate({ to: '/new', replace: true })
  }, [
    activeFriendlyId,
    historyQuery.isFetching,
    historyQuery.isSuccess,
    isNewChat,
    navigate,
    queryClient,
    sessionKeyForHistory,
    sessions,
    sessionsQuery.isSuccess,
    shouldRedirectToNew,
  ])

  const hideUi = shouldRedirectToNew || isRedirecting
  const showComposer = !isRedirecting

  // Reset state when session changes
  useEffect(() => {
    const resetKey = isNewChat ? 'new' : activeFriendlyId
    if (!resetKey) return
    retriedQueuedMessageKeysRef.current.clear()
    if (pendingStartRef.current) {
      pendingStartRef.current = false
      return
    }
    if (hasPendingSend() || hasPendingGeneration()) {
      setWaitingForResponse(true)
      return
    }
    streamStop()
    lastAssistantSignature.current = ''
    setWaitingForResponse(false)
  }, [activeFriendlyId, isNewChat, streamStop])

  /**
   * Simplified sendMessage - fire and forget.
   * Response arrives via SSE stream, not via this function.
   */
  const sendMessage = useCallback(
    function sendMessage(
      sessionKey: string,
      friendlyId: string,
      body: string,
      attachments: Array<GatewayAttachment> = [],
      skipOptimistic = false,
      existingClientId = '',
    ) {
      // Read from ref so we always get the latest value without capturing it in deps
      const currentThinkingLevel = thinkingLevelRef.current
      setLocalActivity('reading')
      const normalizedAttachments = attachments.map((attachment) => ({
        ...attachment,
        id: attachment.id ?? crypto.randomUUID(),
      }))

    // Inject text/file attachment content directly into the message body.
    // Gateways reliably forward text in the message body; file attachments
    // may be silently dropped for non-image types.
      const textBlocks = normalizedAttachments
        .filter((a) => {
          const mime =
            normalizeMimeType(a.contentType ?? '') ||
            readDataUrlMimeType(a.dataUrl ?? '')
          return !isImageMimeType(mime) && (a.dataUrl ?? '').length > 0
        })
        .map((a) => {
          const raw = a.dataUrl ?? ''
          const content = raw.startsWith('data:')
            ? atob(raw.split(',')[1] ?? '')
            : raw
          return `\n\n<attachment name="${a.name ?? 'file'}">\n${content}\n</attachment>`
        })
      const enrichedBody = body + textBlocks.join('')

      let optimisticClientId = existingClientId
      if (!skipOptimistic) {
        const { clientId, optimisticMessage } = createOptimisticMessage(
          body,
          normalizedAttachments,
        )
        optimisticClientId = clientId
        appendHistoryMessage(
          queryClient,
          friendlyId,
          sessionKey,
          optimisticMessage,
        )
        updateSessionLastMessage(
          queryClient,
          sessionKey,
          friendlyId,
          optimisticMessage,
        )
      }

      setPendingGeneration(true)
      setSending(true)
      setError(null)
      setWaitingForResponse(true)

      // Failsafe: clear waitingForResponse after 120s no matter what
      // Prevents infinite spinner if SSE/idle detection both fail
      if (failsafeTimerRef.current) {
        window.clearTimeout(failsafeTimerRef.current)
      }
      failsafeTimerRef.current = window.setTimeout(() => {
        streamFinish()
      }, 120_000)

      // Send a compatibility shape for gateway attachment parsing.
      // Different gateway/channel versions read different keys.
      const payloadAttachments = normalizedAttachments.map((attachment) => {
        const mimeType =
          normalizeMimeType(attachment.contentType) ||
          readDataUrlMimeType(attachment.dataUrl)
        const isImage = isImageMimeType(mimeType)
        // For text/file attachments, dataUrl holds raw text (not a base64 data URL).
        // We must base64-encode it so the server can build a valid data: URI.
        const rawDataUrl = attachment.dataUrl ?? ''
        let encodedContent: string
        let finalDataUrl: string
        if (!isImage && !rawDataUrl.startsWith('data:')) {
          encodedContent = btoa(unescape(encodeURIComponent(rawDataUrl)))
          finalDataUrl = mimeType
            ? `data:${mimeType};base64,${encodedContent}`
            : `data:text/plain;base64,${encodedContent}`
        } else {
          encodedContent = stripDataUrlPrefix(rawDataUrl)
          finalDataUrl = rawDataUrl
        }
        return {
          id: attachment.id,
          name: attachment.name,
          fileName: attachment.name,
          contentType: mimeType || undefined,
          mimeType: mimeType || undefined,
          mediaType: mimeType || undefined,
          type: isImage ? 'image' : 'file',
          content: encodedContent,
          data: encodedContent,
          base64: encodedContent,
          dataUrl: finalDataUrl,
          size: attachment.size,
        }
      })

      fetch('/api/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey,
          friendlyId,
          message: enrichedBody,
          attachments:
            payloadAttachments.length > 0 ? payloadAttachments : undefined,
          thinking: currentThinkingLevel === 'off' ? undefined : currentThinkingLevel,
          idempotencyKey: optimisticClientId || crypto.randomUUID(),
          clientId: optimisticClientId || undefined,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            let errorText = `HTTP ${res.status}`
            try {
              errorText = await readError(res)
            } catch {
              /* ignore parse errors */
            }
            throw new Error(errorText)
          }
          // Stream setup is separate — don't let it trigger send failure
          try {
            streamStart()
          } catch (e) {
            if (import.meta.env.DEV)
              console.warn('[chat] streamStart error (non-fatal):', e)
          }
          if (failsafeTimerRef.current) {
            window.clearTimeout(failsafeTimerRef.current)
            failsafeTimerRef.current = null
          }
          // Message successfully delivered to gateway — mark as queued so
          // isStuckSending doesn't fire a false "Retry" while waiting for response.
          if (optimisticClientId) {
            updateHistoryMessageByClientId(
              queryClient,
              friendlyId,
              sessionKey,
              optimisticClientId,
              (message) => ({ ...message, status: 'queued' }),
            )
          }
          setSending(false)
        })
        .catch((err: unknown) => {
          if (failsafeTimerRef.current) {
            window.clearTimeout(failsafeTimerRef.current)
            failsafeTimerRef.current = null
          }
          setSending(false)
          const messageText = err instanceof Error ? err.message : String(err)
          if (isMissingGatewayAuth(messageText)) {
            try {
              navigate({ to: '/connect', replace: true })
            } catch {
              /* router not ready */
            }
            return
          }
          // Only mark as failed for actual network/API errors
          if (optimisticClientId) {
            updateHistoryMessageByClientId(
              queryClient,
              friendlyId,
              sessionKey,
              optimisticClientId,
              function markFailed(message) {
                return { ...message, status: 'error' }
              },
            )
          }
          const errorMessage = `Failed to send message. ${messageText}`
          setError(errorMessage)
          toast('Failed to send message', { type: 'error' })
          setPendingGeneration(false)
          setWaitingForResponse(false)
        })
    },
    [navigate, queryClient, setLocalActivity, streamFinish, streamStart],
  )

  useLayoutEffect(() => {
    if (isNewChat) return
    const pending = consumePendingSend(
      forcedSessionKey || resolvedSessionKey || activeSessionKey,
      activeFriendlyId,
    )
    if (!pending) return
    pendingStartRef.current = true
    const historyKey = chatQueryKeys.history(
      pending.friendlyId,
      pending.sessionKey,
    )
    const cached = queryClient.getQueryData(historyKey)
    const cachedMessages = Array.isArray((cached as any)?.messages)
      ? (cached as any).messages
      : []
    const alreadyHasOptimistic = cachedMessages.some((message: any) => {
      if (pending.optimisticMessage.clientId) {
        if (message.clientId === pending.optimisticMessage.clientId) return true
        if (message.__optimisticId === pending.optimisticMessage.clientId)
          return true
      }
      if (pending.optimisticMessage.__optimisticId) {
        if (message.__optimisticId === pending.optimisticMessage.__optimisticId)
          return true
      }
      return false
    })
    if (!alreadyHasOptimistic) {
      appendHistoryMessage(
        queryClient,
        pending.friendlyId,
        pending.sessionKey,
        pending.optimisticMessage,
      )
    }
    setWaitingForResponse(true)
    sendMessage(
      pending.sessionKey,
      pending.friendlyId,
      pending.message,
      pending.attachments,
      true,
      typeof pending.optimisticMessage.clientId === 'string'
        ? pending.optimisticMessage.clientId
        : '',
    )
  }, [
    activeFriendlyId,
    activeSessionKey,
    forcedSessionKey,
    isNewChat,
    queryClient,
    resolvedSessionKey,
    sendMessage,
  ])

  const retryQueuedMessage = useCallback(
    function retryQueuedMessage(message: GatewayMessage, mode: 'manual' | 'auto') {
      if (!isRetryableQueuedMessage(message)) return false

      const body = textFromMessage(message).trim()
      const attachments = getMessageRetryAttachments(message)
      if (body.length === 0 && attachments.length === 0) return false

      const retryKey = getRetryMessageKey(message)
      if (mode === 'auto' && retriedQueuedMessageKeysRef.current.has(retryKey)) {
        return false
      }

      const sessionKeyForSend =
        forcedSessionKey || resolvedSessionKey || activeSessionKey || 'main'
      const sessionKeyForMessage = sessionKeyForHistory || sessionKeyForSend
      const existingClientId = getMessageClientId(message)

      if (existingClientId) {
        updateHistoryMessageByClientId(
          queryClient,
          activeFriendlyId,
          sessionKeyForMessage,
          existingClientId,
          function markSending(currentMessage) {
            return { ...currentMessage, status: 'sending' }
          },
        )
      }

      if (mode === 'auto') {
        retriedQueuedMessageKeysRef.current.add(retryKey)
      }

      sendMessage(
        sessionKeyForSend,
        activeFriendlyId,
        body,
        attachments,
        true,
        existingClientId,
      )
      return true
    },
    [
      activeFriendlyId,
      activeSessionKey,
      forcedSessionKey,
      queryClient,
      resolvedSessionKey,
      sessionKeyForHistory,
      sendMessage,
    ],
  )

  const flushRetryableMessages = useCallback(
    function flushRetryableMessages() {
      for (const message of finalDisplayMessages) {
        retryQueuedMessage(message, 'auto')
      }
    },
    [finalDisplayMessages, retryQueuedMessage],
  )

  const handleRetryMessage = useCallback(
    function handleRetryMessage(message: GatewayMessage) {
      const retryKey = getRetryMessageKey(message)
      retriedQueuedMessageKeysRef.current.delete(retryKey)
      retryQueuedMessage(message, 'manual')
    },
    [retryQueuedMessage],
  )

  useEffect(() => {
    if (connectionState === 'error' || connectionState === 'disconnected') {
      hasSeenGatewayDisconnectRef.current = true
      retriedQueuedMessageKeysRef.current.clear()
      return
    }

    if (connectionState === 'connected' && hasSeenGatewayDisconnectRef.current) {
      hasSeenGatewayDisconnectRef.current = false
      flushRetryableMessages()
    }
  }, [connectionState, flushRetryableMessages])

  useEffect(() => {
    if (gatewayStatusError) {
      hadGatewayErrorRef.current = true
      retriedQueuedMessageKeysRef.current.clear()
      return
    }

    const isGatewayHealthy = gatewayStatusQuery.data?.ok === true
    if (isGatewayHealthy && hadGatewayErrorRef.current) {
      hadGatewayErrorRef.current = false
      flushRetryableMessages()
    }
  }, [flushRetryableMessages, gatewayStatusError, gatewayStatusQuery.data])

  useEffect(() => {
    function handleGatewayHealthRestored() {
      retriedQueuedMessageKeysRef.current.clear()
      hadGatewayErrorRef.current = false
      flushRetryableMessages()
      handleGatewayRefetch()
    }

    window.addEventListener('gateway:health-restored', handleGatewayHealthRestored)
    return () => {
      window.removeEventListener(
        'gateway:health-restored',
        handleGatewayHealthRestored,
      )
    }
  }, [flushRetryableMessages, handleGatewayRefetch])

  const createSessionForMessage = useCallback(
    async (preferredFriendlyId?: string) => {
      setCreatingSession(true)
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            preferredFriendlyId && preferredFriendlyId.trim().length > 0
              ? { friendlyId: preferredFriendlyId }
              : {},
          ),
        })
        if (!res.ok) throw new Error(await readError(res))

        const data = (await res.json()) as {
          sessionKey?: string
          friendlyId?: string
        }

        const sessionKey =
          typeof data.sessionKey === 'string' ? data.sessionKey : ''
        const friendlyId =
          typeof data.friendlyId === 'string' &&
          data.friendlyId.trim().length > 0
            ? data.friendlyId.trim()
            : (preferredFriendlyId?.trim() ?? '') ||
              deriveFriendlyIdFromKey(sessionKey)

        if (!sessionKey || !friendlyId) {
          throw new Error('Invalid session response')
        }

        queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
        return { sessionKey, friendlyId }
      } finally {
        setCreatingSession(false)
      }
    },
    [queryClient],
  )

  const upsertSessionInCache = useCallback(
    (friendlyId: string, lastMessage: GatewayMessage) => {
      if (!friendlyId) return
      queryClient.setQueryData(
        chatQueryKeys.sessions,
        function upsert(existing: unknown) {
          const sessions = Array.isArray(existing)
            ? (existing as Array<SessionMeta>)
            : []
          const now = Date.now()
          const existingIndex = sessions.findIndex((session) => {
            return (
              session.friendlyId === friendlyId || session.key === friendlyId
            )
          })

          if (existingIndex === -1) {
            return [
              {
                key: friendlyId,
                friendlyId,
                updatedAt: now,
                lastMessage,
                titleStatus: 'idle',
              },
              ...sessions,
            ]
          }

          return sessions.map((session, index) => {
            if (index !== existingIndex) return session
            return {
              ...session,
              updatedAt: now,
              lastMessage,
            }
          })
        },
      )
    },
    [queryClient],
  )

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = document.querySelector('[data-chat-scroll-viewport]') as HTMLElement | null
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior })
    }
  }, [])

  const send = useCallback(
    (
      body: string,
      attachments: Array<ChatComposerAttachment>,
      helpers: ChatComposerHelpers,
    ) => {
      const trimmedBody = body.trim()
      if (trimmedBody.length === 0 && attachments.length === 0) return

      // Deduplicate sends with identical content within a 500ms window.
      // This prevents double-fire from paste events that trigger multiple send paths.
      const sendKey = `${trimmedBody}|${attachments.map((a) => `${a.name}:${a.size}`).join(',')}`
      const now = Date.now()
      if (sendKey === lastSendKeyRef.current && now - lastSendAtRef.current < 500) return
      lastSendKeyRef.current = sendKey
      lastSendAtRef.current = now

      // Haptic feedback on mobile when message is sent
      if (isMobile) hapticTap()

      helpers.reset()

      // Scroll to bottom immediately so user sees their message + incoming response
      requestAnimationFrame(() => scrollChatToBottom('smooth'))

      const attachmentPayload: Array<GatewayAttachment> = attachments.map(
        (attachment) => ({
          ...attachment,
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
          id: attachment.id ?? crypto.randomUUID(),
        }),
      )

      if (isNewChat) {
        const threadId = crypto.randomUUID()
        const { optimisticMessage } = createOptimisticMessage(
          trimmedBody,
          attachmentPayload,
        )
        appendHistoryMessage(queryClient, threadId, threadId, optimisticMessage)
        upsertSessionInCache(threadId, optimisticMessage)
        setPendingGeneration(true)
        setSending(true)
        setWaitingForResponse(true)

        void createSessionForMessage(threadId).catch((err: unknown) => {
          if (import.meta.env.DEV) {
            console.warn('[chat] failed to register new thread', err)
          }
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
        })

        // Send using the new thread id — gateway can still resolve/reroute under the hood
        // Fire send BEFORE navigate — navigating unmounts the component and can cancel the fetch
        sendMessage(
          threadId,
          threadId,
          trimmedBody,
          attachmentPayload,
          true,
          typeof optimisticMessage.clientId === 'string'
            ? optimisticMessage.clientId
            : '',
        )
        // Navigate after send is fired (fetch is in-flight, won't be cancelled)
        navigate({
          to: '/chat/$sessionKey',
          params: { sessionKey: threadId },
          replace: true,
        })
        return
      }

      const sessionKeyForSend =
        forcedSessionKey || resolvedSessionKey || activeSessionKey || 'main'
      sendMessage(
        sessionKeyForSend,
        activeFriendlyId,
        trimmedBody,
        attachmentPayload,
      )
    },
    [
      activeFriendlyId,
      activeSessionKey,
      createSessionForMessage,
      forcedSessionKey,
      isNewChat,
      navigate,
      onSessionResolved,
      scrollChatToBottom,
      sendMessage,
      upsertSessionInCache,
      queryClient,
      resolvedSessionKey,
    ],
  )

  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)

  const handleToggleSidebarCollapse = useCallback(() => {
    toggleSidebar()
  }, [toggleSidebar])

  const handleToggleFileExplorer = useCallback(() => {
    setFileExplorerCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('clawsuite-file-explorer-collapsed', String(next))
      }
      return next
    })
  }, [])

  useEffect(() => {
    function handleToggleFileExplorerFromSearch() {
      handleToggleFileExplorer()
    }

    window.addEventListener(
      SEARCH_MODAL_EVENTS.TOGGLE_FILE_EXPLORER,
      handleToggleFileExplorerFromSearch,
    )
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggleSidebarCollapse)
    return () => {
      window.removeEventListener(
        SEARCH_MODAL_EVENTS.TOGGLE_FILE_EXPLORER,
        handleToggleFileExplorerFromSearch,
      )
      window.removeEventListener(
        SIDEBAR_TOGGLE_EVENT,
        handleToggleSidebarCollapse,
      )
    }
  }, [handleToggleFileExplorer, handleToggleSidebarCollapse])

  const handleInsertFileReference = useCallback((reference: string) => {
    composerHandleRef.current?.insertText(reference)
  }, [])

  const historyLoading =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
    (historyQuery.isLoading && !historyQuery.data) || isRedirecting
  const historyEmpty = !historyLoading && finalDisplayMessages.length === 0
  const gatewayNotice = useMemo(() => {
    if (!showErrorNotice) return null
    if (!gatewayError) return null
    return (
      <GatewayStatusMessage
        state="error"
        error={gatewayError}
        status={gatewayErrorStatus}
        onRetry={handleGatewayRefetch}
      />
    )
  }, [gatewayError, gatewayErrorStatus, handleGatewayRefetch, showErrorNotice])

  const mobileHeaderStatus: 'connected' | 'connecting' | 'disconnected' =
    connectionState === 'connected'
      ? 'connected'
      : gatewayStatusQuery.data?.ok === false || gatewayStatusQuery.isError
        ? 'disconnected'
        : 'connecting'

  const activeHeaderToolName =
    liveToolActivity[0]?.name || activeToolCalls[0]?.name || undefined
  const headerStatusMode: 'idle' | 'sending' | 'streaming' | 'tool' =
    activeHeaderToolName
      ? 'tool'
      : derivedStreamingInfo.isStreaming
        ? 'streaming'
        : sending || waitingForResponse
          ? 'sending'
          : 'idle'

  // Pull-to-refresh offset removed

  const handleOpenAgentDetails = useCallback(() => {
    setAgentViewOpen(true)
  }, [setAgentViewOpen])

  const handleRenameActiveSessionTitle = useCallback(
    async (nextTitle: string) => {
      const sessionKey =
        resolvedSessionKey || activeSession?.key || activeSessionKey || ''
      if (!sessionKey) return
      await renameSession(sessionKey, activeSession?.friendlyId ?? null, nextTitle)
    },
    [activeSession?.friendlyId, activeSession?.key, activeSessionKey, renameSession, resolvedSessionKey],
  )

  // Listen for mobile header agent-details tap
  useEffect(() => {
    const handler = () => setAgentViewOpen(true)
    window.addEventListener('clawsuite:chat-agent-details', handler)
    return () => window.removeEventListener('clawsuite:chat-agent-details', handler)
  }, [setAgentViewOpen])

  return (
    <div
      className={cn(
        'relative min-w-0 flex flex-col overflow-hidden',
        compact ? 'h-full flex-1 min-h-0' : 'h-full',
      )}
    >
      <div
        className={cn(
          'flex-1 min-h-0 overflow-hidden',
          compact
            ? 'flex min-h-0 w-full flex-col'
            : isMobile
              ? 'flex flex-col'
              : 'grid grid-cols-[auto_1fr] grid-rows-[minmax(0,1fr)]',
        )}
      >
        {hideUi || compact ? null : isMobile ? null : (
          <FileExplorerSidebar
            collapsed={fileExplorerCollapsed}
            onToggle={handleToggleFileExplorer}
            onInsertReference={handleInsertFileReference}
          />
        )}

        <main
          className={cn(
            'flex h-full flex-1 min-h-0 min-w-0 flex-col overflow-hidden transition-[margin-right,margin-bottom] duration-200',
            !compact && isAgentViewOpen ? 'min-[1024px]:mr-72' : 'mr-0',
            (isRealtimeStreaming || hasPendingGeneration()) && 'chat-streaming-glow',
          )}
          style={{
            marginBottom:
              terminalPanelInset > 0 ? `${terminalPanelInset}px` : undefined,
          }}
          ref={mainRef}
        >
          {!compact && (
            <ChatHeader
              activeTitle={activeTitle}
              onRenameTitle={handleRenameActiveSessionTitle}
              renamingTitle={renamingSessionTitle}
              wrapperRef={headerRef}
              onOpenSessions={() => setSessionsOpen(true)}
              showFileExplorerButton={!isMobile}
              fileExplorerCollapsed={fileExplorerCollapsed}
              onToggleFileExplorer={handleToggleFileExplorer}
              dataUpdatedAt={historyQuery.dataUpdatedAt}
              onRefresh={handleRefreshHistory}
              agentModel={currentModel}
              agentConnected={mobileHeaderStatus === 'connected'}
              onOpenAgentDetails={handleOpenAgentDetails}
              pullOffset={0}
              statusMode={headerStatusMode}
              activeToolName={activeHeaderToolName}
              thinkingLevel={thinkingLevel}
            />
          )}

          <ContextBar compact={compact} />

          {isCompacting && <CompactingOverlay onDismiss={() => setIsCompacting(false)} />}

          {gatewayNotice && <div className="sticky top-0 z-20 px-4 py-2">{gatewayNotice}</div>}
          {pendingApprovals.length > 0 && (
            <div className="mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/15">
              <div className="space-y-2">
                {pendingApprovals.map((approval) => (
                  <div
                    key={approval.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {'\uD83D\uDD10'} Approval Required - {approval.agentName || 'Agent'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-amber-600 dark:text-amber-500">
                        {approval.action}
                      </p>
                      {approval.context ? (
                        <p className="mt-0.5 truncate text-[10px] font-mono text-amber-500 dark:text-amber-600">
                          {approval.context.slice(0, 100)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void resolvePendingApproval(approval, 'approved')
                        }}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void resolvePendingApproval(approval, 'denied')
                        }}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 dark:border-red-800/50 dark:bg-red-900/10 dark:text-red-400"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hideUi ? null : (
            <ChatMessageList
              messages={finalDisplayMessages}
              onRetryMessage={handleRetryMessage}
              onRefresh={handleRefreshHistory}
              loading={historyLoading}
              empty={historyEmpty}
              emptyState={
                <ChatEmptyState
                  compact={compact}
                  onSuggestionClick={(prompt) => {
                    composerHandleRef.current?.setValue(prompt + ' ')
                  }}
                />
              }
              notice={null}
              noticePosition="end"
              waitingForResponse={waitingForResponse}
              sessionKey={activeCanonicalKey}
              pinToTop={false}
              pinGroupMinHeight={pinGroupMinHeight}
              headerHeight={headerHeight}
              contentStyle={stableContentStyle}
              bottomOffset={isMobile ? mobileScrollBottomOffset : terminalPanelInset}
              isStreaming={derivedStreamingInfo.isStreaming}
              streamingMessageId={derivedStreamingInfo.streamingMessageId}
              streamingText={
                smoothRealtimeStreamingText ||
                completedStreamingText.current ||
                undefined
              }
              streamingThinking={
                realtimeStreamingThinking ||
                completedStreamingThinking.current ||
                undefined
              }
              hideSystemMessages={isMobile}
              activeToolCalls={activeToolCalls}
              liveToolActivity={liveToolActivity}
              sending={sending}
            />
          )}
          {showComposer ? (
            <ChatComposer
              onSubmit={send}
              isLoading={sending || waitingForResponse}
              disabled={sending || hideUi}
              sessionKey={
                isNewChat
                  ? undefined
                  : forcedSessionKey || resolvedSessionKey || activeSessionKey
              }
              wrapperRef={composerRef}
              composerRef={composerHandleRef}
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
              focusKey={`${isNewChat ? 'new' : activeFriendlyId}:${activeCanonicalKey ?? ''}`}
              thinkingLevel={thinkingLevel}
              onThinkingLevelChange={handleThinkingLevelChange}
            />
          ) : null}
        </main>
        {!compact && <AgentViewPanel />}
      </div>
      {!compact && !hideUi && !isMobile && <TerminalPanel />}

      {suggestion && (
        <ModelSuggestionToast
          suggestedModel={suggestion.suggestedModel}
          reason={suggestion.reason}
          costImpact={suggestion.costImpact}
          onSwitch={handleSwitchModel}
          onDismiss={dismiss}
          onDismissForSession={dismissForSession}
        />
      )}

      {isMobile && (
        <MobileSessionsPanel
          open={sessionsOpen}
          onClose={() => setSessionsOpen(false)}
          sessions={sessions}
          activeFriendlyId={activeFriendlyId}
          onSelectSession={(friendlyId) => {
            setSessionsOpen(false)
            void navigate({ to: '/chat/$sessionKey', params: { sessionKey: friendlyId } })
          }}
          onNewChat={() => {
            setSessionsOpen(false)
            void navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })
          }}
        />
      )}

      <ContextAlertModal
        open={alertOpen}
        onClose={dismissAlert}
        threshold={alertThreshold}
        contextPercent={alertPercent}
      />
    </div>
  )
}
