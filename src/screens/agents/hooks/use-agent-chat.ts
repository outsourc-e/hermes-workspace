import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveOperationsChatCardId } from './use-operations'
import type { OperationsChatTarget } from './use-operations'
import type { ChatMessage, SessionCard } from '@/screens/chat/types'
import type {
  PortableValue,
  V4LatestCardSnapshotRecord,
} from '@/screens/chat/card-transcript-indexeddb'
import {
  readMessageJournal,
  removeMessageJournalValues,
  writeMessageJournal,
} from '@/screens/chat/durable-message-journal'
import {
  encodeWorkspaceChatV4Record,
  readLatestCardSnapshot,
  writeLatestCardSnapshot,
} from '@/screens/chat/card-transcript-indexeddb'
import {
  fetchCompleteSessionCardHistory,
  fetchSessionCards,
  isAuthoritativeCompleteSessionCardHistory,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'
import { textFromMessage } from '@/screens/chat/utils'

export type OperationsChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

type OperationsChatOverlayMessage = OperationsChatMessage & {
  role: 'user' | 'assistant'
  acknowledgementOrdinal: number
}

type OperationsChatSnapshotPayload = {
  ownerCardId: string
  messages: Array<OperationsChatMessage>
}

const OPERATIONS_CHAT_SNAPSHOT_OWNER_PREFIX = 'operations-snapshot:'
const OPERATIONS_CHAT_OVERLAY_OWNER_PREFIX = 'operations-overlay:'

function normalizeMessage(
  message: ChatMessage,
  index: number,
): OperationsChatMessage | null {
  const content = textFromMessage(message).trim()
  if (!content) return null
  const role =
    message.role === 'assistant'
      ? 'assistant'
      : message.role === 'user'
        ? 'user'
        : 'system'
  return {
    id:
      (typeof message.id === 'string' && message.id) ||
      `${role}-${message.timestamp ?? index}-${index}`,
    role,
    content,
    ...(typeof message.timestamp === 'number'
      ? { timestamp: message.timestamp }
      : {}),
  }
}

function childForTarget(target: OperationsChatTarget) {
  if (!target.inspectedChildCardId) return undefined
  return target.card.childNodes.find(
    (child) => child.cardId === target.inspectedChildCardId,
  )
}

function snapshotOwnerKey(cardId: string): string {
  return `${OPERATIONS_CHAT_SNAPSHOT_OWNER_PREFIX}${cardId}`
}

function overlayOwnerKey(cardId: string): string {
  return `${OPERATIONS_CHAT_OVERLAY_OWNER_PREFIX}${cardId}`
}

function parseCompleteMessage(value: unknown): OperationsChatMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (
    (candidate.role !== 'user' &&
      candidate.role !== 'assistant' &&
      candidate.role !== 'system') ||
    typeof candidate.id !== 'string' ||
    !candidate.id ||
    typeof candidate.content !== 'string' ||
    !candidate.content.trim()
  ) {
    return null
  }
  return {
    id: candidate.id,
    role: candidate.role,
    content: candidate.content,
    ...(typeof candidate.timestamp === 'number' &&
    Number.isFinite(candidate.timestamp)
      ? { timestamp: candidate.timestamp }
      : {}),
  }
}

function parseOverlayMessage(
  value: unknown,
): OperationsChatOverlayMessage | null {
  const message = parseCompleteMessage(value)
  if (!message || message.role === 'system') return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.acknowledgementOrdinal !== 'number' ||
    !Number.isSafeInteger(candidate.acknowledgementOrdinal) ||
    candidate.acknowledgementOrdinal < 1
  ) {
    return null
  }
  return {
    ...message,
    role: message.role,
    acknowledgementOrdinal: candidate.acknowledgementOrdinal,
  }
}

function parseSnapshotPayload(
  value: unknown,
  cardId: string,
): OperationsChatSnapshotPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Operations snapshot payload is invalid')
  }
  const payload = value as Record<string, unknown>
  if (payload.ownerCardId !== cardId || !Array.isArray(payload.messages)) {
    throw new Error('Operations snapshot owner or messages are invalid')
  }
  const messages = payload.messages.map(parseCompleteMessage)
  if (messages.some((message) => message === null)) {
    throw new Error('Operations snapshot contains an invalid message')
  }
  return {
    ownerCardId: cardId,
    messages: messages as Array<OperationsChatMessage>,
  }
}

