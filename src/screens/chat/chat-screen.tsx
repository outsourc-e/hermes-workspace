// Module-level local model override — set by composer when user picks a local model
// Avoids prop threading. Reset when switching back to cloud models.
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

import { isMissingAuth, textFromMessage } from './utils'
import {
  advanceStickyStreamingText,
  createOptimisticMessage,
  createResponseWaitSnapshot,
  getChatSessionSourceState,
  isTerminalActiveRunStatus,
  shouldClearWaitingForAssistantMessage,
  shouldPinMainSession,
} from './chat-screen-utils'
import {
  appendHistoryMessage,
  appendSessionCardTransientMessage,
  archiveSessionCard,
  branchSessionCard,
  chatQueryKeys,
  clearHistoryMessages,
  fetchCompleteSessionCardHistory,
  fetchRecentSessionCardHistory,
  fetchStatus,
  isAuthoritativeCompleteSessionCardHistory,
  isDisplayableRecentSessionCardHistory,
  isSessionCardRootHistoryLoaded,
  mergeFetchedOlderRecentSessionCardHistoryWindow,
  mergeRefreshedRecentSessionCardHistoryWindows,
  moveLegacyHistoryMessagesToSessionCard,
  moveSessionCardHistoryMessages,
  moveSessionCardHistoryToCard,
  recentSessionCardHistoryWindowSignature,
  reconcileSessionCardHistoryResponseDurably,
  retainCompleteSessionCardProjections,
  sessionCardQueryKeys,
  setSessionCardHandoffAuthority,
  updateHistoryMessageByClientId,
  updateHistoryMessageByClientIdEverywhere,
  updateSessionCardHistoryMessages,
  updateSessionCardMetadata,
  updateSessionCardTransientMessageByClientId,
  updateSessionLastMessage,
} from './chat-queries'
import {
  consumeNewSessionCardPrimaryModel,
  retainNewSessionCard,
} from './new-session-discard'
import { ChatHeader } from './components/chat-header'
import { ChatMessageList } from './components/chat-message-list'
import { ChatEmptyState } from './components/chat-empty-state'
import { ChatComposer } from './components/chat-composer'
import { ConnectionStatusMessage } from './components/connection-status-message'
import {
  checkpointPendingRecoveryMessage,
  clearPendingSendForSession,
  consumePendingSend,
  getNewChatProvisionalOwnerId,
  getPendingRecoveryMessages,
  hasPendingGeneration,
  hasPendingSend,
  isRecentSession,
  persistPendingMessage,
  readPendingMessage,
  removeRejectedPendingMessage,
  resetPendingSend,
  setPendingGeneration,
  updatePendingMessageByClientId,
} from './pending-send'
import {
  appendCardTranscriptRecoveryMessage,
  checkpointCardTranscriptRecoveryMessage,
  isCardTranscriptRecoveryMessagePortable,
  mergeCardTranscriptRecoveryMessages,
  removeRejectedCardTranscriptRecoveryMessage,
} from './card-transcript-recovery'
import { resetWorkspaceChatIndexedDb } from './card-transcript-indexeddb'
import { parsePortableAttachmentDataUrl } from './attachment-envelope'
import { useChatMeasurements } from './hooks/use-chat-measurements'
import { useChatHistory } from './hooks/use-chat-history'
import { useRealtimeChatHistory } from './hooks/use-realtime-chat-history'
import { snapshotOptimisticUserMessages } from './hooks/optimistic-message-reinject'
import { useSmoothStreamingText } from './hooks/use-smooth-streaming-text'
import { useStreamingMessage } from './hooks/use-streaming-message'
import {
  activeRunCheckUrl,
  useActiveRunCheck,
} from './hooks/use-active-run-check'
import { useChatMobile } from './hooks/use-chat-mobile'
import { useChatSessions } from './hooks/use-chat-sessions'
import { useAutoSessionTitle } from './hooks/use-auto-session-title'
import { useRenameSession } from './hooks/use-rename-session'
import { useContextAlert } from './hooks/use-context-alert'
import { ContextBar } from './components/context-bar'
import {
  CHAT_OPEN_SETTINGS_EVENT,
  CHAT_PENDING_COMMAND_STORAGE_KEY,
  CHAT_RUN_COMMAND_EVENT,
  CHAT_SUBMIT_SELECTION_EVENT,
} from './chat-events'
import { findSessionCardDescendant } from './session-cards'
import type { AuthoritativeCardHandoff } from './hooks/use-streaming-message'
import type {
  SessionCardHandoffAuthority,
  SessionCardHistoryResponse,
  SessionCardListWire,
} from './chat-queries'
import type {
  ChatRunCommandDetail,
  ChatSubmitSelectionDetail,
} from './chat-events'
import type { ResponseWaitSnapshot } from './chat-screen-utils'
import type {
  ChatComposerAttachment,
  ChatComposerHandle,
  ChatComposerHelpers,
  ThinkingLevel,
} from './components/chat-composer'
import type { ApprovalRequest } from '@/screens/gateway/lib/approvals-store'
import type { ChatAttachment, ChatMessage, SessionCard } from './types'
import type { AgentActivity } from '@/stores/chat-activity-store'
import { useChatSettingsStore } from '@/hooks/use-chat-settings'
import { playChatComplete } from '@/lib/sounds'
import {
  addApproval,
  loadApprovals,
  saveApprovals,
} from '@/screens/gateway/lib/approvals-store'
import { stripQueuedWrapper } from '@/lib/strip-queued-wrapper'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { hapticTap } from '@/lib/haptics'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { SEARCH_MODAL_EVENTS } from '@/hooks/use-search-modal'
import { SIDEBAR_TOGGLE_EVENT } from '@/hooks/use-global-shortcuts'
import {
  CHAT_BOOTSTRAP_CARD_ID,
  buildChatCardNavigation,
  useWorkspaceStore,
} from '@/stores/workspace-store'
import { TerminalPanel } from '@/components/terminal-panel'
import { AgentViewPanel } from '@/components/agent-view/agent-view-panel'
import { useTerminalPanelStore } from '@/stores/terminal-panel-store'
import { useModelSuggestions } from '@/hooks/use-model-suggestions'
import { ModelSuggestionToast } from '@/components/model-suggestion-toast'
import { MobileSessionsPanel } from '@/components/mobile-sessions-panel'
import { ContextAlertModal } from '@/components/usage-meter/context-alert-modal'
import { ErrorToastContainer, showErrorToast } from '@/components/error-toast'
// ContextMeter removed — ContextBar (PR #32) replaces it
import { useChatStore } from '@/stores/chat-store'
import { useSessionModelStore } from '@/stores/session-model-store'
import { fetchSessionCardStatusModel } from '@/screens/chat/session-card-status'
import {
  cardThinkingStorageKey,
  removeLegacySegmentUiStorage,
} from '@/screens/chat/session-card-ui-state'
import { useResearchCard } from '@/hooks/use-research-card'
// MOBILE_TAB_BAR_OFFSET removed — tab bar always hidden in chat
import { useTapDebug } from '@/hooks/use-tap-debug'
import { useChatMode } from '@/hooks/use-chat-mode'
import { useChatActivityStore } from '@/stores/chat-activity-store'

type ChatScreenProps = {
  activeFriendlyId: string
  activeCard?: SessionCard
  inspectedChildCardId?: string
  sessionCardList?: SessionCardListWire
  hasMoreSessionCards?: boolean
  loadingMoreSessionCards?: boolean
  moreSessionCardsError?: string | null
  onLoadMoreSessionCards?: () => void
  isNewChat?: boolean
  onSessionResolved?: (
    payload:
      | {
          sessionKey: string
          friendlyId: string
          reason: 'canonical'
        }
      | {
          fromSessionKey: string
          sessionKey: string
          friendlyId: string
          reason: 'bootstrap' | 'stream-handoff'
        },
  ) => void
  forcedSessionKey?: string
  /** Hide header + file explorer + terminal for panel mode */
  compact?: boolean
  /**
   * Disables internal `navigate()` side effects so the chat can be embedded
   * in other routes (e.g. Operations orchestrator card) without yanking the
   * user out to /chat/<uuid> on mount, refresh, or after send.
   */
  embedded?: boolean
}

type WorkspaceChatAdmissionRetry = {
  ownerKey: string
  safeMessage: string
  retryPersistence: () => Promise<boolean>
  continueAfterAdmission: () => Promise<void>
}

type PortableHistoryMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** The Gateway default is a routing alias, not an explicit provider model. */
function isGatewayDefaultAlias(model: string | undefined): boolean {
  const normalized = model?.trim().toLowerCase()
  return normalized === 'hermes-agent' || normalized === 'default'
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

function getPortableHistoryContent(message: ChatMessage): string {
  const text = textFromMessage(message).trim()
  if (text) return text
  if (
    message.role === 'user' &&
    Array.isArray(message.attachments) &&
    message.attachments.length > 0
  ) {
    return 'Please review the attached content.'
  }
  return ''
}

function buildPortableHistory(
  messages: Array<ChatMessage>,
): Array<PortableHistoryMessage> {
  return messages
    .filter(
      (
        message,
      ): message is ChatMessage & { role: 'user' | 'assistant' | 'system' } =>
        message.role === 'user' ||
        message.role === 'assistant' ||
        message.role === 'system',
    )
    .filter((message) => (message as any).__streamingStatus !== 'streaming')
    .map((message) => {
      const content = getPortableHistoryContent(message)
      if (!content) return null
      return {
        role: message.role,
        content,
      }
    })
    .filter((message): message is PortableHistoryMessage => message !== null)
    .slice(-20)
}

function sanitizeExportToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}

function exportConversationTranscript(payload: {
  sessionLabel: string
  messages: Array<ChatMessage>
}) {
  if (typeof document === 'undefined') return false

  const sessionToken =
    sanitizeExportToken(payload.sessionLabel) || 'conversation'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const body = payload.messages
    .map((message) => {
      const role =
        typeof message.role === 'string' && message.role.trim()
          ? message.role.trim().toUpperCase()
          : 'MESSAGE'
      const text = textFromMessage(message).trim()
      const attachments = Array.isArray(message.attachments)
        ? message.attachments
            .map((attachment) => attachment.name?.trim())
            .filter((value): value is string => Boolean(value))
        : []

      const lines = [`## ${role}`]
      if (text) lines.push(text)
      if (attachments.length > 0) {
        lines.push('', 'Attachments:')
        for (const attachment of attachments) {
          lines.push(`- ${attachment}`)
        }
      }
      return lines.join('\n')
    })
    .join('\n\n')
    .trim()

  const content = `# Hermes Conversation Export\n\nSession: ${payload.sessionLabel}\nExported: ${new Date().toISOString()}\n\n${body || '_No messages in this conversation._'}\n`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sessionToken}-${timestamp}.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

function messageFallbackSignature(message: ChatMessage): string {
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
            return `th:${typeof part.thinking === 'string' ? part.thinking : ''}`
          }
          if (part.type === 'toolCall') {
            const toolPart = part
            return `tc:${toolPart.id ?? ''}:${toolPart.name ?? ''}`
          }
          return `p:${part.type ?? ''}`
        })
        .join('|')
    : ''

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment) => {
          const name =
            typeof attachment.name === 'string' ? attachment.name : ''
          const size =
            typeof attachment.size === 'number' ? String(attachment.size) : ''
          const type =
            typeof attachment.contentType === 'string'
              ? attachment.contentType
              : ''
          return `${name}:${size}:${type}`
        })
        .join('|')
    : ''

  return `${message.role ?? 'unknown'}:${timestamp}:${contentParts}:${attachments}`
}

