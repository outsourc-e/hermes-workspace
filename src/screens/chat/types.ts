export type ToolCallContent = {
  type: 'toolCall'
  id?: string
  name?: string
  arguments?: Record<string, unknown>
  partialJson?: string
}

export type ToolResultContent = {
  type: 'toolResult'
  toolCallId?: string
  toolName?: string
  content?: Array<{ type?: string; text?: string }>
  details?: Record<string, unknown>
  isError?: boolean
}

export type TextContent = {
  type: 'text'
  text?: string
  textSignature?: string
}

export type ThinkingContent = {
  type: 'thinking'
  thinking?: string
  thinkingSignature?: string
}

export type SelectionCardContent = {
  type: 'selectionCard'
  id?: string
  title?: string
  body?: string
  mode?: 'single' | 'multi' | 'confirm'
  options?: Array<{
    id?: string
    label: string
    value?: string
    description?: string
  }>
  submitLabel?: string
}

export type MessageContent =
  | TextContent
  | ToolCallContent
  | ThinkingContent
  | SelectionCardContent

export type ChatAttachment = {
  id?: string
  name?: string
  contentType?: string
  size?: number
  url?: string
  dataUrl?: string
  previewUrl?: string
  width?: number
  height?: number
}

export type StreamingStatus = 'idle' | 'streaming' | 'complete' | 'error'

export type ChatMessage = {
  role?: string
  content?: Array<MessageContent>
  attachments?: Array<ChatAttachment>
  toolCallId?: string
  toolName?: string
  details?: Record<string, unknown>
  isError?: boolean
  timestamp?: number
  [key: string]: unknown
  __optimisticId?: string
  __streamingStatus?: StreamingStatus
  __streamingText?: string
  __streamingThinking?: string
}

export type SessionTitleStatus = 'idle' | 'generating' | 'ready' | 'error'
export type SessionTitleSource = 'auto' | 'manual'

export type SessionRelationshipKind =
  | 'root'
  | 'continuation'
  | 'branch'
  | 'child'
  | 'orphan'

/** List-safe relationship facts normalized at the Workspace server boundary. */
export type SessionLineage = {
  parentSessionId?: string
  relationshipType?: string
  relationshipKind?: SessionRelationshipKind
  parentTitle?: string
  parentSource?: string
  sessionSource?: string
  lineageRootId?: string
  lineageTipId?: string
  compressionSegmentCount?: number
  parentLineageRootId?: string
  parentLineageTipId?: string
  isCrossSurfaceChild?: boolean
  isPreCompressionSnapshot?: boolean
  source?: string
  endReason?: string
  startedAt?: number
  endedAt?: number
}

export type SessionSummary = {
  key?: string
  label?: string
  title?: string
  derivedTitle?: string
  updatedAt?: number
  lastMessage?: ChatMessage | null
  friendlyId?: string
  titleStatus?: SessionTitleStatus
  titleSource?: SessionTitleSource
  titleError?: string | null
  preview?: string | null
  source?: string | null
  lineage?: SessionLineage
}

export type SessionListResponse = {
  sessions?: Array<SessionSummary>
}

export type HistoryResponse = {
  sessionKey: string
  sessionId?: string
  messages: Array<ChatMessage>
}

export type SessionMeta = {
  key: string
  /** Authoritative server session key. Absent when `key` is only a route fallback. */
  backendKey?: string
  friendlyId: string
  title?: string
  derivedTitle?: string
  label?: string
  updatedAt?: number
  lastMessage?: ChatMessage | null
  titleStatus?: SessionTitleStatus
  titleSource?: SessionTitleSource
  titleError?: string | null
  preview?: string | null
  lineage?: SessionLineage
}

export type SessionTreeRow = {
  key: string
  session: SessionMeta
  relationshipKind: SessionRelationshipKind
  depth: number
  isExpandable: boolean
  isExpanded: boolean
  childCount: number
  continuationCount: number
  parentKey?: string
  isOrphan: boolean
}

export type SessionTree = {
  roots: Array<SessionTreeRow>
  rows: Array<SessionTreeRow>
  indexByKey: ReadonlyMap<string, SessionTreeRow>
  visibleKeyBySessionKey: ReadonlyMap<string, string>
  logicalRootKeyBySessionKey: ReadonlyMap<string, string>
  expandedAncestorIds: ReadonlySet<string>
}

export type SessionCardRelationshipKind = Exclude<
  SessionRelationshipKind,
  'continuation'
>
export type SessionCardTitleSource = 'default' | 'auto' | 'manual'
export type SessionCardChildStatus = 'idle' | 'running' | 'complete' | 'error'
export type SessionCardCanonicalSource = 'local' | 'remote'

export type SessionCardChild = {
  cardId: string
  sessionKey: string
  relationshipKind: 'branch' | 'child'
  title: string
  status: SessionCardChildStatus
  updatedAt: number
  continuationCount: number
}

export type SessionCard = {
  cardId: string
  /**
   * Authoritative transport class for the canonical segment. The source-aware
   * Card API always supplies it; pure projections omit it until server lookup.
   */
  canonicalSource?: SessionCardCanonicalSource
  title: string
  titleSource: SessionCardTitleSource
  canonicalSegmentKey: string
  continuationSegmentKeys: Array<string>
  continuationCount: number
  relationshipKind: SessionCardRelationshipKind
  parentCardId?: string
  childNodes: Array<SessionCardChild>
  updatedAt: number
  archived: boolean
  pinned: boolean
}

/**
 * Whole-Card branching requires both a positively advertised gateway
 * capability and an authoritative remote canonical transport.
 */
export function isWholeCardBranchAvailable(
  card: Pick<SessionCard, 'canonicalSource'>,
  sessionForkAvailable: boolean,
): boolean {
  return sessionForkAvailable && card.canonicalSource === 'remote'
}

export type PathsPayload = {
  agentId: string
  stateDir: string
  sessionsDir: string
  storePath: string
}