async function readCompleteSnapshotRecord(
  cardId: string,
): Promise<V4LatestCardSnapshotRecord<PortableValue> | null> {
  if (!cardId) return null
  const ownerKey = snapshotOwnerKey(cardId)
  const stored = await readLatestCardSnapshot<PortableValue>(ownerKey)
  if (stored === null) return null
  const record = encodeWorkspaceChatV4Record(
    stored,
  ) as V4LatestCardSnapshotRecord<PortableValue>
  if (record.cardId !== ownerKey) {
    throw new Error('Operations snapshot IndexedDB owner is invalid')
  }
  parseSnapshotPayload(record.payload, cardId)
  return record
}

async function readCompleteSnapshot(
  cardId: string,
): Promise<Array<OperationsChatMessage>> {
  const record = await readCompleteSnapshotRecord(cardId)
  return record === null
    ? []
    : parseSnapshotPayload(record.payload, cardId).messages
}

async function writeCompleteSnapshot(
  cardId: string,
  messages: Array<OperationsChatMessage>,
): Promise<boolean> {
  if (
    !cardId ||
    messages.some((message) => parseCompleteMessage(message) === null)
  ) {
    return false
  }
  try {
    const previous = await readCompleteSnapshotRecord(cardId)
    const revision = (previous?.revision ?? 0) + 1
    if (!Number.isSafeInteger(revision)) return false
    const record = encodeWorkspaceChatV4Record({
      cardId: snapshotOwnerKey(cardId),
      schema: 4 as const,
      revision,
      writeId: crypto.randomUUID(),
      updatedAt: Date.now(),
      payload: { ownerCardId: cardId, messages },
    }) as V4LatestCardSnapshotRecord<PortableValue>
    await writeLatestCardSnapshot(record)
    return true
  } catch {
    return false
  }
}

async function readOverlay(
  cardId: string,
): Promise<Array<OperationsChatOverlayMessage>> {
  if (!cardId) return []
  return readMessageJournal(overlayOwnerKey(cardId), parseOverlayMessage)
}

async function writeOverlay(
  cardId: string,
  messages: Array<OperationsChatOverlayMessage>,
  acknowledged: Array<OperationsChatOverlayMessage> = [],
): Promise<boolean> {
  if (
    !cardId ||
    messages.some((message) => parseOverlayMessage(message) === null)
  ) {
    return false
  }
  try {
    await writeMessageJournal(
      overlayOwnerKey(cardId),
      messages,
      (message) => message.id,
    )
    if (acknowledged.length > 0) {
      await removeMessageJournalValues(
        overlayOwnerKey(cardId),
        acknowledged,
        (message) => message.id,
      )
    }
    return true
  } catch {
    return false
  }
}

function messageSignature(
  message: Pick<OperationsChatMessage, 'role' | 'content'>,
) {
  return `${message.role}\u0000${message.content.trim()}`
}

function signatureCounts(messages: Array<OperationsChatMessage>) {
  const counts = new Map<string, number>()
  for (const message of messages) {
    const signature = messageSignature(message)
    counts.set(signature, (counts.get(signature) ?? 0) + 1)
  }
  return counts
}

function nextAcknowledgementOrdinal(
  message: Pick<OperationsChatOverlayMessage, 'role' | 'content'>,
  history: Array<OperationsChatMessage>,
  overlay: Array<OperationsChatOverlayMessage>,
) {
  const signature = messageSignature(message)
  const historyCount = signatureCounts(history).get(signature) ?? 0
  const overlayOrdinal = overlay.reduce(
    (highest, candidate) =>
      messageSignature(candidate) === signature
        ? Math.max(highest, candidate.acknowledgementOrdinal)
        : highest,
    0,
  )
  return Math.max(historyCount, overlayOrdinal) + 1
}

function textFromUnknownContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      return typeof record.text === 'string' ? record.text : ''
    })
    .join('')
}

function assistantTextFromPayload(payload: Record<string, unknown>) {
  const message = payload.message
  if (typeof message === 'string') return message
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return ''
  const record = message as Record<string, unknown>
  return (
    (typeof record.text === 'string' ? record.text : '') ||
    textFromUnknownContent(record.content)
  )
}