function getMessageClientId(message: ChatMessage): string {
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

function getRetryMessageKey(message: ChatMessage): string {
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

function isRetryableQueuedMessage(message: ChatMessage): boolean {
  if ((message.role || '') !== 'user') return false
  const raw = message as Record<string, unknown>
  const status = normalizeMessageValue(raw.status)
  return status === 'error'
}

const commandHelpers: ChatComposerHelpers = {
  reset() {},
  setValue() {},
  setAttachments() {},
}

function getMessageRetryAttachments(
  message: ChatMessage,
): Array<ChatAttachment> {
  if (!Array.isArray(message.attachments)) return []
  return message.attachments.filter((attachment) => {
    return Boolean(attachment) && typeof attachment === 'object'
  })
}

function getMessageStatusValue(message: ChatMessage): string {
  return normalizeMessageValue((message as Record<string, unknown>).status)
}

function isOptimisticUserMessage(message: ChatMessage): boolean {
  const raw = message as Record<string, unknown>
  return (
    normalizeMessageValue(raw.__optimisticId).length > 0 ||
    ['sending', 'sent', 'done'].includes(getMessageStatusValue(message))
  )
}

export function shouldCollapseTextDuplicate(
  existing: ChatMessage,
  candidate: ChatMessage,
): boolean {
  if (existing.role !== candidate.role) return false

  const identityValues = (message: ChatMessage, keys: Array<string>) => {
    const raw = message as Record<string, unknown>
    return new Set(
      keys.map((key) => normalizeMessageValue(raw[key])).filter(Boolean),
    )
  }
  const sharesIdentity = (left: Set<string>, right: Set<string>) =>
    [...left].some((identity) => right.has(identity))

  const existingStableIds = identityValues(existing, [
    'stableId',
    'stable_id',
    'id',
    'messageId',
    'message_id',
  ])
  const candidateStableIds = identityValues(candidate, [
    'stableId',
    'stable_id',
    'id',
    'messageId',
    'message_id',
  ])

  if (candidate.role === 'assistant') {
    const existingRunIds = identityValues(existing, [
      'runId',
      'run_id',
      'providerRunId',
      'provider_run_id',
    ])
    const candidateRunIds = identityValues(candidate, [
      'runId',
      'run_id',
      'providerRunId',
      'provider_run_id',
    ])
    if (sharesIdentity(existingRunIds, candidateRunIds)) return true
    if (existingRunIds.size > 0 && candidateRunIds.size > 0) return false
    return sharesIdentity(existingStableIds, candidateStableIds)
  }

  if (candidate.role !== 'user') return false
  // Distinct server message IDs are immutable evidence of distinct user turns.
  if (existingStableIds.size > 0 && candidateStableIds.size > 0) {
    return sharesIdentity(existingStableIds, candidateStableIds)
  }

  const clientKeys = [
    'clientId',
    'client_id',
    'nonce',
    'idempotencyKey',
    '__optimisticId',
  ]
  const existingClientIds = identityValues(existing, clientKeys)
  const candidateClientIds = identityValues(candidate, clientKeys)
  return sharesIdentity(existingClientIds, candidateClientIds)
}

function stripQueuedWrapperFromUserMessage(message: ChatMessage): ChatMessage {
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

export function ChatScreen({
  activeFriendlyId,
  activeCard,
  inspectedChildCardId,
  sessionCardList,
  hasMoreSessionCards = false,
  loadingMoreSessionCards = false,
  moreSessionCardsError = null,
  onLoadMoreSessionCards,
  isNewChat = false,
  onSessionResolved,
  forcedSessionKey,
  compact = false,
  embedded = false,
}: ChatScreenProps) {
  const sessionCards = useMemo(
    () => retainCompleteSessionCardProjections(sessionCardList)?.cards,
    [sessionCardList],
  )
  const navigate = useNavigate()
  const chatFocusMode = useWorkspaceStore((s) => s.chatFocusMode)
  const setChatFocusMode = useWorkspaceStore((s) => s.setChatFocusMode)
  const queryClient = useQueryClient()
  const [cardHandoff, setCardHandoff] = useState<{
    cardId: string
    canonicalSegmentKey: string
  } | null>(null)
  const activeCardContainsHandoff = Boolean(
    activeCard &&
    cardHandoff?.cardId === activeCard.cardId &&
    activeCard.continuationSegmentKeys.includes(
      cardHandoff.canonicalSegmentKey,
    ),
  )
  // A just-accepted handoff bridges the interval before the Card projection
  // refreshes. Once that projection contains the handed-off segment, its
  // canonical tip is newer authority and may already have advanced again.
  const activeCardCanonicalSegmentKey =
    activeCard &&
    cardHandoff?.cardId === activeCard.cardId &&
    !activeCardContainsHandoff
      ? cardHandoff.canonicalSegmentKey
      : activeCard?.canonicalSegmentKey
  const inspectedChildCard = activeCard
    ? findSessionCardDescendant(activeCard, inspectedChildCardId)
    : undefined
  useEffect(() => {
    if (
      cardHandoff &&
      (!activeCard ||
        cardHandoff.cardId !== activeCard.cardId ||
        activeCardContainsHandoff)
    ) {
      setCardHandoff(null)
    }
  }, [activeCard, activeCardContainsHandoff, cardHandoff])
  const [sending, setSending] = useState(false)

  const [sessionsOpen, setSessionsOpen] = useState(false)
  const activeCardIdRef = useRef(activeCard?.cardId)
  activeCardIdRef.current = activeCard?.cardId
  const [error, setError] = useState<string | null>(null)
  const [workspaceChatAdmissionRetry, setWorkspaceChatAdmissionRetry] =
    useState<WorkspaceChatAdmissionRetry | null>(null)
  const [workspaceChatAdmissionRetryBusy, setWorkspaceChatAdmissionRetryBusy] =
    useState(false)
  const workspaceChatAdmissionRetryBusyRef = useRef(false)
  const [
    workspaceChatAdmissionRetryError,
    setWorkspaceChatAdmissionRetryError,
  ] = useState<string | null>(null)
  const [renamingCardTitle, setRenamingCardTitle] = useState(false)
  const [pendingCardIds, setPendingCardIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [isRedirecting, setIsRedirecting] = useState(false)
  const { headerRef, composerRef, mainRef, pinGroupMinHeight, headerHeight } =
    useChatMeasurements()
  useTapDebug(mainRef, { label: 'chat-main' })
  const chatMode = useChatMode()
  const activeCardSource = activeCard?.canonicalSource
  const hasVerifiedCardSource =
    !activeCard || activeCardSource === 'local' || activeCardSource === 'remote'
  const cardTransportReady =
    hasVerifiedCardSource &&
    (!activeCard || Boolean(activeCardCanonicalSegmentKey?.trim()))
  // Existing Cards are routed by their server-verified canonical source. The
  // global mode remains authoritative only for legacy and bootstrap routes.
  const isPortableMode = activeCard
    ? activeCardSource === 'local'
    : chatMode === 'portable'
  // Portable `main` remains a legacy existing-session transport only. Every
  // New Chat starts from the server bootstrap sentinel so its verified Card
  // handoff, rather than a client-side main alias, owns the route transition.
  const isPortableMainSession = isPortableMode && !activeCard && !isNewChat
  const transportFriendlyId = activeCard
    ? activeCard.cardId
    : isPortableMainSession
      ? 'main'
      : activeFriendlyId
  const cardSourceError =
    activeCard && !cardTransportReady
      ? 'Session Card canonical source is missing or invalid.'
      : null
  // --- Issue #43 fix: lift waitingForResponse into persistent Zustand store ---
  // The store survives component unmount, so navigating away mid-stream
  const [liveToolActivity, setLiveToolActivity] = useState<
    Array<{ name: string; timestamp: number }>
  >([])
  const streamTimer = useRef<number | null>(null)
  const failsafeTimerRef = useRef<number | null>(null)
  const lastAssistantSignature = useRef('')
  const refreshHistoryRef = useRef<() => void>(() => {})
  const retriedQueuedMessageKeysRef = useRef(new Set<string>())
  const hasSeenDisconnectRef = useRef(false)
  const hadErrorRef = useRef(false)
  const [pendingApprovals, setPendingApprovals] = useState<
    Array<ApprovalRequest>
  >([])
  const [isCompacting, setIsCompacting] = useState(false)
  const [researchResetKey, setResearchResetKey] = useState(0)
  // Per-Card thinking level. Backend continuation segments never own UI state.
  // Derive the incoming Card's value during render, then commit it in a layout
  // effect so the prior Card's level cannot be painted during a route update.
  const thinkingOwner = activeCard?.cardId
  const persistedThinkingLevel = useMemo(() => {
    if (typeof window === 'undefined' || !thinkingOwner) return null
    const key = cardThinkingStorageKey(thinkingOwner)
    if (!key) return null
    const stored = window.sessionStorage.getItem(key)
    return stored === 'off' ||
      stored === 'low' ||
      stored === 'medium' ||
      stored === 'high' ||
      stored === 'adaptive'
      ? stored
      : null
  }, [thinkingOwner])
  const [thinkingState, setThinkingState] = useState<{
    owner?: string
    level: ThinkingLevel
  }>(() => ({
    owner: thinkingOwner,
    level: persistedThinkingLevel ?? 'low',
  }))
  const thinkingLevel =
    thinkingState.owner === thinkingOwner
      ? thinkingState.level
      : (persistedThinkingLevel ?? 'low')
  const setThinkingLevel = useCallback(
    (level: ThinkingLevel) => setThinkingState({ owner: thinkingOwner, level }),
    [thinkingOwner],
  )
  const thinkingInitializedOwnerRef = useRef(thinkingOwner)
  const thinkingInitializedByUserRef = useRef(persistedThinkingLevel !== null)
  if (thinkingInitializedOwnerRef.current !== thinkingOwner) {
    thinkingInitializedOwnerRef.current = thinkingOwner
    thinkingInitializedByUserRef.current = persistedThinkingLevel !== null
  }
  useLayoutEffect(() => {
    setThinkingState((current) =>
      current.owner === thinkingOwner
        ? current
        : { owner: thinkingOwner, level: persistedThinkingLevel ?? 'low' },
    )
  }, [persistedThinkingLevel, thinkingOwner])
  useEffect(() => {
    removeLegacySegmentUiStorage(activeCard?.continuationSegmentKeys ?? [])
  }, [activeCard?.continuationSegmentKeys])
  const { alertOpen, alertThreshold, alertPercent, dismissAlert } =
    useContextAlert()

  const pendingStartRef = useRef(false)
  const composerHandleRef = useRef<ChatComposerHandle | null>(null)
  // Idempotency guard prevents duplicate sends on paste/attach double-fire.
  const lastSendKeyRef = useRef('')
  const lastSendAtRef = useRef(0)
  const activeSendRef = useRef<{
    sessionKey: string
    friendlyId: string
    cardId?: string
    clientId: string
    provisionalOwnerId?: string
  } | null>(null)
  // A live send-stream reader is authoritative over its waiting state. Keep
  // this separate from sessionStorage-backed recovery so a continuation cannot
  // hide its status while the successor Card projection catches up.
  const liveStreamSessionKeyRef = useRef<string | null>(null)
  // Re-render when a reader is acquired so recovery and message-list gates see
  // the ref-based ownership transition immediately.
  const [localReaderOwnershipVersion, setLocalReaderOwnershipVersion] =
    useState(0)
  const isLocalLiveStreamOwner = useCallback(
    (browserOwnerKey: string | undefined) =>
      Boolean(
        browserOwnerKey &&
        activeSendRef.current &&
        liveStreamSessionKeyRef.current &&
        (activeSendRef.current.cardId ?? activeSendRef.current.sessionKey) ===
          browserOwnerKey,
      ),
    [],
  )
  const streamHandoffRouteRef = useRef<{
    sessionKey: string
    friendlyId: string
  } | null>(null)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('claude-file-explorer-collapsed')
    return stored === null ? true : stored === 'true'
  })
  const { isMobile } = useChatMobile(queryClient)
  const mobileKeyboardInset = useWorkspaceStore((s) => s.mobileKeyboardInset)
  const mobileComposerFocused = useWorkspaceStore(
    (s) => s.mobileComposerFocused,
  )
  const mobileKeyboardActive = mobileKeyboardInset > 0 || mobileComposerFocused
  void mobileKeyboardActive // kept for future use
  const isTerminalPanelOpen = useTerminalPanelStore(
    (state) => state.isPanelOpen,
  )
  const terminalPanelHeight = useTerminalPanelStore(
    (state) => state.panelHeight,
  )
  const { renameSession, renaming: renamingSessionTitle } = useRenameSession()
  const sseConnectionState = useChatStore((s) => s.connectionState)

  // Card routes and the `new` bootstrap sentinel never feed an identity into the
  // retired session inventory. Keep the legacy hooks mounted on inert state so
  // React hook ordering stays stable without creating a second active-session
  // or history path.
  const legacyRouteFriendlyId = activeCard ? 'new' : activeFriendlyId
  const legacyForcedSessionKey = activeCard ? undefined : forcedSessionKey
  const legacySessionInventoryEnabled = !activeCard && !isNewChat
  const {
    sessionsQuery,
    sessions,
    activeSession,
    activeExists,
    activeSessionKey: legacyActiveSessionKey,
    activeTitle: legacyActiveTitle,
    sessionsError,
    sessionsLoading: _sessionsLoading,
    sessionsFetching: _sessionsFetching,
    refetchSessions: _refetchSessions,
  } = useChatSessions({
    activeFriendlyId: legacyRouteFriendlyId,
    isNewChat: isNewChat || Boolean(activeCard),
    forcedSessionKey: legacyForcedSessionKey,
    enabled: legacySessionInventoryEnabled,
  })
  const activeSessionKey =
    activeCardCanonicalSegmentKey ?? legacyActiveSessionKey
  const activeTitle = activeCard?.title ?? legacyActiveTitle
  const legacyRedirecting = !activeCard && isRedirecting
  const sessionSource = activeCard
    ? (activeCardSource ?? 'unknown')
    : getChatSessionSourceState({
        embedded,
        sessionsStatus: sessionsQuery.status,
        source: activeSession?.lineage?.source,
      })
  const {
    historyQuery: legacyHistoryQuery,
    historyMessages: legacyHistoryMessages,
    messageCount: legacyMessageCount,
    historyError: legacyHistoryError,
    resolvedSessionKey: legacyResolvedSessionKey,
    activeCanonicalKey: legacyActiveCanonicalKey,
    sessionKeyForHistory: legacySessionKeyForHistory,
  } = useChatHistory({
    activeFriendlyId: activeCard ? 'new' : transportFriendlyId,
    activeSessionKey: activeCard ? '' : activeSessionKey,
    forcedSessionKey: legacyForcedSessionKey,
    isNewChat: isNewChat || Boolean(activeCard),
    isRedirecting: legacyRedirecting,
    activeExists: activeCard ? true : activeExists,
    sessionsReady: activeCard ? true : sessionsQuery.isSuccess,
    queryClient,
    historyRefetchInterval: sseConnectionState === 'connected' ? 30_000 : 5_000,
    // This legacy hook's portable mode specifically means the global `main`
    // conversation. A local Card keeps its canonical Card identity.
    portableMode: isPortableMainSession,
    sessionSource,
    onCanonicalSessionResolved: useCallback(
      ({
        requestedSessionKey,
        sessionKey,
      }: {
        requestedSessionKey: string
        sessionKey: string
      }) => {
        const currentRequestedSessionKey =
          forcedSessionKey || activeSessionKey || activeFriendlyId
        if (requestedSessionKey !== currentRequestedSessionKey) return
        if (!onSessionResolved) return
        setIsRedirecting(true)
        onSessionResolved({
          sessionKey,
          friendlyId: sessionKey,
          reason: 'canonical',
        })
      },
      [activeFriendlyId, activeSessionKey, forcedSessionKey, onSessionResolved],
    ),
  })

  const cardHistoryQueryKey = sessionCardQueryKeys.history(
    activeCard?.cardId ?? '',
  )
  const cardHistoryQuery = useQuery({
    queryKey: cardHistoryQueryKey,
    queryFn: async ({ signal }) => {
      if (!activeCard || !activeCardCanonicalSegmentKey) {
        throw new Error('Session Card route is not resolved')
      }
      const server = await fetchRecentSessionCardHistory({
        cardId: activeCard.cardId,
        canonicalSegmentKey: activeCardCanonicalSegmentKey,
        continuationSegmentKeys: activeCard.continuationSegmentKeys,
        signal,
      })
      const previous =
        queryClient.getQueryData<SessionCardHistoryResponse>(
          cardHistoryQueryKey,
        )
      return reconcileSessionCardHistoryResponseDurably(
        previous
          ? mergeRefreshedRecentSessionCardHistoryWindows(
              server,
              previous,
              activeCard.continuationSegmentKeys,
            )
          : server,
        {
          previous,
          continuationSegmentKeys: activeCard.continuationSegmentKeys,
        },
      )
    },
    enabled:
      cardTransportReady &&
      Boolean(activeCard) &&
      Boolean(activeCardCanonicalSegmentKey) &&
      !isNewChat,
    refetchInterval: sseConnectionState === 'connected' ? 30_000 : 5_000,
  })
  const inspectedChildHistoryQueryKey = sessionCardQueryKeys.childHistory(
    activeCard?.cardId ?? '',
    inspectedChildCard?.cardId ?? '',
  )
  const inspectedChildHistoryQuery = useQuery({
    queryKey: inspectedChildHistoryQueryKey,
    queryFn: async ({ signal }) => {
      if (!activeCard || !inspectedChildCard) {
        throw new Error('Inspected child Card is not validated')
      }
      const server = await fetchCompleteSessionCardHistory({
        parentCardId: activeCard.cardId,
        cardId: inspectedChildCard.cardId,
        canonicalSegmentKey: inspectedChildCard.sessionKey,
        continuationSegmentKeys: inspectedChildCard.continuationSegmentKeys,
        signal,
      })
      return reconcileSessionCardHistoryResponseDurably(server, {
        previous: queryClient.getQueryData<SessionCardHistoryResponse>(
          inspectedChildHistoryQueryKey,
        ),
        continuationSegmentKeys: inspectedChildCard.continuationSegmentKeys,
      })
    },
    enabled:
      cardTransportReady &&
      Boolean(activeCard) &&
      Boolean(inspectedChildCard) &&
      !isNewChat,
    retry: 1,
    refetchOnWindowFocus: true,
  })
  const historyQuery = activeCard ? cardHistoryQuery : legacyHistoryQuery
  const bootstrapPendingOwnerId = isNewChat
    ? getNewChatProvisionalOwnerId()
    : ''
  const bootstrapPendingQuery = useQuery({
    queryKey: ['chat', 'pending-send-v4', bootstrapPendingOwnerId],
    queryFn: () => readPendingMessage('new', 'new', bootstrapPendingOwnerId),
    enabled: isNewChat && Boolean(bootstrapPendingOwnerId),
  })
  const bootstrapPending = bootstrapPendingQuery.data ?? null
  const bootstrapRecoveryMessages = bootstrapPending
    ? getPendingRecoveryMessages(bootstrapPending)
    : []
  const historyMessages = activeCard
    ? (cardHistoryQuery.data?.messages ?? [])
    : isNewChat
      ? mergeCardTranscriptRecoveryMessages(
          legacyHistoryMessages,
          bootstrapRecoveryMessages,
        )
      : legacyHistoryMessages
  const messageCount = activeCard ? historyMessages.length : legacyMessageCount
  const cardRootHistoryLoaded =
    !activeCard ||
    isSessionCardRootHistoryLoaded(activeCard, cardHistoryQuery.data)
  const historyError = activeCard
    ? (cardSourceError ?? cardHistoryQuery.error?.message ?? null)
    : legacyHistoryError
  const displayedHistoryQuery = inspectedChildCard
    ? inspectedChildHistoryQuery
    : historyQuery
  const displayedCardHistory = inspectedChildCard
    ? inspectedChildHistoryQuery.data
    : activeCard
      ? cardHistoryQuery.data
      : undefined
  const displayedCardHistoryRetryable = displayedCardHistory?.retryable === true
  const displayedCardHistoryReady =
    !activeCard ||
    (inspectedChildCard
      ? isAuthoritativeCompleteSessionCardHistory(displayedCardHistory)
      : isDisplayableRecentSessionCardHistory(displayedCardHistory))
  const [loadingOlderCardHistory, setLoadingOlderCardHistory] = useState(false)
  const loadOlderCardHistory = useCallback(async () => {
    const current = cardHistoryQuery.data
    if (
      inspectedChildCard ||
      !current?.previousCursor ||
      current.retryable ||
      !activeCard ||
      !activeCardCanonicalSegmentKey ||
      loadingOlderCardHistory
    ) {
      return false
    }
    const previousCursor = current.previousCursor
    const requestedWindowSignature =
      recentSessionCardHistoryWindowSignature(current)
    setLoadingOlderCardHistory(true)
    try {
      const older = await fetchRecentSessionCardHistory({
        cardId: activeCard.cardId,
        canonicalSegmentKey: activeCardCanonicalSegmentKey,
        continuationSegmentKeys: activeCard.continuationSegmentKeys,
        cursor: previousCursor,
      })
      const latest =
        queryClient.getQueryData<SessionCardHistoryResponse>(
          cardHistoryQueryKey,
        )
      const merged = mergeFetchedOlderRecentSessionCardHistoryWindow(
        older,
        latest,
        activeCard.continuationSegmentKeys,
        previousCursor,
        requestedWindowSignature,
      )
      if (!merged || merged === latest) return false
      const durable = await reconcileSessionCardHistoryResponseDurably(merged, {
        previous: latest,
        continuationSegmentKeys: activeCard.continuationSegmentKeys,
      })
      if (
        queryClient.getQueryData<SessionCardHistoryResponse>(
          cardHistoryQueryKey,
        ) !== latest
      ) {
        return false
      }
      queryClient.setQueryData(cardHistoryQueryKey, durable)
      return true
    } finally {
      setLoadingOlderCardHistory(false)
    }
  }, [
    activeCard,
    activeCardCanonicalSegmentKey,
    cardHistoryQuery.data,
    cardHistoryQueryKey,
    inspectedChildCard,
    loadingOlderCardHistory,
    queryClient,
  ])
  const displayedHistoryError = inspectedChildCard
    ? (inspectedChildHistoryQuery.error?.message ?? null)
    : historyError
  const resolvedSessionKey = activeCard
    ? activeCardCanonicalSegmentKey
    : legacyResolvedSessionKey
  const activeCanonicalKey = activeCard
    ? activeCardCanonicalSegmentKey
    : legacyActiveCanonicalKey
  const sessionKeyForHistory = activeCard
    ? activeCardCanonicalSegmentKey
    : legacySessionKeyForHistory
  // A partial transcript stays fail-closed unless this mounted reader owns the
  // Card or a persisted Card stream was explicitly hydrated for it. Hydration
  // is Card-scoped and cannot surface unrelated raw-session activity.
  const hasOwnedCardStreamingState = useChatStore((state) =>
    activeCard ? state.streamingState.has(activeCard.cardId) : false,
  )
  const canShowLiveActivity =
    displayedCardHistoryReady ||
    hasOwnedCardStreamingState ||
    isLocalLiveStreamOwner(activeCard.cardId)

  // --- Waiting state management (Issue #43 + #449) ---
  // resolvedSessionKey is now available (defined above from useChatHistory).
  const storeWaiting = useChatStore((s) => s.waitingSessionKeys)
  const sessionKeyForWaiting = useRef<string | undefined>(undefined)
  const cardIdForWaiting = useRef<string | undefined>(undefined)
  const pendingVerifySessionKeyRef = useRef<string | undefined>(undefined)
  const activeRunCheckDoneForSessionRef = useRef<string | undefined>(undefined)

  // A `new` route can momentarily resolve legacy history to `main` before its
  // optimistic cache is present. Waiting is owned by the send target, so never
  // let that fallback move a live new-chat wait state onto `main`.
  cardIdForWaiting.current = activeCard?.cardId
  sessionKeyForWaiting.current = isNewChat
    ? 'new'
    : (activeCard?.cardId ?? resolvedSessionKey)

  // Synchronously detect stale waiting state from sessionStorage.
  // This runs during render (not in an effect) so the guard in
  // waitingForResponse is active on the very first render, preventing
  // a flash of the "Thinking" indicator when reopening an old session.
  const needsStaleCheck =
    sessionKeyForWaiting.current &&
    !isNewChat &&
    storeWaiting.has(sessionKeyForWaiting.current) &&
    !isLocalLiveStreamOwner(sessionKeyForWaiting.current) &&
    pendingVerifySessionKeyRef.current !== sessionKeyForWaiting.current

  if (needsStaleCheck) {
    pendingVerifySessionKeyRef.current = sessionKeyForWaiting.current
    activeRunCheckDoneForSessionRef.current = undefined
  }

  // Track whether the active-run API check has completed.
  // Initialize to false when we detect stale state (needs verification),
  // true otherwise. This prevents showing "Thinking" until the API confirms.
  const [activeRunCheckDone, setActiveRunCheckDone] = useState(!needsStaleCheck)

  const waitingForResponse = useMemo(() => {
    const key = sessionKeyForWaiting.current
    if (!key) return hasPendingSend() || hasPendingGeneration()

    // An open local send-stream reader is authoritative through a handoff.
    // Do not let recovery validation hide it while the Card projection moves.
    if (storeWaiting.has(key) && isLocalLiveStreamOwner(key)) {
      return true
    }

    // If we restored waiting state from sessionStorage but haven't verified
    // with the API yet, don't show thinking — it might be stale (Issue #449).
    if (
      storeWaiting.has(key) &&
      pendingVerifySessionKeyRef.current === key &&
      activeRunCheckDoneForSessionRef.current !== key
    ) {
      return false
    }

    return storeWaiting.has(key)
  }, [storeWaiting, activeRunCheckDone, localReaderOwnershipVersion])

  const setWaitingForResponse = useCallback((waiting: boolean) => {
    const store = useChatStore.getState()
    const key = sessionKeyForWaiting.current
    if (!key) return
    const cardId = cardIdForWaiting.current
    if (waiting) {
      if (cardId) store.setCardWaiting(cardId)
      else store.setSessionWaiting(key)
    } else {
      if (cardId) store.clearCardWaiting(cardId)
      else store.clearSessionWaiting(key)
    }
  }, [])
  // verification before showing thinking (Issue #449).
  useEffect(() => {
    const currentSessionKey = resolvedSessionKey
    const browserOwnerKey = activeCard?.cardId ?? currentSessionKey
    if (!currentSessionKey || !browserOwnerKey || isNewChat) return
    const store = useChatStore.getState()
    const isWaiting = activeCard
      ? store.isCardWaiting(activeCard.cardId)
      : store.isSessionWaiting(currentSessionKey)
    if (isWaiting) {
      if (isLocalLiveStreamOwner(browserOwnerKey)) {
        // This wait belongs to an open local reader, not recovered storage.
        pendingVerifySessionKeyRef.current = undefined
        activeRunCheckDoneForSessionRef.current = browserOwnerKey
        setActiveRunCheckDone(true)
        return
      }
      pendingVerifySessionKeyRef.current = browserOwnerKey
      activeRunCheckDoneForSessionRef.current = undefined
      setActiveRunCheckDone(false)
    } else {
      // No restored waiting state — no need to verify
      pendingVerifySessionKeyRef.current = undefined
      activeRunCheckDoneForSessionRef.current = browserOwnerKey
      setActiveRunCheckDone(true)
    }
  }, [activeCard, isLocalLiveStreamOwner, resolvedSessionKey, isNewChat])

  // On remount, check if the server still has an active run for this session.
  // If so, re-set waitingForResponse in the store so the UI shows the spinner.
  useActiveRunCheck({
    sessionKey: resolvedSessionKey ?? '',
    cardId: activeCard?.cardId,
    enabled:
      cardTransportReady &&
      !isNewChat &&
      Boolean(resolvedSessionKey) &&
      !isLocalLiveStreamOwner(activeCard?.cardId ?? resolvedSessionKey) &&
      historyQuery.isSuccess,
    shouldApplyResult: useCallback(
      (sessionKey: string) =>
        !isLocalLiveStreamOwner(activeCard?.cardId ?? sessionKey),
      [activeCard?.cardId, isLocalLiveStreamOwner],
    ),
    onCheckComplete: useCallback(
      (sessionKey: string) => {
        activeRunCheckDoneForSessionRef.current =
          activeCard?.cardId ?? sessionKey
        setActiveRunCheckDone(true)
      },
      [activeCard?.cardId],
    ),
  })

  // Wire SSE realtime stream for instant message delivery
  const {
    messages: realtimeMessages,
    lastCompletedRunAt,
    connectionState: inferredConnectionState,
    isRealtimeStreaming,
    realtimeStreamingText,
    realtimeStreamingThinking,
    realtimeLifecycleEvents,
    completedStreamingText,
    completedStreamingThinking,
    clearCompletedStreaming,
    streamingRunId,
    activeToolCalls,
    realtimeStreamingStates = [],
  } = useRealtimeChatHistory({
    sessionKey: activeCard
      ? activeCardCanonicalSegmentKey || ''
      : isNewChat
        ? 'new'
        : isPortableMainSession
          ? 'main'
          : resolvedSessionKey ||
            sessionKeyForHistory ||
            activeCanonicalKey ||
            'main',
    friendlyId: transportFriendlyId,
    cardId: activeCard?.cardId,
    historyMessages,
    // Do not let the legacy portable hook coerce a local Card to `main`.
    portableMode: isPortableMainSession,
    enabled:
      cardTransportReady &&
      // Always enable for new chats in portable mode (no sessions API to resolve).
      // In enhanced mode, wait for session resolution before subscribing.
      ((isPortableMode && isNewChat) ||
        (!isNewChat &&
          Boolean(
            resolvedSessionKey || sessionKeyForHistory || activeCanonicalKey,
          ))) &&
      !legacyRedirecting,
    onUserMessage: useCallback(() => {
      // External message arrived (e.g. from Telegram) — show thinking indicator
      setWaitingForResponse(true)
      setPendingGeneration(true)
    }, []),
    onApprovalRequest: useCallback((payload: Record<string, unknown>) => {
      const approvalId =
        typeof payload.id === 'string'
          ? payload.id
          : typeof payload.approvalId === 'string'
            ? payload.approvalId
            : typeof payload.approvalId === 'string'
              ? payload.approvalId
              : ''

      const currentApprovals = loadApprovals()
      if (
        approvalId &&
        currentApprovals.some((entry) => {
          return (
            entry.status === 'pending' && entry.gatewayApprovalId === approvalId
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
      const agentNameValue =
        payload.agentName ?? payload.agent ?? payload.source
      const agentName =
        typeof agentNameValue === 'string' && agentNameValue.trim().length > 0
          ? agentNameValue
          : 'Agent'
      const agentIdValue =
        payload.agentId ?? payload.sessionKey ?? payload.source
      const agentId =
        typeof agentIdValue === 'string' && agentIdValue.trim().length > 0
          ? agentIdValue
          : 'claude'

      addApproval({
        agentId,
        agentName,
        action,
        context,
        source: 'agent',
        gatewayApprovalId: approvalId || undefined,
      })
      setPendingApprovals(
        loadApprovals().filter((entry) => entry.status === 'pending'),
      )
    }, []),
    onCompactionStart: useCallback(() => {
      setIsCompacting(true)
    }, []),
    onCompactionEnd: useCallback(() => {
      setIsCompacting(false)
    }, []),
  })

  // useChatStream currently infers its initialized literal state too narrowly;
  // the runtime store emits all three connection states.
  const connectionState = inferredConnectionState as
    | 'connected'
    | 'connecting'
    | 'disconnected'

  // Keep activity stream open persistently — opens on mount so it's ready
  // before the first tool call fires (avoids connection latency gap).
  const waitingForResponseRef = useRef(waitingForResponse)
  useEffect(() => {
    waitingForResponseRef.current = waitingForResponse
  }, [waitingForResponse])

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
        const name = payload.title.replace(/^Tool activity:\s*/i, '').trim()
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
    if (!waitingForResponse) return
    clearCompletedStreaming()
  }, [clearCompletedStreaming, waitingForResponse])

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

  // --- Stream management ---
  const streamStop = useCallback(() => {
    if (streamTimer.current) {
      window.clearTimeout(streamTimer.current)
      streamTimer.current = null
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

  const streamFinish = useCallback(
    (sessionKey?: string, cardId?: string) => {
      streamStop()
      if (failsafeTimerRef.current) {
        window.clearTimeout(failsafeTimerRef.current)
        failsafeTimerRef.current = null
      }
      setPendingGeneration(false)
      const activeSend = activeSendRef.current
      const targetCardId = cardId ?? activeSend?.cardId
      const targetSessionKey = sessionKey ?? activeSend?.sessionKey
      if (targetCardId) {
        useChatStore.getState().clearCardWaiting(targetCardId)
      }
      if (targetSessionKey) {
        useChatStore.getState().clearSessionWaiting(targetSessionKey)
      }
      if (!targetCardId && !targetSessionKey) {
        setWaitingForResponse(false)
      }
    },
    [streamStop],
  )

  const streamStart = useCallback(() => {
    if (!activeFriendlyId || isNewChat) return
    // No aggressive delayed refetch here — it wipes optimistic user messages
    // from the cache before the server has echoed them, causing the user's
    // message to disappear until the agent completes. The existing failsafes
    // (5s + 10s timeouts at lines below, active-run polling) handle the case
    // where SSE misses the done event.
    void activeFriendlyId // keep dep for eslint
  }, [activeFriendlyId, isNewChat])

  refreshHistoryRef.current = function refreshHistory() {
    if (historyQuery.isFetching) return

    if (activeCard) {
      // Card query reconciliation reloads the exact persisted recovery envelope;
      // never snapshot or re-inject a legacy history cache for a Card.
      void historyQuery.refetch()
      return
    }

    const historySessionKey = isPortableMainSession
      ? 'main'
      : activeSessionKey || sessionKeyForHistory || resolvedSessionKey || 'main'
    const reInjectOptimistic = snapshotOptimisticUserMessages(
      queryClient,
      transportFriendlyId,
      historySessionKey,
    )

    void historyQuery.refetch().then(reInjectOptimistic)
  }

  const clearTimerRef = useRef<number | null>(null)

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
      if (activeRealtimeStreamingRef.current) return
      refreshHistoryRef.current()
    }, 5000)
    return () => window.clearTimeout(fallback)
  }, [waitingForResponse])

  // Issue #43 polling fallback: when waiting but SSE hasn't reconnected,
  // poll the active-run endpoint every 5s to detect completion.
  useEffect(() => {
    if (!cardTransportReady || !waitingForResponse || !resolvedSessionKey)
      return
    if (sseConnectionState === 'connected') return // SSE will deliver the event
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          activeRunCheckUrl(resolvedSessionKey, activeCard?.cardId),
        )
        if (!response.ok) return
        const data = await response.json()
        if (!data.ok) return
        // Run not yet registered (gateway lag during silent processing) → keep waiting
        if (!data.run) return
        // Treat unknown / transient statuses as still-active to avoid premature teardown
        if (isTerminalActiveRunStatus(data.run.status)) {
          streamFinish()
          refreshHistoryRef.current()
        }
      } catch {
        // ignore network errors
      }
    }, 5000)
    return () => window.clearInterval(interval)
  }, [
    activeCard?.cardId,
    cardTransportReady,
    waitingForResponse,
    resolvedSessionKey,
    sseConnectionState,
    streamFinish,
  ])

  useAutoSessionTitle({
    friendlyId: activeFriendlyId,
    sessionKey: resolvedSessionKey,
    activeSession,
    sessionCard: activeCard,
    messages: historyMessages,
    messageCount,
    enabled:
      cardTransportReady &&
      !isNewChat &&
      Boolean(resolvedSessionKey) &&
      historyQuery.isSuccess &&
      cardRootHistoryLoaded,
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
    queryKey: [
      'claude',
      'session-card-status-model',
      activeCard?.cardId || 'new',
    ],
    queryFn: () => fetchSessionCardStatusModel(activeCard?.cardId),
    enabled: Boolean(activeCard?.cardId),
    refetchInterval: 30_000,
    retry: false,
  })

  // Fetch the configured reasoning effort so the Chat Controls default matches
  // what Hermes actually uses instead of hardcoding 'low'.
  const reasoningEffortQuery = useQuery({
    queryKey: ['hermes-config', 'reasoning-effort'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/hermes-config')
        if (!res.ok) return 'low'
        const data = (await res.json()) as { config?: Record<string, unknown> }
        const agentSection = data.config?.agent
        if (
          agentSection &&
          typeof agentSection === 'object' &&
          !Array.isArray(agentSection)
        ) {
          const effort = (agentSection as Record<string, unknown>)
            .reasoning_effort
          if (
            effort === 'off' ||
            effort === 'low' ||
            effort === 'medium' ||
            effort === 'high'
          )
            return effort
        }
        return 'low'
      } catch {
        return 'low'
      }
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const availableModelIds = useMemo(() => {
    const models = modelsQuery.data?.models || []
    return models.map((m: any) => m.id).filter((id: string) => id)
  }, [modelsQuery.data])

  const gatewayModel = currentModelQuery.data || ''
  // Isolated route/handoff mounts replace React's dispatcher, so this parent
  // intentionally reads the Card store snapshot instead of subscribing. The
  // Composer owns its reactive label; sendMessage performs a fresh store read
  // below so the first send after a selection cannot observe this snapshot.
  const persistedCardModel = useSessionModelStore
    .getState()
    .getModel(activeCard?.cardId)
  const currentModel = persistedCardModel || gatewayModel

  // Ref so sendMessage can always read latest thinkingLevel without being in deps
  const thinkingLevelRef = useRef<ThinkingLevel>(thinkingLevel)
  useEffect(() => {
    thinkingLevelRef.current = thinkingLevel
  }, [thinkingLevel])

  // A Card without an explicit override derives its initial level from the
  // selected model first, then the Hermes config. This effect runs only for
  // the currently mounted Card owner.
  useEffect(() => {
    if (thinkingInitializedByUserRef.current) return
    const normalizedModel = currentModel.toLowerCase()
    const adaptiveModel =
      normalizedModel.includes('4-6') || normalizedModel.includes('claude-4.6')
    if (adaptiveModel) {
      setThinkingLevel('adaptive')
      return
    }
    const configEffort = reasoningEffortQuery.data
    if (configEffort) setThinkingLevel(configEffort)
  }, [currentModel, reasoningEffortQuery.data])

  // Persist only explicit Card-owned choices. Bootstrap chats keep their
  // temporary thinking state in memory until an authoritative Card exists.
  const handleThinkingLevelChange = useCallback(
    (level: ThinkingLevel) => {
      setThinkingLevel(level)
      thinkingInitializedByUserRef.current = true
      if (typeof window !== 'undefined') {
        const key = cardThinkingStorageKey(activeCard?.cardId)
        if (key) window.sessionStorage.setItem(key, level)
      }
    },
    [activeCard?.cardId],
  )

  const { suggestion, dismiss, dismissForSession } = useModelSuggestions({
    currentModel, // Card-scoped status or Card-owned preference.
    cardId: activeCard?.cardId ?? '',
    messages: historyMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: textFromMessage(m),
    })) as any,
    availableModels: availableModelIds,
  })

  const {
    isStreaming: localIsStreaming,
    streamingText: localStreamingText,
    streamingMessageId: localStreamingMessageId,
    startStreaming,
    cancelStreaming,
  } = useStreamingMessage({
    pinMainSession: shouldPinMainSession({
      activeFriendlyId,
      resolvedSessionKey,
      portableMode: isPortableMode,
      sessionSource,
    }),
    activeCard,
    sessionCards,
    onCardHandoff: useCallback(
      (
        handoff: AuthoritativeCardHandoff,
        authority: SessionCardHandoffAuthority,
      ) => {
        const activeSend = activeSendRef.current
        if (
          !activeSend ||
          authority.cardId !== handoff.cardId ||
          activeSend.cardId !== handoff.cardId ||
          activeSend.sessionKey !== handoff.fromSegmentKey
        ) {
          return false
        }
        if (
          !moveSessionCardHistoryMessages(
            queryClient,
            handoff,
            authority,
            sessionCards,
          )
        ) {
          return false
        }
        if (
          activeCard &&
          !setSessionCardHandoffAuthority(queryClient, activeCard, authority)
        ) {
          return false
        }
        streamHandoffRouteRef.current = {
          sessionKey: handoff.canonicalSegmentKey,
          friendlyId: handoff.cardId,
        }
        activeSendRef.current = {
          ...activeSend,
          sessionKey: handoff.canonicalSegmentKey,
          friendlyId: handoff.cardId,
          cardId: handoff.cardId,
        }
        cardIdForWaiting.current = handoff.cardId
        sessionKeyForWaiting.current = handoff.cardId
        liveStreamSessionKeyRef.current = handoff.canonicalSegmentKey
        setCardHandoff({
          cardId: handoff.cardId,
          canonicalSegmentKey: handoff.canonicalSegmentKey,
        })
        void queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.lists,
        })
        void queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.detail(handoff.cardId),
          exact: true,
        })
        return true
      },
      [activeCard, queryClient, sessionCards],
    ),
    onSessionResolved: useCallback(
      async ({
        fromSessionKey,
        sessionKey,
        friendlyId,
        reason,
      }: {
        fromSessionKey: string
        sessionKey: string
        friendlyId: string
        reason: 'bootstrap' | 'stream-handoff'
      }) => {
        const activeSend = activeSendRef.current
        const sourceFriendlyId = activeSend?.friendlyId || activeFriendlyId
        const sourceSessionKey = activeSend?.sessionKey || fromSessionKey
        const currentAuthoritativeSessionKey =
          forcedSessionKey ||
          activeSend?.sessionKey ||
          resolvedSessionKey ||
          activeCanonicalKey ||
          activeSessionKey ||
          activeFriendlyId
        const alreadyResolved =
          sessionKey === activeFriendlyId &&
          friendlyId === activeFriendlyId &&
          currentAuthoritativeSessionKey === sessionKey
        if (!alreadyResolved) {
          // Stage the expected route before the outer route owner can navigate.
          // Its callback may synchronously rerender this screen before this
          // continuation resumes; otherwise the route-key effect can mistake an
          // authoritative handoff for unrelated navigation and clear the stream.
          streamHandoffRouteRef.current = { sessionKey, friendlyId }
          try {
            await onSessionResolved?.({
              fromSessionKey,
              sessionKey,
              friendlyId,
              reason,
            })
          } catch (error) {
            if (
              streamHandoffRouteRef.current?.sessionKey === sessionKey &&
              streamHandoffRouteRef.current.friendlyId === friendlyId
            ) {
              streamHandoffRouteRef.current = null
            }
            throw error
          }
        }
        if (activeSend) {
          activeSendRef.current = {
            ...activeSend,
            sessionKey,
            friendlyId,
            ...(friendlyId.startsWith('remote:') ||
            friendlyId.startsWith('local:')
              ? { cardId: friendlyId }
              : {}),
          }
          const resolvedCardId =
            friendlyId.startsWith('remote:') || friendlyId.startsWith('local:')
              ? friendlyId
              : activeSend.cardId
          cardIdForWaiting.current = resolvedCardId
          sessionKeyForWaiting.current = resolvedCardId ?? sessionKey
          liveStreamSessionKeyRef.current = sessionKey
        }
        if (alreadyResolved) return
        if (reason === 'bootstrap') {
          // The server only emits a bootstrap handoff after a fresh
          // authoritative Card projection. Refresh the route's Card list as
          // the stable Card ID replaces the `new` bootstrap segment.
          void queryClient.invalidateQueries({
            queryKey: sessionCardQueryKeys.lists,
          })
        }
        if (reason === 'bootstrap') {
          await moveLegacyHistoryMessagesToSessionCard(
            queryClient,
            friendlyId,
            sessionKey,
          )
        } else if (!activeCard) {
          // A bootstrap can be immediately followed by a successor handoff in
          // the same stream reader batch, before the route has mounted the
          // first Card. Keep the transient overlay on that final Card.
          moveSessionCardHistoryToCard(
            queryClient,
            sourceFriendlyId,
            sourceSessionKey,
            friendlyId,
            sessionKey,
          )
        }
      },
      [
        activeCanonicalKey,
        activeFriendlyId,
        activeSessionKey,
        forcedSessionKey,
        onSessionResolved,
        queryClient,
        resolvedSessionKey,
      ],
    ),
    onStarted: useCallback(
      async ({ runId }: { runId: string | null }) => {
        const activeSend = activeSendRef.current
        if (!activeSend?.clientId) return
        const markAccepted = (message: ChatMessage): ChatMessage => ({
          ...message,
          status: 'sent',
          // Clear __optimisticId so isOptimisticUserMessage returns false.
          // Without this the message keeps being treated as pending and
          // gets re-persisted, causing transcript duplication. Fixes #506.
          __optimisticId: undefined,
          runId: runId ?? message.runId,
        })
        if (activeSend.cardId) {
          await updateSessionCardTransientMessageByClientId(
            queryClient,
            activeSend.cardId,
            activeSend.sessionKey,
            activeSend.clientId,
            markAccepted,
          )
        } else {
          updateHistoryMessageByClientIdEverywhere(
            queryClient,
            activeSend.clientId,
            markAccepted,
          )
          await updatePendingMessageByClientId(
            activeSend.sessionKey,
            activeSend.clientId,
            markAccepted,
            activeSend.provisionalOwnerId,
          )
        }
        setSending(false)
      },
      [queryClient],
    ),
    onComplete: useCallback(
      async (completedMessage: ChatMessage) => {
        const activeSend = activeSendRef.current
        const completedSessionKey = activeSend?.sessionKey
        const completedCardId = activeSend?.cardId
        if (activeSend?.clientId) {
          updateHistoryMessageByClientIdEverywhere(
            queryClient,
            activeSend.clientId,
            (historyMessage) => ({
              ...historyMessage,
              status: 'done',
            }),
          )
        }
        if (activeSend?.sessionKey) {
          let terminalPersisted = true
          if (activeSend.cardId) {
            terminalPersisted = Boolean(
              await checkpointCardTranscriptRecoveryMessage(
                { cardId: activeSend.cardId },
                completedMessage,
              ),
            )
            await appendSessionCardTransientMessage(
              queryClient,
              activeSend.cardId,
              activeSend.sessionKey,
              completedMessage,
              { persistRecovery: false },
            )
          }
          if (activeSend.provisionalOwnerId && !activeSend.cardId) {
            // A successful bootstrap stream may complete before any Card
            // handoff. Retain both sides of the turn until a verified Card
            // migration owns them, so remounting cannot erase the answer.
            terminalPersisted = await checkpointPendingRecoveryMessage(
              'new',
              'new',
              completedMessage,
              activeSend.provisionalOwnerId,
            )
          } else {
            await clearPendingSendForSession(
              activeSend.sessionKey,
              activeSend.friendlyId,
            )
          }
          if (!terminalPersisted) {
            setError(
              'The response completed, but it could not be saved for recovery after reload.',
            )
          }
        }
        activeSendRef.current = null
        liveStreamSessionKeyRef.current = null
        refreshHistoryRef.current()
        setSending(false)
        // Clear waitingForResponse so ThinkingBubble hides and message renders
        streamFinish(completedSessionKey, completedCardId)
        // Play notification sound if the user opted in (Settings → Chat).
        // Read directly from the store to avoid re-creating this callback on every settings change.
        if (useChatSettingsStore.getState().settings.soundOnChatComplete) {
          playChatComplete()
        }
      },
      [queryClient, streamFinish],
    ),
    onInterrupted: useCallback(
      async (interruptedMessage: ChatMessage) => {
        const activeSend = activeSendRef.current
        if (!activeSend) return
        const persisted = activeSend.cardId
          ? Boolean(
              await checkpointCardTranscriptRecoveryMessage(
                { cardId: activeSend.cardId },
                interruptedMessage,
              ),
            )
          : await checkpointPendingRecoveryMessage(
              activeSend.sessionKey,
              activeSend.friendlyId,
              interruptedMessage,
              activeSend.provisionalOwnerId,
            )
        if (activeSend.cardId) {
          await appendSessionCardTransientMessage(
            queryClient,
            activeSend.cardId,
            activeSend.sessionKey,
            interruptedMessage,
            { persistRecovery: false },
          )
        }
        if (!persisted) {
          setError(
            'The stream was interrupted, but its partial response could not be saved for recovery after reload.',
          )
        }
      },
      [queryClient],
    ),
    onError: useCallback(
      async (messageText: string) => {
        const activeSend = activeSendRef.current
        const failedSessionKey = activeSend?.sessionKey
        const failedCardId = activeSend?.cardId
        if (activeSend?.clientId && !isMissingAuth(messageText)) {
          const markFailed = (message: ChatMessage): ChatMessage => ({
            ...message,
            status: 'error',
          })
          if (activeSend.cardId) {
            await updateSessionCardTransientMessageByClientId(
              queryClient,
              activeSend.cardId,
              activeSend.sessionKey,
              activeSend.clientId,
              markFailed,
            )
          } else {
            updateHistoryMessageByClientIdEverywhere(
              queryClient,
              activeSend.clientId,
              markFailed,
            )
            await updatePendingMessageByClientId(
              activeSend.sessionKey,
              activeSend.clientId,
              markFailed,
              activeSend.provisionalOwnerId,
            )
          }
        }
        activeSendRef.current = null
        liveStreamSessionKeyRef.current = null
        setSending(false)
        if (isMissingAuth(messageText)) {
          streamFinish(failedSessionKey, failedCardId)
          if (!embedded) {
            try {
              navigate({ to: '/', replace: true })
            } catch {
              /* router not ready */
            }
          }
          return
        }
        const errorMessage = `Failed to send message. ${messageText}`
        setError(errorMessage)
        toast('Failed to send message', { type: 'error' })
        showErrorToast(messageText)
        streamFinish(failedSessionKey, failedCardId)
      },
      [navigate, queryClient, streamFinish],
    ),
    onMessageAccepted: useCallback(
      (_sessionKey: string, friendlyId: string, clientId: string) => {
        // HTTP 200 received — server accepted the message. Clear "sending"
        // status immediately so the Retry timer never fires. This is the
        // primary confirmation path since the server does NOT echo user
        // messages back via SSE.
        updateHistoryMessageByClientId(
          queryClient,
          friendlyId,
          _sessionKey,
          clientId,
          (message) => ({
            ...message,
            status: 'queued',
          }),
        )
        updateHistoryMessageByClientIdEverywhere(
          queryClient,
          clientId,
          (message) => ({
            ...message,
            status: 'queued',
          }),
        )
      },
      [queryClient],
    ),
    onReaderOpened: useCallback((sessionKey: string) => {
      // Ownership starts at actual reader acquisition, not request creation.
      // A stale/superseded request cannot claim another send's session.
      if (activeSendRef.current?.sessionKey === sessionKey) {
        liveStreamSessionKeyRef.current = sessionKey
        setLocalReaderOwnershipVersion((version) => version + 1)
      }
    }, []),
    onAbort: useCallback((abortedSessionKey: string) => {
      const activeSend = activeSendRef.current
      // The hook captures the reader's origin key. Never let a late abort for
      // that reader clear a newer destination send or its recovery-confirmed
      // wait after route navigation.
      if (activeSend?.sessionKey === abortedSessionKey && activeSend.cardId) {
        useChatStore.getState().clearCardWaiting(activeSend.cardId)
      } else {
        useChatStore.getState().clearSessionWaiting(abortedSessionKey)
      }
      if (activeSend?.sessionKey !== abortedSessionKey) return
      activeSendRef.current = null
      liveStreamSessionKeyRef.current = null
      setSending(false)
      setPendingGeneration(false)
    }, []),
    acceptedTimeoutMs: modelsQuery.data?.streamAcceptedTimeoutMs,
    handoffTimeoutMs: modelsQuery.data?.streamHandoffTimeoutMs,
  })

  // A stream is owned by the Card/session that started it, not by the currently
  // selected route. `useStreamingMessage` records that owner and dispatches each
  // event back to it, so changing Chats must not abort an accepted agent run.
  // Explicit Stop and starting a replacement send still call cancelStreaming().

  const activeIsRealtimeStreaming = isPortableMode
    ? localIsStreaming
    : isRealtimeStreaming
  const activeRealtimeStreamingText = isPortableMode
    ? localStreamingText
    : realtimeStreamingText
  const smoothActiveStreamingText = useSmoothStreamingText(
    activeRealtimeStreamingText,
    activeIsRealtimeStreaming,
  )
  const stickyStreamingTextRef = useRef<{ runId: string | null; text: string }>(
    {
      runId: null,
      text: '',
    },
  )
  stickyStreamingTextRef.current = advanceStickyStreamingText({
    isStreaming: activeIsRealtimeStreaming,
    runId: streamingRunId ?? null,
    rawText: activeRealtimeStreamingText,
    smoothedText: smoothActiveStreamingText,
    previousState: stickyStreamingTextRef.current,
  })
  const stableActiveStreamingText = activeIsRealtimeStreaming
    ? smoothActiveStreamingText ||
      activeRealtimeStreamingText ||
      stickyStreamingTextRef.current.text
    : ''
  const activeStreamingStates = useMemo(
    () =>
      isPortableMode
        ? localIsStreaming
          ? [
              {
                runId: streamingRunId ?? null,
                text: stableActiveStreamingText,
                thinking: realtimeStreamingThinking,
                lifecycleEvents: realtimeLifecycleEvents,
                toolCalls: activeToolCalls,
              },
            ]
          : []
        : realtimeStreamingStates.length > 0
          ? realtimeStreamingStates
          : activeIsRealtimeStreaming
            ? [
                {
                  runId: streamingRunId,
                  text: stableActiveStreamingText,
                  thinking: realtimeStreamingThinking,
                  lifecycleEvents: realtimeLifecycleEvents,
                  toolCalls: activeToolCalls,
                },
              ]
            : [],
    [
      activeToolCalls,
      activeIsRealtimeStreaming,
      isPortableMode,
      localIsStreaming,
      realtimeLifecycleEvents,
      realtimeStreamingStates,
      realtimeStreamingThinking,
      stableActiveStreamingText,
      streamingRunId,
    ],
  )

  // Use realtime-merged messages for display (SSE + history)
  // Re-apply display filter to realtime messages
  const parentDisplayMessages = useMemo(() => {
    const filtered = realtimeMessages.filter((msg) => {
      if (msg.role === 'user') {
        const text = stripQueuedWrapper(textFromMessage(msg))
        if (text.startsWith('A subagent task')) return false
        return true
      }
      if (msg.role === 'assistant') {
        if (msg.__streamingStatus === 'streaming') return true
        if ((msg as any).__optimisticId && !msg.content?.length) return true
        if (textFromMessage(msg).trim().length > 0) return true
        const content = Array.isArray(msg.content) ? msg.content : []
        const hasToolCalls = content.some((part) => part.type === 'toolCall')
        const hasStreamToolCalls =
          Array.isArray((msg as any).__streamToolCalls) &&
          (msg as any).__streamToolCalls.length > 0
        return hasToolCalls || hasStreamToolCalls
      }
      return false
    })

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
    const seenByText = new Map<string, ChatMessage>()
    const dedupedSet = new Set<ChatMessage>()
    for (const msg of sortedForDedup) {
      const raw = msg as Record<string, unknown>
      const rawOptimisticId = normalizeMessageValue(raw.__optimisticId)
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

      const text = stripQueuedWrapper(textFromMessage(msg)).trim()
      if (text.length > 0) {
        const normalizedText = text.replace(/\s+/g, ' ')
        const textKey = `${msg.role}:text:${normalizedText}`
        const existingTextMatch = seenByText.get(textKey)
        if (
          existingTextMatch &&
          shouldCollapseTextDuplicate(existingTextMatch, msg)
        ) {
          continue
        }
        if (!existingTextMatch) {
          seenByText.set(textKey, msg)
        }
      }

      seen.add(primaryKey)
      for (const candidate of idCandidates.slice(1)) {
        seen.add(`${msg.role}:id:${candidate}`)
      }
      dedupedSet.add(msg)
    }

    const deduped = filtered
      .filter((msg) => dedupedSet.has(msg))
      .map((msg) => stripQueuedWrapperFromUserMessage(msg))

    if (activeStreamingStates.length === 0) return deduped

    const nextMessages = deduped.filter(
      (message) => message.__streamingStatus !== 'streaming',
    )
    for (const stream of activeStreamingStates) {
      const runId = stream.runId?.trim() || null
      const streamingText =
        runId && runId === streamingRunId
          ? stableActiveStreamingText || stream.text
          : stream.text
      const hasServerAssistantVersion = nextMessages.some(
        (message) =>
          message.role === 'assistant' &&
          message.__streamingStatus !== 'streaming' &&
          Boolean(runId && message.runId === runId),
      )
      if (hasServerAssistantVersion) continue
      nextMessages.push({
        role: 'assistant',
        content: [],
        __optimisticId:
          activeStreamingStates.length === 1
            ? 'streaming-current'
            : `streaming-${runId ?? 'pending'}`,
        __streamingStatus: 'streaming',
        __streamingText: streamingText,
        __streamingThinking: stream.thinking,
        __streamToolCalls: stream.toolCalls,
        ...(runId ? { runId, stableId: `stream-run:${runId}` } : {}),
      } as ChatMessage)
    }
    return nextMessages
  }, [
    activeStreamingStates,
    realtimeMessages,
    stableActiveStreamingText,
    streamingRunId,
  ])

  const inspectedChildDisplayMessages = useMemo(() => {
    const messages = inspectedChildHistoryQuery.data?.messages ?? []
    return messages
      .filter((message) => {
        if (message.role === 'user') {
          const text = stripQueuedWrapper(textFromMessage(message))
          return !text.startsWith('A subagent task')
        }
        if (message.role !== 'assistant') return false
        if (textFromMessage(message).trim().length > 0) return true
        const content = Array.isArray(message.content) ? message.content : []
        return content.some((part) => part.type === 'toolCall')
      })
      .map((message) => stripQueuedWrapperFromUserMessage(message))
  }, [inspectedChildHistoryQuery.data?.messages])
  const finalDisplayMessages = inspectedChildCard
    ? inspectedChildDisplayMessages
    : parentDisplayMessages

  const derivedStreamingInfo = useMemo(() => {
    if (activeIsRealtimeStreaming) {
      const last = parentDisplayMessages.at(-1)
      const id = isPortableMode
        ? localStreamingMessageId
        : last?.role === 'assistant'
          ? (last as any).__optimisticId || (last as any).id || null
          : null
      return { isStreaming: true, streamingMessageId: id }
    }
    if (waitingForResponse && parentDisplayMessages.length > 0) {
      const last = parentDisplayMessages.at(-1)
      if (last && last.role === 'assistant') {
        const isStreamingPlaceholder =
          (last as any).__streamingStatus === 'streaming'
        if (!isStreamingPlaceholder) {
          return {
            isStreaming: false,
            streamingMessageId: null as string | null,
          }
        }
        const id = (last as any).__optimisticId || (last as any).id || null
        return { isStreaming: true, streamingMessageId: id }
      }
    }
    return { isStreaming: false, streamingMessageId: null as string | null }
  }, [
    waitingForResponse,
    parentDisplayMessages,
    activeIsRealtimeStreaming,
    isPortableMode,
    localStreamingMessageId,
  ])

  const responseWaitSnapshotRef = useRef<ResponseWaitSnapshot | null>(null)
  const prevIsRealtimeStreamingRef = useRef(activeIsRealtimeStreaming)
  const activeRealtimeStreamingRef = useRef(activeIsRealtimeStreaming)

  useEffect(() => {
    activeRealtimeStreamingRef.current = activeIsRealtimeStreaming
  }, [activeIsRealtimeStreaming])

  useEffect(() => {
    if (!waitingForResponse) {
      responseWaitSnapshotRef.current = null
      return
    }
    if (responseWaitSnapshotRef.current) return
    responseWaitSnapshotRef.current = createResponseWaitSnapshot(
      parentDisplayMessages,
    )
  }, [waitingForResponse, parentDisplayMessages])

  useEffect(() => {
    if (!waitingForResponse) {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
      return
    }
    const snapshot = responseWaitSnapshotRef.current
    if (!snapshot) return
    if (
      shouldClearWaitingForAssistantMessage(parentDisplayMessages, snapshot)
    ) {
      if (clearTimerRef.current) return
      clearTimerRef.current = window.setTimeout(() => {
        clearTimerRef.current = null
        streamFinish()
      }, 50)
    }
  }, [parentDisplayMessages, waitingForResponse, streamFinish])

  useEffect(() => {
    const wasStreaming = prevIsRealtimeStreamingRef.current
    prevIsRealtimeStreamingRef.current = activeIsRealtimeStreaming
    if (wasStreaming && !activeIsRealtimeStreaming && waitingForResponse) {
      if (clearTimerRef.current) return
      clearTimerRef.current = window.setTimeout(() => {
        clearTimerRef.current = null
        streamFinish()
      }, 100)
    }
  }, [activeIsRealtimeStreaming, waitingForResponse, streamFinish])

  const handleSwitchModel = useCallback(() => {
    if (!suggestion || !activeCard?.cardId) return
    useSessionModelStore
      .getState()
      .setModel(activeCard.cardId, suggestion.suggestedModel)
    dismiss()
  }, [activeCard?.cardId, dismiss, suggestion])

  // Sync chat activity to global store for sidebar orchestrator avatar
  const setLocalActivity = useChatActivityStore((s) => s.setLocalActivity) as (
    next: AgentActivity,
  ) => void
  useEffect(() => {
    if (liveToolActivity.length > 0) {
      setLocalActivity('tool-use')
    } else if (activeIsRealtimeStreaming) {
      setLocalActivity('responding')
    } else if (waitingForResponse) {
      setLocalActivity('thinking')
    } else {
      setLocalActivity('idle')
    }
  }, [
    waitingForResponse,
    activeIsRealtimeStreaming,
    liveToolActivity,
    setLocalActivity,
  ])

  const statusQuery = useQuery({
    queryKey: ['claude', 'status'],
    queryFn: fetchStatus,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 30_000,
    refetchInterval: 60_000, // Re-check every 60s to clear stale errors
  })
  // Don't show errors for new chats or when SSE is connected
  const statusError =
    !isNewChat && connectionState !== 'connected'
      ? statusQuery.error instanceof Error
        ? {
            message: statusQuery.error.message,
            status: (statusQuery.error as Error & { status?: number }).status,
          }
        : statusQuery.data && !statusQuery.data.ok
          ? {
              message: statusQuery.data.error || 'Hermes Agent unavailable',
              status: statusQuery.data.status,
            }
          : null
      : null
  const legacySessionsError = activeCard ? null : sessionsError
  const serverError =
    statusError?.message ?? legacySessionsError ?? displayedHistoryError
  const serverErrorStatus = statusError?.status
  const showErrorNotice = Boolean(serverError) && !isNewChat
  const handleRefetch = useCallback(() => {
    void statusQuery.refetch()
    if (!activeCard) void sessionsQuery.refetch()
    void displayedHistoryQuery.refetch()
  }, [activeCard, statusQuery, sessionsQuery, displayedHistoryQuery])

  const handleRefreshHistory = useCallback(() => {
    void displayedHistoryQuery.refetch()
  }, [displayedHistoryQuery])

  useEffect(() => {
    const handleRefreshRequest = () => {
      void historyQuery.refetch()
    }
    window.addEventListener('claude:chat-refresh', handleRefreshRequest)
    return () => {
      window.removeEventListener('claude:chat-refresh', handleRefreshRequest)
    }
  }, [historyQuery])

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        void historyQuery.refetch()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility)
  }, [historyQuery])

  // Re-mount catch-up: when navigating back to chat from another tab (Skills,
  // Memory, etc.), the component re-mounts. If a response finished while we
  // were away, the initial refetch may hit stale data. A delayed re-refetch
  // ensures we pick up responses that were persisted shortly after the first
  // fetch. See: https://github.com/outsourc-e/hermes-workspace/issues/43
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void historyQuery.refetch()
    }, 2000)
    return () => window.clearTimeout(timer)
  }, []) // Mount-only initialization.

  useEffect(() => {
    function handleSSEDrop() {
      void historyQuery.refetch()
    }
    window.addEventListener('claude:sse-dropped', handleSSEDrop)
    return () => {
      window.removeEventListener('claude:sse-dropped', handleSSEDrop)
    }
  }, [historyQuery])

  const terminalPanelInset =
    !isMobile && isTerminalPanelOpen && !chatFocusMode ? terminalPanelHeight : 0
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
        terminalPanelInset > 0 ? `${terminalPanelInset + 16}px` : '16px',
    }
  }, [isMobile, terminalPanelInset])

  const shouldRedirectToNew =
    !isNewChat &&
    !activeCard &&
    !forcedSessionKey &&
    // `main` is an explicitly allowed bootstrap identity. It must remain in
    // place until a server-verified Card handoff replaces it.
    activeFriendlyId !== 'main' &&
    !isRecentSession(activeFriendlyId) &&
    sessionsQuery.isSuccess &&
    sessions.length > 0 &&
    !sessions.some((session) => session.friendlyId === activeFriendlyId) &&
    !historyQuery.isFetching &&
    !historyQuery.isSuccess

  useEffect(() => {
    if (legacyRedirecting) {
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
      !legacySessionsError &&
      !displayedHistoryError
    ) {
      if (error) setError(null)
      return
    }
    const messageText =
      legacySessionsError ?? displayedHistoryError ?? statusError?.message
    if (!messageText) {
      if (error?.startsWith('Failed to load')) {
        setError(null)
      }
      return
    }
    if (isMissingAuth(messageText) && !embedded) {
      navigate({ to: '/', replace: true })
    }
    const message = legacySessionsError
      ? `Failed to load sessions. ${legacySessionsError}`
      : displayedHistoryError
        ? `Failed to load history. ${displayedHistoryError}`
        : statusError
          ? `Hermes Agent unavailable. ${statusError.message}`
          : null
    if (message) setError(message)
  }, [
    activeExists,
    error,
    statusError,
    displayedHistoryError,
    legacyRedirecting,
    navigate,
    legacySessionsError,
    sessionsQuery.isSuccess,
    shouldRedirectToNew,
  ])

  useEffect(() => {
    if (!isRedirecting) return
    if (activeCard || isNewChat) {
      setIsRedirecting(false)
      return
    }
    if (!shouldRedirectToNew && sessionsQuery.isSuccess) {
      setIsRedirecting(false)
    }
  }, [
    activeCard,
    isNewChat,
    isRedirecting,
    sessionsQuery.isSuccess,
    shouldRedirectToNew,
  ])

  useEffect(() => {
    if (activeCard) return
    if (embedded) return
    if (isNewChat) return
    if (!sessionsQuery.isSuccess) return
    if (sessions.length === 0) return
    if (!shouldRedirectToNew) return
    void (async () => {
      try {
        await resetPendingSend()
      } catch {
        setError(
          'The conversation was not reset because pending recovery could not be cleared safely.',
        )
        return
      }
      clearHistoryMessages(
        queryClient,
        activeFriendlyId,
        sessionKeyForHistory || activeFriendlyId,
      )
      navigate({
        to: '/chat/$sessionKey',
        // Nonbootstrap legacy identities cannot become a Card route by selecting
        // an arbitrary raw session-list row. Restart only from the explicit
        // bootstrap sentinel, which may later advance through a verified handoff.
        params: { sessionKey: 'new' },
        replace: true,
      })
    })()
  }, [
    activeCard,
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
    embedded,
  ])

  const hideUi = shouldRedirectToNew || legacyRedirecting
  const isFocusMode = !compact && chatFocusMode
  const showComposer = !legacyRedirecting

  const handleToggleFocusMode = useCallback(() => {
    if (compact) return
    setChatFocusMode(!chatFocusMode)
  }, [chatFocusMode, compact, setChatFocusMode])

  useEffect(() => {
    if (compact && chatFocusMode) {
      setChatFocusMode(false)
    }
  }, [chatFocusMode, compact, setChatFocusMode])

  useEffect(() => {
    if (!chatFocusMode) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setChatFocusMode(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatFocusMode, setChatFocusMode])

  // ⌘. (Mac) / Ctrl+. (Win) to toggle focus mode
  useEffect(() => {
    if (compact) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '.' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setChatFocusMode(!chatFocusMode)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [compact, chatFocusMode, setChatFocusMode])

  useEffect(() => {
    return () => {
      useWorkspaceStore.getState().setChatFocusMode(false)
    }
  }, [])

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
    async function sendMessage(
      sessionKey: string,
      friendlyId: string,
      body: string,
      attachments: Array<ChatAttachment> = [],
      fastMode = false,
      skipOptimistic = false,
      existingClientId = '',
      provisionalOwnerId = '',
    ) {
      // Claim New Session's one-shot primary-model default before retaining the
      // Card. Retaining removes the browser-owned creation/discard lifecycle
      // before optimistic or network work can race with route navigation.
      const isFirstSendFromNewSession = activeCard
        ? consumeNewSessionCardPrimaryModel(activeCard.cardId)
        : false
      if (activeCard) retainNewSessionCard(activeCard.cardId)
      // Read from ref so we always get the latest value without capturing it in deps
      const currentThinkingLevel = thinkingLevelRef.current
      setLocalActivity('reading')
      const normalizedAttachments = attachments.map((attachment) => ({
        ...attachment,
        id: attachment.id ?? crypto.randomUUID(),
      }))

      // Inject text/file attachment content directly into the message body.
      // Servers reliably forward text in the message body; file attachments
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
      setResearchResetKey((current) => current + 1)
      if (!skipOptimistic) {
        const { clientId, optimisticMessage } = createOptimisticMessage(
          body,
          normalizedAttachments,
        )
        optimisticClientId = clientId
        if (activeCard && activeCardCanonicalSegmentKey) {
          await appendSessionCardTransientMessage(
            queryClient,
            activeCard.cardId,
            activeCardCanonicalSegmentKey,
            optimisticMessage,
          )
        } else {
          appendHistoryMessage(
            queryClient,
            friendlyId,
            sessionKey,
            optimisticMessage,
          )
        }
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
      clearCompletedStreaming()
      // A send request alone is not live-stream ownership. That begins only
      // when useStreamingMessage obtains an actual SSE reader.
      liveStreamSessionKeyRef.current = null
      setWaitingForResponse(true)
      activeSendRef.current = {
        sessionKey,
        friendlyId,
        ...(activeCard ? { cardId: activeCard.cardId } : {}),
        clientId: optimisticClientId,
        ...(provisionalOwnerId ? { provisionalOwnerId } : {}),
      }

      // Failsafe: clear waitingForResponse after 120s no matter what
      // Prevents infinite spinner if SSE/idle detection both fail
      if (failsafeTimerRef.current) {
        window.clearTimeout(failsafeTimerRef.current)
      }
      failsafeTimerRef.current = window.setTimeout(() => {
        streamFinish()
      }, 120_000)

      // Send a compatibility shape for attachment parsing.
      // Different server/channel versions read different keys.
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
      // Child inspection changes only what is rendered. Sends always continue
      // the parent Card with its independently maintained parent transcript.
      const history = buildPortableHistory(parentDisplayMessages)

      try {
        streamStart()
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn('[chat] streamStart error (non-fatal):', e)
        }
      }

      // Only the browser-owned New Session flow gets a one-shot default-model
      // exemption. An empty pre-existing Card still uses its resolved gateway
      // model, and an explicit Card-owned selection always wins.
      const cardId = activeCard?.cardId
      const explicitCardModel = cardId
        ? useSessionModelStore.getState().getModel(cardId)
        : ''
      // `hermes-agent`/`default` are Gateway routing aliases. They may survive
      // in a Card status or old localStorage, but must never be sent as an
      // explicit provider model to Codex.
      const requestModel = cardId
        ? (!isGatewayDefaultAlias(explicitCardModel)
            ? explicitCardModel
            : '') ||
          (isFirstSendFromNewSession || isGatewayDefaultAlias(gatewayModel)
            ? undefined
            : gatewayModel)
        : isGatewayDefaultAlias(currentModel)
          ? undefined
          : currentModel
      await startStreaming({
        sessionKey,
        friendlyId,
        cardId: activeCard?.cardId,
        message: enrichedBody,
        history,
        attachments:
          payloadAttachments.length > 0 ? payloadAttachments : undefined,
        thinking:
          currentThinkingLevel === 'off' ? undefined : currentThinkingLevel,
        fastMode,
        model: requestModel || undefined,
        idempotencyKey: optimisticClientId || crypto.randomUUID(),
      })
    },
    [
      activeCard,
      activeCardCanonicalSegmentKey,
      parentDisplayMessages,
      clearCompletedStreaming,
      queryClient,
      setLocalActivity,
      startStreaming,
      streamFinish,
      streamStart,
      currentModel,
      gatewayModel,
    ],
  )

  useLayoutEffect(() => {
    if (isNewChat || !cardTransportReady) return
    const currentSessionKey = activeCard
      ? activeCardCanonicalSegmentKey || ''
      : isPortableMode
        ? 'main'
        : forcedSessionKey || resolvedSessionKey || activeSessionKey
    const pending = consumePendingSend(currentSessionKey, transportFriendlyId)
    if (!pending) return
    pendingStartRef.current = true
    const historyKey = activeCard
      ? sessionCardQueryKeys.history(activeCard.cardId)
      : chatQueryKeys.history(transportFriendlyId, currentSessionKey)
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
    void (async () => {
      try {
        if (!alreadyHasOptimistic) {
          if (activeCard && activeCardCanonicalSegmentKey) {
            await appendSessionCardTransientMessage(
              queryClient,
              activeCard.cardId,
              activeCardCanonicalSegmentKey,
              pending.optimisticMessage,
            )
          } else {
            appendHistoryMessage(
              queryClient,
              transportFriendlyId,
              currentSessionKey,
              pending.optimisticMessage,
            )
          }
        }
        setWaitingForResponse(true)
        await sendMessage(
          currentSessionKey,
          transportFriendlyId,
          pending.message,
          pending.attachments,
          false,
          true,
          typeof pending.optimisticMessage.clientId === 'string'
            ? pending.optimisticMessage.clientId
            : '',
        )
      } catch {
        setWaitingForResponse(false)
        setError(
          'This message was not sent because its recovery state could not be saved safely.',
        )
      }
    })()
  }, [
    activeCard,
    activeCardCanonicalSegmentKey,
    activeSessionKey,
    cardTransportReady,
    forcedSessionKey,
    isNewChat,
    isPortableMode,
    transportFriendlyId,
    queryClient,
    resolvedSessionKey,
    sendMessage,
  ])

  const retryQueuedMessage = useCallback(
    function retryQueuedMessage(message: ChatMessage, mode: 'manual' | 'auto') {
      if (!cardTransportReady) return false
      if (!isRetryableQueuedMessage(message)) return false

      const body = textFromMessage(message).trim()
      const attachments = getMessageRetryAttachments(message)
      if (body.length === 0 && attachments.length === 0) return false

      const retryKey = getRetryMessageKey(message)
      if (
        mode === 'auto' &&
        retriedQueuedMessageKeysRef.current.has(retryKey)
      ) {
        return false
      }

      const sessionKeyForSend = activeCard
        ? activeCardCanonicalSegmentKey || ''
        : isPortableMode
          ? 'main'
          : forcedSessionKey || resolvedSessionKey || activeSessionKey || 'main'
      const sessionKeyForMessage = sessionKeyForHistory || sessionKeyForSend
      const existingClientId = getMessageClientId(message)

      if (existingClientId) {
        updateHistoryMessageByClientId(
          queryClient,
          transportFriendlyId,
          sessionKeyForMessage,
          existingClientId,
          function markSending(currentMessage) {
            return { ...currentMessage, status: 'sending' }
          },
        )
        updateHistoryMessageByClientIdEverywhere(
          queryClient,
          existingClientId,
          function markSendingEverywhere(currentMessage) {
            return { ...currentMessage, status: 'sending' }
          },
        )
      }

      if (mode === 'auto') {
        retriedQueuedMessageKeysRef.current.add(retryKey)
      }

      sendMessage(
        sessionKeyForSend,
        transportFriendlyId,
        body,
        attachments,
        false,
        true,
        existingClientId,
      )
      return true
    },
    [
      activeCard,
      activeCardCanonicalSegmentKey,
      activeSessionKey,
      cardTransportReady,
      forcedSessionKey,
      isPortableMode,
      transportFriendlyId,
      queryClient,
      resolvedSessionKey,
      sessionKeyForHistory,
      sendMessage,
    ],
  )

  const flushRetryableMessages = useCallback(
    function flushRetryableMessages() {
      for (const message of parentDisplayMessages) {
        retryQueuedMessage(message, 'auto')
      }
    },
    [parentDisplayMessages, retryQueuedMessage],
  )

  const handleRetryMessage = useCallback(
    function handleRetryMessage(message: ChatMessage) {
      const retryKey = getRetryMessageKey(message)
      retriedQueuedMessageKeysRef.current.delete(retryKey)
      retryQueuedMessage(message, 'manual')
    },
    [retryQueuedMessage],
  )

  useEffect(() => {
    if (connectionState === 'connected' && hasSeenDisconnectRef.current) {
      hasSeenDisconnectRef.current = false
      flushRetryableMessages()
    }
  }, [connectionState, flushRetryableMessages])

  useEffect(() => {
    if (statusError) {
      hadErrorRef.current = true
      retriedQueuedMessageKeysRef.current.clear()
      return
    }

    const isHealthy = statusQuery.data?.ok === true
    if (isHealthy && hadErrorRef.current) {
      hadErrorRef.current = false
      flushRetryableMessages()
    }
  }, [flushRetryableMessages, statusError, statusQuery.data])

  useEffect(() => {
    function handleHealthRestored() {
      retriedQueuedMessageKeysRef.current.clear()
      hadErrorRef.current = false
      flushRetryableMessages()
      handleRefetch()
    }

    window.addEventListener('claude:health-restored', handleHealthRestored)
    return () => {
      window.removeEventListener('claude:health-restored', handleHealthRestored)
    }
  }, [flushRetryableMessages, handleRefetch])

  const scrollChatToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const viewport = document.querySelector('[data-chat-scroll-viewport]')
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior })
      }
    },
    [],
  )

  const handleUiSlashCommand = useCallback(
    (command: string) => {
      const trimmedCommand = command.trim()
      if (!trimmedCommand.startsWith('/')) return false

      if (trimmedCommand === '/new') {
        // Use the explicit 'new' session sentinel rather than '/chat' alone.
        // The /chat index route redirects to the last-active session via
        // localStorage, so navigating to '/chat' would land in the previous
        // chat instead of opening a fresh one. See #300.
        navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })
        return true
      }

      if (trimmedCommand === '/clear') {
        const sessionKey =
          forcedSessionKey ||
          resolvedSessionKey ||
          activeSessionKey ||
          activeFriendlyId
        if (activeCard && activeCardCanonicalSegmentKey) {
          updateSessionCardHistoryMessages(
            queryClient,
            activeCard.cardId,
            activeCardCanonicalSegmentKey,
            () => [],
          )
        } else {
          clearHistoryMessages(queryClient, activeFriendlyId, sessionKey)
        }
        toast('Chat cleared', { type: 'success' })
        return true
      }

      if (trimmedCommand === '/model' || trimmedCommand === '/skin') {
        window.dispatchEvent(
          new CustomEvent(CHAT_OPEN_SETTINGS_EVENT, {
            detail: {
              section: trimmedCommand === '/skin' ? 'appearance' : 'claude',
            },
          }),
        )
        return true
      }

      if (trimmedCommand === '/skills') {
        navigate({ to: '/skills' })
        return true
      }

      if (trimmedCommand === '/save') {
        const exported = exportConversationTranscript({
          sessionLabel: activeFriendlyId || 'conversation',
          messages: finalDisplayMessages,
        })
        if (exported) {
          toast('Conversation exported', { type: 'success' })
        }
        return true
      }

      return false
    },
    [
      activeCard,
      activeCardCanonicalSegmentKey,
      activeFriendlyId,
      activeSessionKey,
      finalDisplayMessages,
      forcedSessionKey,
      navigate,
      queryClient,
      resolvedSessionKey,
    ],
  )

  const send = useCallback(
    async (
      body: string,
      attachments: Array<ChatComposerAttachment>,
      fastMode: boolean,
      helpers: ChatComposerHelpers,
    ) => {
      const trimmedBody = body.trim()
      if (trimmedBody.length === 0 && attachments.length === 0) return
      if (!cardTransportReady) {
        setError(cardSourceError)
        return
      }
      if (attachments.length === 0 && handleUiSlashCommand(trimmedBody)) return

      // Deduplicate sends with identical content within a 500ms window.
      // This prevents double-fire from paste events that trigger multiple send paths.
      const sendKey = `${trimmedBody}|${attachments.map((a) => `${a.name}:${a.size}`).join(',')}`
      const now = Date.now()
      if (
        sendKey === lastSendKeyRef.current &&
        now - lastSendAtRef.current < 500
      )
        return
      lastSendKeyRef.current = sendKey
      lastSendAtRef.current = now

      const attachmentPayload: Array<ChatAttachment> = attachments.map(
        (attachment) => ({
          id: attachment.id || crypto.randomUUID(),
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          dataUrl: attachment.dataUrl,
        }),
      )
      // Every accepted send needs a durable owner before transport starts;
      // post-accept assistant checkpoints depend on this admission record.
      const missingPortableAttachment = attachmentPayload.some(
        (attachment) =>
          !parsePortableAttachmentDataUrl(
            attachment.dataUrl,
            attachment.contentType,
          ),
      )
      const optimistic = createOptimisticMessage(trimmedBody, attachmentPayload)
      const durableOptimisticMessage = optimistic.optimisticMessage
      const durableClientId = optimistic.clientId
      if (
        missingPortableAttachment ||
        !isCardTranscriptRecoveryMessagePortable(optimistic.optimisticMessage)
      ) {
        const safeMessage =
          attachmentPayload.length > 0
            ? 'This message was not sent because its attachments cannot be stored safely for recovery. Remove or reduce the attachments and try again.'
            : 'This first message was not sent because it cannot be stored safely until the new conversation is created. Reduce it and try again.'
        setError(safeMessage)
        toast(safeMessage, { type: 'error' })
        showErrorToast(safeMessage)
        return
      }

      const sessionKeyForSend = isNewChat
        ? 'new'
        : activeCard
          ? activeCardCanonicalSegmentKey || ''
          : isPortableMode
            ? 'main'
            : forcedSessionKey ||
              resolvedSessionKey ||
              activeSessionKey ||
              'main'

      const provisionalOwnerId = isNewChat ? getNewChatProvisionalOwnerId() : ''

      const retryOwnerKey = activeCard?.cardId
        ? `${activeCard.canonicalSource}:${activeCard.cardId}`
        : isNewChat
          ? 'new'
          : `${sessionKeyForSend}:${transportFriendlyId}`
      const persistExactAdmission = async (): Promise<boolean> => {
        let persisted = false
        try {
          if (activeCard) {
            persisted = Boolean(
              await appendCardTranscriptRecoveryMessage(
                { cardId: activeCard.cardId },
                durableOptimisticMessage,
              ),
            )
            if (!persisted) {
              await removeRejectedCardTranscriptRecoveryMessage(
                { cardId: activeCard.cardId },
                durableClientId,
              )
            }
          } else {
            persisted = await persistPendingMessage({
              sessionKey: sessionKeyForSend,
              friendlyId: isNewChat ? 'new' : transportFriendlyId,
              ...(provisionalOwnerId ? { provisionalOwnerId } : {}),
              message: trimmedBody,
              attachments: attachmentPayload,
              optimisticMessage: durableOptimisticMessage,
            })
          }
        } catch {
          persisted = false
        }
        return persisted
      }

      const continueAfterAdmission = async (): Promise<void> => {
        if (activeCard) {
          await appendSessionCardTransientMessage(
            queryClient,
            activeCard.cardId,
            sessionKeyForSend,
            durableOptimisticMessage,
            { persistRecovery: false },
          )
        } else {
          appendHistoryMessage(
            queryClient,
            isNewChat ? 'new' : transportFriendlyId,
            sessionKeyForSend,
            durableOptimisticMessage,
          )
        }
        updateSessionLastMessage(
          queryClient,
          sessionKeyForSend,
          isNewChat ? 'new' : transportFriendlyId,
          durableOptimisticMessage,
        )

        helpers.reset()
        // Haptic feedback on mobile only after the durable overlay is accepted.
        if (isMobile) hapticTap()
        requestAnimationFrame(() => scrollChatToBottom('smooth'))

        await sendMessage(
          sessionKeyForSend,
          isNewChat ? 'new' : transportFriendlyId,
          trimmedBody,
          attachmentPayload,
          fastMode,
          true,
          durableClientId,
          provisionalOwnerId,
        )
      }

      const persisted = await persistExactAdmission()
      if (!persisted) {
        const safeMessage =
          attachmentPayload.length > 0
            ? 'This message was not sent because its attachments could not be saved for recovery. Free browser storage or remove the attachments, then try again.'
            : activeCard
              ? 'This message was not sent because it could not be saved safely. Free browser storage and try again.'
              : 'This first message was not sent because it could not be saved safely. Free browser storage and try again.'
        if (!embedded && retryOwnerKey) {
          workspaceChatAdmissionRetryBusyRef.current = false
          setWorkspaceChatAdmissionRetry({
            ownerKey: retryOwnerKey,
            safeMessage,
            retryPersistence: persistExactAdmission,
            continueAfterAdmission,
          })
          setWorkspaceChatAdmissionRetryError(null)
        }
        setError(safeMessage)
        toast(safeMessage, { type: 'error' })
        showErrorToast(safeMessage)
        return
      }
      setWorkspaceChatAdmissionRetry(null)
      setWorkspaceChatAdmissionRetryError(null)
      workspaceChatAdmissionRetryBusyRef.current = false
      await continueAfterAdmission()
    },
    [
      activeCard,
      activeCardCanonicalSegmentKey,
      activeFriendlyId,
      activeSessionKey,
      cardSourceError,
      cardTransportReady,
      embedded,
      forcedSessionKey,
      isNewChat,
      isPortableMode,
      scrollChatToBottom,
      sendMessage,
      transportFriendlyId,
      queryClient,
      resolvedSessionKey,
      handleUiSlashCommand,
    ],
  )

  const workspaceChatAdmissionOwnerKey = activeCard?.cardId
    ? `${activeCard.canonicalSource}:${activeCard.cardId}`
    : isNewChat
      ? 'new'
      : `${
          isPortableMode
            ? 'main'
            : forcedSessionKey ||
              resolvedSessionKey ||
              activeSessionKey ||
              'main'
        }:${transportFriendlyId}`
  useEffect(() => {
    workspaceChatAdmissionRetryBusyRef.current = false
    setWorkspaceChatAdmissionRetry(null)
    setWorkspaceChatAdmissionRetryError(null)
    setWorkspaceChatAdmissionRetryBusy(false)
  }, [workspaceChatAdmissionOwnerKey])

  const handleResetWorkspaceChatRecoveryAndRetry = useCallback(async () => {
    const pending = workspaceChatAdmissionRetry
    if (!pending || workspaceChatAdmissionRetryBusyRef.current) return
    if (pending.ownerKey !== workspaceChatAdmissionOwnerKey) {
      setWorkspaceChatAdmissionRetry(null)
      setWorkspaceChatAdmissionRetryError(null)
      return
    }

    workspaceChatAdmissionRetryBusyRef.current = true
    setWorkspaceChatAdmissionRetryBusy(true)
    setWorkspaceChatAdmissionRetryError(null)
    try {
      const database = await resetWorkspaceChatIndexedDb()
      database.close()
    } catch {
      workspaceChatAdmissionRetryBusyRef.current = false
      setWorkspaceChatAdmissionRetryError(
        'The Workspace chat recovery cache could not be reset. This message was not retried or sent.',
      )
      setWorkspaceChatAdmissionRetryBusy(false)
      return
    }

    let persisted = false
    try {
      persisted = await pending.retryPersistence()
    } catch {
      persisted = false
    }
    if (!persisted) {
      workspaceChatAdmissionRetryBusyRef.current = false
      setWorkspaceChatAdmissionRetryError(
        'The recovery cache was reset, but this message still could not be saved safely. No message was sent.',
      )
      setWorkspaceChatAdmissionRetryBusy(false)
      return
    }

    setWorkspaceChatAdmissionRetry(null)
    setWorkspaceChatAdmissionRetryError(null)
    setError(null)
    setWorkspaceChatAdmissionRetryBusy(false)
    await pending.continueAfterAdmission()
  }, [workspaceChatAdmissionOwnerKey, workspaceChatAdmissionRetry])

  const handleAbortStreaming = useCallback(async () => {
    const activeSend = activeSendRef.current
    if (activeSend?.clientId) {
      const markCancelled = (message: ChatMessage): ChatMessage => ({
        ...message,
        status: 'error',
      })
      if (activeSend.cardId) {
        await updateSessionCardTransientMessageByClientId(
          queryClient,
          activeSend.cardId,
          activeSend.sessionKey,
          activeSend.clientId,
          markCancelled,
        )
      } else {
        updateHistoryMessageByClientIdEverywhere(
          queryClient,
          activeSend.clientId,
          markCancelled,
        )
      }
      if (!activeSend.cardId) {
        await updatePendingMessageByClientId(
          activeSend.sessionKey,
          activeSend.clientId,
          markCancelled,
          activeSend.provisionalOwnerId,
        )
      }
    }
    await cancelStreaming()
    activeSendRef.current = null
    setSending(false)
    setPendingGeneration(false)
    setWaitingForResponse(false)
  }, [cancelStreaming, queryClient])

  const runPaletteSlashCommand = useCallback(
    (command: string) => {
      const trimmedCommand = command.trim()
      if (!trimmedCommand.startsWith('/')) return
      if (handleUiSlashCommand(trimmedCommand)) return
      send(trimmedCommand, [], false, commandHelpers)
    },
    [commandHelpers, handleUiSlashCommand, send],
  )

  useEffect(() => {
    function handleRunCommand(event: Event) {
      const detail = (event as CustomEvent<ChatRunCommandDetail>).detail
      if (!detail.command) return
      runPaletteSlashCommand(detail.command)
    }

    window.addEventListener(CHAT_RUN_COMMAND_EVENT, handleRunCommand)
    return () => {
      window.removeEventListener(CHAT_RUN_COMMAND_EVENT, handleRunCommand)
    }
  }, [runPaletteSlashCommand])

  useEffect(() => {
    function handleSubmitSelection(event: Event) {
      const detail = (event as CustomEvent<ChatSubmitSelectionDetail>).detail
      const text = detail.text.trim()
      if (!text) return
      send(text, [], false, commandHelpers)
    }

    window.addEventListener(CHAT_SUBMIT_SELECTION_EVENT, handleSubmitSelection)
    return () => {
      window.removeEventListener(
        CHAT_SUBMIT_SELECTION_EVENT,
        handleSubmitSelection,
      )
    }
  }, [commandHelpers, send])

  useEffect(() => {
    const pendingCommand = window.sessionStorage.getItem(
      CHAT_PENDING_COMMAND_STORAGE_KEY,
    )
    if (!pendingCommand) return

    window.sessionStorage.removeItem(CHAT_PENDING_COMMAND_STORAGE_KEY)
    runPaletteSlashCommand(pendingCommand)
  }, [runPaletteSlashCommand])

  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)

  const handleToggleSidebarCollapse = useCallback(() => {
    toggleSidebar()
  }, [toggleSidebar])

  const handleToggleFileExplorer = useCallback(() => {
    setFileExplorerCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('claude-file-explorer-collapsed', String(next))
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
    (displayedHistoryQuery.isLoading && !displayedHistoryQuery.data) ||
    legacyRedirecting
  const historyEmpty = !historyLoading && finalDisplayMessages.length === 0
  const incompleteHistoryNotice =
    displayedCardHistory && !displayedCardHistoryReady ? (
      <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
        <p role="status" aria-live="polite">
          {inspectedChildCard
            ? 'History is incomplete for the inspected child Card. Available messages remain visible.'
            : 'History is incomplete for this Session Card. Available messages remain visible.'}{' '}
          {displayedCardHistory.missingSegments.length === 0
            ? 'More history may become available.'
            : displayedCardHistory.missingSegments.length === 1
              ? '1 part could not be loaded.'
              : `${displayedCardHistory.missingSegments.length} parts could not be loaded.`}
        </p>
        {displayedCardHistoryRetryable ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-amber-400 px-2.5 py-1 text-xs font-semibold hover:bg-amber-100 disabled:cursor-wait disabled:opacity-70 dark:border-amber-600 dark:hover:bg-amber-900/40"
            aria-label={
              inspectedChildCard
                ? 'Retry inspected child history'
                : 'Retry parent conversation history'
            }
            aria-busy={displayedHistoryQuery.isFetching}
            disabled={displayedHistoryQuery.isFetching}
            onClick={() => void displayedHistoryQuery.refetch()}
          >
            {displayedHistoryQuery.isFetching ? 'Retrying…' : 'Retry history'}
          </button>
        ) : null}
      </div>
    ) : null
  const snapshotDurabilityNotice =
    displayedCardHistory?.completeSnapshotDurability === 'failed' ? (
      <div
        className="mx-4 mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
        role="alert"
        aria-live="assertive"
      >
        Transcript recovery storage is unavailable. This complete transcript is
        not guaranteed to survive a reload until storage recovers.
      </div>
    ) : null
  const errorNotice = useMemo(() => {
    if (!showErrorNotice) return null
    if (!serverError) return null
    return (
      <ConnectionStatusMessage
        state="error"
        error={serverError}
        status={serverErrorStatus}
        onRetry={handleRefetch}
      />
    )
  }, [serverError, serverErrorStatus, handleRefetch, showErrorNotice])

  const mobileHeaderStatus: 'connected' | 'connecting' | 'disconnected' =
    connectionState === 'connected'
      ? 'connected'
      : statusQuery.data?.ok === false || statusQuery.isError
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
  const researchCard = useResearchCard({
    sessionKey: resolvedSessionKey || activeCanonicalKey,
    isStreaming: derivedStreamingInfo.isStreaming,
    resetKey: `${resolvedSessionKey || activeCanonicalKey || 'main'}:${researchResetKey}`,
  })

  // Pull-to-refresh offset removed

  const handleOpenAgentDetails = useCallback(() => {
    // agent view panel removed
  }, [])

  const findSessionCard = useCallback(
    (cardId: string) => sessionCards?.find((card) => card.cardId === cardId),
    [sessionCards],
  )

  const runCardMutation = useCallback(
    async (cardId: string, mutation: () => Promise<void>) => {
      if (pendingCardIds.has(cardId)) return
      setPendingCardIds((current) => new Set(current).add(cardId))
      try {
        await mutation()
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: sessionCardQueryKeys.lists,
          }),
          queryClient.invalidateQueries({
            queryKey: sessionCardQueryKeys.detail(cardId),
          }),
        ])
      } catch (mutationError) {
        const message =
          mutationError instanceof Error
            ? mutationError.message
            : 'Card action failed'
        toast(message, { type: 'error' })
      } finally {
        setPendingCardIds((current) => {
          const next = new Set(current)
          next.delete(cardId)
          return next
        })
      }
    },
    [pendingCardIds, queryClient],
  )

  const handleRenameCard = useCallback(
    async (cardId: string, nextTitle: string) => {
      const card = findSessionCard(cardId)
      if (card?.relationshipKind !== 'root') return
      await runCardMutation(cardId, async () => {
        await updateSessionCardMetadata(cardId, { manualTitle: nextTitle })
      })
    },
    [findSessionCard, runCardMutation],
  )

  const handleTogglePinCard = useCallback(
    async (cardId: string) => {
      const card = findSessionCard(cardId)
      if (card?.relationshipKind !== 'root') return
      await runCardMutation(cardId, async () => {
        await updateSessionCardMetadata(cardId, { pinned: !card.pinned })
      })
    },
    [findSessionCard, runCardMutation],
  )

  const handleBranchCard = useCallback(
    async (cardId: string) => {
      const card = findSessionCard(cardId)
      if (card?.relationshipKind !== 'root') return
      const canonicalSegmentKey =
        activeCard?.cardId === cardId
          ? (activeCardCanonicalSegmentKey ?? card.canonicalSegmentKey)
          : card.canonicalSegmentKey
      const idempotencyKey = crypto.randomUUID()
      await runCardMutation(cardId, async () => {
        await branchSessionCard(cardId, canonicalSegmentKey, { idempotencyKey })
      })
    },
    [
      activeCard?.cardId,
      activeCardCanonicalSegmentKey,
      findSessionCard,
      runCardMutation,
    ],
  )

  const handleArchiveCard = useCallback(
    async (cardId: string) => {
      const card = findSessionCard(cardId)
      if (card?.relationshipKind !== 'root') return
      await runCardMutation(cardId, async () => {
        await archiveSessionCard(cardId)
        if (activeCardIdRef.current === cardId) {
          setSessionsOpen(false)
          await navigate({
            ...buildChatCardNavigation(CHAT_BOOTSTRAP_CARD_ID),
            replace: true,
          })
        }
      })
    },
    [findSessionCard, navigate, runCardMutation],
  )

  const handleRenameActiveSessionTitle = useCallback(
    async (nextTitle: string) => {
      if (activeCard) {
        if (activeCard.relationshipKind !== 'root') return
        setRenamingCardTitle(true)
        try {
          await updateSessionCardMetadata(activeCard.cardId, {
            manualTitle: nextTitle,
          })
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: sessionCardQueryKeys.lists,
            }),
            queryClient.invalidateQueries({
              queryKey: sessionCardQueryKeys.detail(activeCard.cardId),
            }),
          ])
        } finally {
          setRenamingCardTitle(false)
        }
        return
      }
      const sessionKey =
        resolvedSessionKey || activeSession?.key || activeSessionKey || ''
      if (!sessionKey) return
      await renameSession(
        sessionKey,
        activeSession?.friendlyId ?? null,
        nextTitle,
      )
    },
    [
      activeCard,
      activeSession?.friendlyId,
      activeSession?.key,
      activeSessionKey,
      queryClient,
      renameSession,
      resolvedSessionKey,
    ],
  )

  // Listen for mobile header agent-details tap
  useEffect(() => {
    const handler = () => {
      /* agent view removed */
    }
    window.addEventListener('claude:chat-agent-details', handler)
    return () =>
      window.removeEventListener('claude:chat-agent-details', handler)
  }, [])

  return (
    <div
      className={cn(
        'relative min-w-0 flex flex-col overflow-hidden',
        compact ? 'h-full flex-1 min-h-0' : 'h-full',
      )}
      style={{ background: 'var(--theme-bg)' }}
    >
      <div
        className={cn(
          'flex-1 min-h-0 overflow-hidden',
          compact
            ? 'flex min-h-0 w-full flex-col'
            : isMobile
              ? 'flex flex-col'
              : 'grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)]',
        )}
      >
        {hideUi || compact || isFocusMode ? null : isMobile ? null : (
          <FileExplorerSidebar
            collapsed={fileExplorerCollapsed}
            onToggle={handleToggleFileExplorer}
            onInsertReference={handleInsertFileReference}
          />
        )}

        <main
          className={cn(
            'flex h-full flex-1 min-h-0 min-w-0 flex-col overflow-hidden transition-[margin-bottom] duration-200',
            (activeIsRealtimeStreaming || hasPendingGeneration()) &&
              'chat-streaming-glow',
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
              onRenameTitle={
                !activeCard || activeCard.relationshipKind === 'root'
                  ? handleRenameActiveSessionTitle
                  : undefined
              }
              renamingTitle={renamingSessionTitle || renamingCardTitle}
              wrapperRef={headerRef}
              onOpenSessions={() => setSessionsOpen(true)}
              sessionCards={sessionCards}
              activeFriendlyId={activeFriendlyId}
              inspectedChildCardId={inspectedChildCardId}
              onSelectSession={(key) =>
                void navigate({
                  to: '/chat/$sessionKey',
                  params: { sessionKey: key },
                })
              }
              showFileExplorerButton={!isMobile && !isFocusMode}
              fileExplorerCollapsed={fileExplorerCollapsed}
              onToggleFileExplorer={handleToggleFileExplorer}
              dataUpdatedAt={displayedHistoryQuery.dataUpdatedAt}
              onRefresh={handleRefreshHistory}
              agentModel={currentModel}
              agentConnected={mobileHeaderStatus === 'connected'}
              onOpenAgentDetails={handleOpenAgentDetails}
              pullOffset={0}
              statusMode={headerStatusMode}
              activeToolName={activeHeaderToolName}
              thinkingLevel={thinkingLevel}
              isFocusMode={isFocusMode}
              onToggleFocusMode={handleToggleFocusMode}
              onUndo={undefined}
              onClear={undefined}
            />
          )}

          {errorNotice && (
            <div className="sticky top-0 z-20 px-4 py-2">{errorNotice}</div>
          )}
          {snapshotDurabilityNotice}
          {incompleteHistoryNotice}
          {!embedded && workspaceChatAdmissionRetry ? (
            <div
              className="mx-4 mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-950 dark:border-red-700/60 dark:bg-red-950/30 dark:text-red-100"
              role="alert"
              aria-live="assertive"
            >
              <p>{workspaceChatAdmissionRetry.safeMessage}</p>
              <p className="mt-1 font-semibold">
                Unsent local Workspace chat recovery data will be discarded.
              </p>
              {workspaceChatAdmissionRetryError ? (
                <p className="mt-1">{workspaceChatAdmissionRetryError}</p>
              ) : null}
              <button
                type="button"
                className="mt-2 rounded-md border border-red-400 px-2.5 py-1 text-xs font-semibold hover:bg-red-100 disabled:cursor-wait disabled:opacity-70 dark:border-red-600 dark:hover:bg-red-900/40"
                aria-busy={workspaceChatAdmissionRetryBusy}
                disabled={workspaceChatAdmissionRetryBusy}
                onClick={() => void handleResetWorkspaceChatRecoveryAndRetry()}
              >
                {workspaceChatAdmissionRetryBusy
                  ? 'Resetting Workspace chat recovery cache…'
                  : 'Reset Workspace chat recovery cache and retry'}
              </button>
            </div>
          ) : null}
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
                        {'\uD83D\uDD10'} Approval Required -{' '}
                        {approval.agentName || 'Agent'}
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

          {hideUi ? null : <ContextBar cardId={activeCard?.cardId} />}

          {hideUi ? null : (
            <ChatMessageList
              messages={finalDisplayMessages}
              onRetryMessage={
                inspectedChildCard ? undefined : handleRetryMessage
              }
              onRefresh={handleRefreshHistory}
              loading={historyLoading}
              hasOlderHistory={Boolean(
                !inspectedChildCard && cardHistoryQuery.data?.previousCursor,
              )}
              loadingOlderHistory={
                !inspectedChildCard && loadingOlderCardHistory
              }
              onLoadOlderHistory={
                !inspectedChildCard && cardHistoryQuery.data?.previousCursor
                  ? loadOlderCardHistory
                  : undefined
              }
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
              waitingForResponse={
                !canShowLiveActivity || inspectedChildCard
                  ? false
                  : waitingForResponse
              }
              sessionKey={inspectedChildCard?.sessionKey ?? activeCanonicalKey}
              pinToTop={false}
              pinGroupMinHeight={pinGroupMinHeight}
              headerHeight={headerHeight}
              contentStyle={stableContentStyle}
              bottomOffset={
                isMobile ? mobileScrollBottomOffset : terminalPanelInset
              }
              isStreaming={
                !canShowLiveActivity || inspectedChildCard
                  ? false
                  : derivedStreamingInfo.isStreaming
              }
              streamingMessageId={
                !canShowLiveActivity || inspectedChildCard
                  ? null
                  : derivedStreamingInfo.streamingMessageId
              }
              streamingText={
                !canShowLiveActivity || inspectedChildCard
                  ? undefined
                  : stableActiveStreamingText ||
                    completedStreamingText.current ||
                    undefined
              }
              streamingThinking={
                !canShowLiveActivity || inspectedChildCard
                  ? undefined
                  : realtimeStreamingThinking ||
                    completedStreamingThinking.current ||
                    undefined
              }
              lifecycleEvents={
                !canShowLiveActivity || inspectedChildCard
                  ? []
                  : realtimeLifecycleEvents
              }
              hideSystemMessages
              activeToolCalls={
                !canShowLiveActivity || inspectedChildCard
                  ? []
                  : activeToolCalls
              }
              liveToolActivity={
                !canShowLiveActivity || inspectedChildCard
                  ? []
                  : liveToolActivity
              }
              researchCard={
                !displayedCardHistoryReady || inspectedChildCard
                  ? undefined
                  : researchCard
              }
              isCompacting={
                !canShowLiveActivity || inspectedChildCard
                  ? false
                  : isCompacting
              }
              sending={
                !canShowLiveActivity || inspectedChildCard ? false : sending
              }
            />
          )}
          {showComposer ? (
            <ChatComposer
              onSubmit={send}
              onAbort={handleAbortStreaming}
              isLoading={sending || waitingForResponse}
              disabled={sending || hideUi || !cardTransportReady}
              cardId={activeCard?.cardId}
              wrapperRef={composerRef}
              composerRef={composerHandleRef}
              embedded={embedded}
              focusKey={`${isNewChat ? 'new' : activeFriendlyId}:${activeCanonicalKey ?? ''}`}
              thinkingLevel={thinkingLevel}
              onThinkingLevelChange={handleThinkingLevelChange}
            />
          ) : null}
        </main>
        {!compact && !isFocusMode && (
          <AgentViewPanel
            activeCard={activeCard}
            sessionCardList={sessionCardList}
          />
        )}
      </div>
      {!compact && !hideUi && !isMobile && !isFocusMode && <TerminalPanel />}

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
          sessionCards={sessionCards ?? []}
          activeFriendlyId={activeFriendlyId}
          inspectedChildCardId={inspectedChildCardId}
          onSelectSession={(cardId, inspectChildCardId) => {
            setSessionsOpen(false)
            void navigate({
              to: '/chat/$sessionKey',
              params: { sessionKey: cardId },
              search: inspectChildCardId ? { inspect: inspectChildCardId } : {},
            })
          }}
          onNewChat={() => {
            setSessionsOpen(false)
            void navigate({
              to: '/chat/$sessionKey',
              params: { sessionKey: 'new' },
            })
          }}
          onRenameCard={handleRenameCard}
          onTogglePin={handleTogglePinCard}
          onBranchCard={handleBranchCard}
          onArchiveCard={handleArchiveCard}
          pendingCardIds={pendingCardIds}
          hasMoreOlderSessions={hasMoreSessionCards}
          loadingOlderSessions={loadingMoreSessionCards}
          olderSessionsError={moreSessionCardsError}
          onLoadOlderSessions={onLoadMoreSessionCards}
        />
      )}

      <ContextAlertModal
        open={alertOpen}
        onClose={dismissAlert}
        threshold={alertThreshold}
        contextPercent={alertPercent}
      />

      <ErrorToastContainer />
    </div>
  )
}