function processSseBlock(
  block: string,
  currentText: string,
): { text: string; changed: boolean; error?: string } {
  let event = ''
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trimStart()
  }
  if (!event || !data) return { text: currentText, changed: false }

  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(data) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { text: currentText, changed: false }
    }
    payload = parsed as Record<string, unknown>
  } catch {
    return { text: currentText, changed: false }
  }

  if (event === 'error') {
    return {
      text: currentText,
      changed: false,
      error:
        typeof payload.message === 'string'
          ? payload.message
          : 'Operations chat stream failed',
    }
  }
  if (event === 'done' && payload.state === 'error') {
    return {
      text: currentText,
      changed: false,
      error:
        typeof payload.errorMessage === 'string'
          ? payload.errorMessage
          : 'Operations chat stream failed',
    }
  }

  if (event === 'assistant') {
    const text = typeof payload.text === 'string' ? payload.text : ''
    return text
      ? { text, changed: text !== currentText }
      : { text: currentText, changed: false }
  }
  if (event === 'chunk') {
    const nextPart = [
      payload.delta,
      payload.text,
      payload.content,
      payload.chunk,
    ].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.length > 0,
    )
    if (!nextPart) return { text: currentText, changed: false }
    const text =
      payload.fullReplace === true ? nextPart : currentText + nextPart
    return { text, changed: text !== currentText }
  }
  if ((event === 'done' || event === 'complete') && !currentText) {
    const text = assistantTextFromPayload(payload)
    return text
      ? { text, changed: true }
      : { text: currentText, changed: false }
  }
  return { text: currentText, changed: false }
}

async function consumeAssistantStream(
  response: Response,
  onText: (text: string) => Promise<void>,
) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Operations chat stream is unavailable')
  const decoder = new TextDecoder()
  let buffer = ''
  let assistantText = ''

  const processBufferedEvents = async (flush: boolean) => {
    const blocks = buffer.split('\n\n')
    buffer = flush ? '' : (blocks.pop() ?? '')
    for (const block of blocks) {
      if (!block.trim()) continue
      const result = processSseBlock(block, assistantText)
      if (result.error) throw new Error(result.error)
      assistantText = result.text
      if (result.changed) await onText(assistantText)
    }
  }

  let streamDone = false
  while (!streamDone) {
    const result = await reader.read()
    streamDone = result.done
    if (streamDone) continue
    buffer += decoder
      .decode(result.value, { stream: true })
      .replaceAll('\r\n', '\n')
    await processBufferedEvents(false)
  }
  buffer += decoder.decode().replaceAll('\r\n', '\n')
  if (buffer.trim()) buffer += '\n\n'
  await processBufferedEvents(true)
}

function sameBinding(left: SessionCard, right: SessionCard) {
  return (
    left.cardId === right.cardId &&
    left.canonicalSegmentKey === right.canonicalSegmentKey &&
    left.canonicalSource === right.canonicalSource &&
    left.canonicalTransport === right.canonicalTransport &&
    left.relationshipKind === right.relationshipKind
  )
}

export const operationsChatStorageForTests = {
  readCompleteSnapshot,
  writeCompleteSnapshot,
  readOverlay,
  writeOverlay,
}

/** Card-only history, immediate overlay, recovery, and send transport. */
export function useAgentChat(target: OperationsChatTarget | undefined) {
  const queryClient = useQueryClient()
  const child = target ? childForTarget(target) : undefined
  const cardId = child?.cardId ?? target?.card.cardId ?? ''
  const canonicalSegmentKey =
    child?.sessionKey ?? target?.card.canonicalSegmentKey ?? ''
  const ownerCardId = child ? '' : cardId
  const historyQueryKey =
    child && target
      ? sessionCardQueryKeys.childHistory(target.card.cardId, child.cardId)
      : sessionCardQueryKeys.history(cardId)

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: ({ signal }) => {
      if (!target || !cardId || !canonicalSegmentKey) {
        throw new Error('Operations chat Card is unavailable')
      }
      return fetchCompleteSessionCardHistory({
        ...(child ? { parentCardId: target.card.cardId } : {}),
        cardId,
        canonicalSegmentKey,
        signal,
      })
    },
    enabled: Boolean(target && cardId && canonicalSegmentKey),
    refetchInterval: 5_000,
  })

  const completeHistory = isAuthoritativeCompleteSessionCardHistory(
    historyQuery.data,
  )
    ? historyQuery.data
    : undefined
  const currentAuthoritativeMessages = useMemo(
    () =>
      (completeHistory?.messages ?? [])
        .map(normalizeMessage)
        .filter((message): message is OperationsChatMessage =>
          Boolean(message),
        ),
    [completeHistory?.messages],
  )
  const [completeSnapshot, setCompleteSnapshot] = useState<{
    ownerCardId: string
    messages: Array<OperationsChatMessage>
    persistentVerified: boolean
    hydrated: boolean
  }>({
    ownerCardId: cardId,
    messages: [],
    persistentVerified: false,
    hydrated: false,
  })
  const [overlayState, setOverlayState] = useState<{
    ownerCardId: string
    messages: Array<OperationsChatOverlayMessage>
    hydrated: boolean
  }>({ ownerCardId, messages: [], hydrated: false })
  const [snapshotDurabilityError, setSnapshotDurabilityError] = useState<
    string | null
  >(null)
  const [overlayDurabilityError, setOverlayDurabilityError] = useState<
    string | null
  >(null)
  const overlayMessages =
    overlayState.ownerCardId === ownerCardId ? overlayState.messages : []
  const overlayRef = useRef<Array<OperationsChatOverlayMessage>>([])
  const overlayOwnerRef = useRef(ownerCardId)
  const overlayHydratedRef = useRef(false)
  const snapshotOperationRef = useRef(0)

  const commitOverlay = async (
    nextMessages: Array<OperationsChatOverlayMessage>,
    expectedOwner = ownerCardId,
  ) => {
    if (
      !expectedOwner ||
      overlayOwnerRef.current !== expectedOwner ||
      !overlayHydratedRef.current
    ) {
      return false
    }
    if (!(await writeOverlay(expectedOwner, nextMessages))) return false
    if (overlayOwnerRef.current !== expectedOwner) return false
    overlayRef.current = nextMessages
    setOverlayState({
      ownerCardId: expectedOwner,
      messages: nextMessages,
      hydrated: true,
    })
    return true
  }

  useEffect(() => {
    const operation = snapshotOperationRef.current + 1
    snapshotOperationRef.current = operation
    const lifecycle = { cancelled: false }
    setSnapshotDurabilityError(null)
    setCompleteSnapshot((current) =>
      current.ownerCardId === cardId
        ? { ...current, persistentVerified: false, hydrated: false }
        : {
            ownerCardId: cardId,
            messages: [],
            persistentVerified: false,
            hydrated: false,
          },
    )

    void (async () => {
      if (!cardId) {
        if (
          !lifecycle.cancelled &&
          snapshotOperationRef.current === operation
        ) {
          setCompleteSnapshot({
            ownerCardId: cardId,
            messages: [],
            persistentVerified: false,
            hydrated: true,
          })
        }
        return
      }

      if (completeHistory) {
        const verified = await writeCompleteSnapshot(
          cardId,
          currentAuthoritativeMessages,
        )
        if (lifecycle.cancelled || snapshotOperationRef.current !== operation)
          return
        if (!verified) {
          setSnapshotDurabilityError(
            'Operations chat recovery storage is unavailable. This complete transcript is not available after reload until storage recovers.',
          )
          setCompleteSnapshot((current) => ({
            ...current,
            ownerCardId: cardId,
            persistentVerified: false,
            hydrated: true,
          }))
          return
        }
        setSnapshotDurabilityError(null)
        setCompleteSnapshot({
          ownerCardId: cardId,
          messages: currentAuthoritativeMessages,
          persistentVerified: true,
          hydrated: true,
        })
        return
      }

      try {
        const messages = await readCompleteSnapshot(cardId)
        if (lifecycle.cancelled || snapshotOperationRef.current !== operation)
          return
        setCompleteSnapshot({
          ownerCardId: cardId,
          messages,
          persistentVerified: false,
          hydrated: true,
        })
      } catch {
        if (lifecycle.cancelled || snapshotOperationRef.current !== operation)
          return
        setSnapshotDurabilityError(
          'Operations chat recovery storage is unavailable. This complete transcript is not available after reload until storage recovers.',
        )
        setCompleteSnapshot({
          ownerCardId: cardId,
          messages: [],
          persistentVerified: false,
          hydrated: true,
        })
      }
    })()

    return () => {
      lifecycle.cancelled = true
    }
  }, [cardId, completeHistory, currentAuthoritativeMessages])

  useEffect(() => {
    const lifecycle = { cancelled: false }
    overlayOwnerRef.current = ownerCardId
    overlayHydratedRef.current = false
    overlayRef.current = []
    setOverlayDurabilityError(null)
    setOverlayState({ ownerCardId, messages: [], hydrated: false })

    void (async () => {
      try {
        const recovered = await readOverlay(ownerCardId)
        if (lifecycle.cancelled || overlayOwnerRef.current !== ownerCardId)
          return
        overlayRef.current = recovered
        overlayHydratedRef.current = true
        setOverlayState({
          ownerCardId,
          messages: recovered,
          hydrated: true,
        })
      } catch {
        if (lifecycle.cancelled || overlayOwnerRef.current !== ownerCardId)
          return
        overlayHydratedRef.current = false
        setOverlayDurabilityError(
          'Operations chat recovery storage became unavailable. The last durable stream checkpoint is still shown.',
        )
        setOverlayState({ ownerCardId, messages: [], hydrated: true })
      }
    })()

    return () => {
      lifecycle.cancelled = true
    }
  }, [ownerCardId])

  const authoritativeMessages = completeHistory
    ? currentAuthoritativeMessages
    : completeSnapshot.ownerCardId === cardId && completeSnapshot.hydrated
      ? completeSnapshot.messages
      : []

  const historySignatureCounts = useMemo(
    () =>
      completeHistory
        ? signatureCounts(currentAuthoritativeMessages)
        : new Map<string, number>(),
    [completeHistory, currentAuthoritativeMessages],
  )
  const unacknowledgedOverlay = useMemo(
    () =>
      overlayMessages.filter(
        (message) =>
          (historySignatureCounts.get(messageSignature(message)) ?? 0) <
          message.acknowledgementOrdinal,
      ),
    [historySignatureCounts, overlayMessages],
  )

  useEffect(() => {
    if (
      !completeHistory ||
      !ownerCardId ||
      !overlayState.hydrated ||
      completeSnapshot.ownerCardId !== cardId ||
      completeSnapshot.messages !== currentAuthoritativeMessages ||
      !completeSnapshot.persistentVerified ||
      unacknowledgedOverlay.length === overlayMessages.length
    ) {
      return
    }
    const remainingIds = new Set(
      unacknowledgedOverlay.map((message) => message.id),
    )
    const acknowledged = overlayMessages.filter(
      (message) => !remainingIds.has(message.id),
    )
    const lifecycle = { cancelled: false }
    void (async () => {
      const verified = await writeOverlay(
        ownerCardId,
        unacknowledgedOverlay,
        acknowledged,
      )
      if (lifecycle.cancelled || overlayOwnerRef.current !== ownerCardId) return
      if (!verified) {
        setOverlayDurabilityError(
          'Operations chat recovery storage became unavailable. The last durable stream checkpoint is still shown.',
        )
        return
      }
      overlayRef.current = unacknowledgedOverlay
      setOverlayState({
        ownerCardId,
        messages: unacknowledgedOverlay,
        hydrated: true,
      })
    })()
    return () => {
      lifecycle.cancelled = true
    }
  }, [
    cardId,
    completeHistory,
    completeSnapshot,
    currentAuthoritativeMessages,
    ownerCardId,
    overlayMessages,
    overlayState.hydrated,
    unacknowledgedOverlay,
  ])

  const messages = useMemo(
    () => [...authoritativeMessages, ...unacknowledgedOverlay],
    [authoritativeMessages, unacknowledgedOverlay],
  )

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!target || child || !ownerCardId) {
        throw new Error(
          child
            ? 'Child Session Card transcripts are read-only'
            : 'Operations chat Card is unavailable',
        )
      }

      const mountedResolution = resolveOperationsChatCardId(
        target.cardList,
        target.card.cardId,
      )
      const currentCardList = await fetchSessionCards()
      const currentResolution = resolveOperationsChatCardId(
        currentCardList,
        target.card.cardId,
      )
      if (
        !mountedResolution ||
        mountedResolution.inspectedChildCardId ||
        !sameBinding(mountedResolution.card, target.card) ||
        !currentResolution ||
        currentResolution.inspectedChildCardId ||
        !sameBinding(currentResolution.card, target.card) ||
        (currentResolution.card.relationshipKind !== 'root' &&
          currentResolution.card.relationshipKind !== 'orphan')
      ) {
        throw new Error(
          'Operations chat Card changed. Refresh before sending again.',
        )
      }

      const idempotencyKey = crypto.randomUUID()
      const timestamp = Date.now()
      const optimisticUser: OperationsChatOverlayMessage = {
        id: `operations-user-${idempotencyKey}`,
        role: 'user',
        content: message,
        timestamp,
        acknowledgementOrdinal: nextAcknowledgementOrdinal(
          { role: 'user', content: message },
          authoritativeMessages,
          overlayRef.current,
        ),
      }
      const admittedOverlay = [...overlayRef.current, optimisticUser]
      if (!(await commitOverlay(admittedOverlay, ownerCardId))) {
        throw new Error(
          'Operations chat recovery storage is unavailable. Message was not sent.',
        )
      }
      let activeSendOverlay = admittedOverlay

      const response = await fetch('/api/send-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: currentResolution.card.cardId,
          sessionKey: currentResolution.card.canonicalSegmentKey,
          friendlyId: currentResolution.card.cardId,
          message,
          idempotencyKey,
        }),
      })
      if (!response.ok) {
        throw new Error((await response.text()) || 'Failed to send message')
      }

      const assistantId = `operations-assistant-${idempotencyKey}`
      await consumeAssistantStream(response, async (content) => {
        const existing = activeSendOverlay.find(
          (entry) => entry.id === assistantId,
        )
        if (existing) {
          const withoutAssistant = activeSendOverlay.filter(
            (entry) => entry.id !== assistantId,
          )
          const acknowledgementOrdinal =
            messageSignature(existing) ===
            messageSignature({ role: 'assistant', content })
              ? existing.acknowledgementOrdinal
              : nextAcknowledgementOrdinal(
                  { role: 'assistant', content },
                  authoritativeMessages,
                  withoutAssistant,
                )
          const nextOverlay = activeSendOverlay.map((entry) =>
            entry.id === assistantId
              ? { ...entry, content, acknowledgementOrdinal }
              : entry,
          )
          if (!(await commitOverlay(nextOverlay, ownerCardId))) {
            setOverlayDurabilityError(
              'Operations chat recovery storage became unavailable. The last durable stream checkpoint is still shown.',
            )
            return
          }
          activeSendOverlay = nextOverlay
          setOverlayDurabilityError(null)
          return
        }
        const assistant: OperationsChatOverlayMessage = {
          id: assistantId,
          role: 'assistant',
          content,
          timestamp: Date.now(),
          acknowledgementOrdinal: nextAcknowledgementOrdinal(
            { role: 'assistant', content },
            authoritativeMessages,
            activeSendOverlay,
          ),
        }
        const nextOverlay = [...activeSendOverlay, assistant]
        if (!(await commitOverlay(nextOverlay, ownerCardId))) {
          setOverlayDurabilityError(
            'Operations chat recovery storage became unavailable. The last durable stream checkpoint is still shown.',
          )
          return
        }
        activeSendOverlay = nextOverlay
        setOverlayDurabilityError(null)
      })
    },
    onSuccess: async () => {
      if (!target) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: historyQueryKey }),
        queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.list(false),
        }),
      ])
    },
  })

  const historyUnavailable = Boolean(
    target && historyQuery.data && !completeHistory,
  )
  const error = !target
    ? 'Chat unavailable: no complete Session Card was resolved.'
    : historyUnavailable
      ? 'Chat history unavailable until a complete transcript is available.'
      : child
        ? 'Direct child transcript · read-only'
        : (historyQuery.error instanceof Error && historyQuery.error.message) ||
          (sendMutation.error instanceof Error && sendMutation.error.message) ||
          null
  const durabilityWarning = overlayDurabilityError || snapshotDurabilityError
  const storageHydrating =
    !overlayState.hydrated ||
    (!completeHistory &&
      (completeSnapshot.ownerCardId !== cardId || !completeSnapshot.hydrated))

  return {
    messages,
    sendMessage: sendMutation.mutateAsync,
    canSend: Boolean(target && !child && ownerCardId && overlayState.hydrated),
    isLoading: historyQuery.isPending || storageHydrating,
    isRefreshing: historyQuery.isFetching,
    isSending: sendMutation.isPending,
    error,
    durabilityWarning,
    canRetryHistory: Boolean(
      target && (historyUnavailable || historyQuery.error),
    ),
    refresh: historyQuery.refetch,
  }
}
