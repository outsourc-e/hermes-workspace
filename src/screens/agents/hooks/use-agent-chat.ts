import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveOperationsChatCardId } from './use-operations'
import type { OperationsChatTarget } from './use-operations'
import type { ChatMessage, SessionCard } from '@/screens/chat/types'
import {
  readMessageJournal,
  removeMessageJournalValues,
  writeMessageJournal,
} from '@/screens/chat/durable-message-journal'
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

type OperationsChatOverlayEnvelope = {
  version: 2
  revision: number
  owner: { cardId: string }
  messages: Array<OperationsChatOverlayMessage>
}

type OperationsChatCompleteSnapshot = {
  version: 2
  revision: number
  owner: { cardId: string }
  messages: Array<OperationsChatMessage>
}

type StoredMessages<T> = {
  revision: number
  messages: Array<T>
}

const OPERATIONS_CHAT_OVERLAY_PREFIX = 'workspace.operations-card-chat.v1:'
const OPERATIONS_CHAT_COMPLETE_PREFIX =
  'workspace.operations-card-complete-history.v1:'

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

function overlayStorageKey(cardId: string) {
  return `${OPERATIONS_CHAT_OVERLAY_PREFIX}${encodeURIComponent(cardId)}`
}

function completeSnapshotStorageKey(cardId: string) {
  return `${OPERATIONS_CHAT_COMPLETE_PREFIX}${encodeURIComponent(cardId)}`
}

function storageMirrors() {
  if (typeof window === 'undefined') return []
  const mirrors: Array<Storage> = []
  try {
    mirrors.push(window.localStorage)
  } catch {}
  try {
    if (!mirrors.includes(window.sessionStorage)) {
      mirrors.push(window.sessionStorage)
    }
  } catch {}
  return mirrors
}

function removeInvalidStoredValue(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
  } catch {}
}

function parseEnvelope(
  raw: string,
  cardId: string,
): { parsed: Record<string, unknown>; revision: number } | undefined {
  const parsedValue = JSON.parse(raw) as unknown
  if (!parsedValue || typeof parsedValue !== 'object') return undefined
  const parsed = parsedValue as Record<string, unknown>
  const owner =
    parsed.owner && typeof parsed.owner === 'object'
      ? (parsed.owner as Record<string, unknown>)
      : undefined
  const revision =
    parsed.version === 1
      ? 0
      : parsed.version === 2 &&
          typeof parsed.revision === 'number' &&
          Number.isSafeInteger(parsed.revision) &&
          parsed.revision > 0
        ? parsed.revision
        : undefined
  if (
    revision === undefined ||
    owner?.cardId !== cardId ||
    !Array.isArray(parsed.messages)
  ) {
    return undefined
  }
  return { parsed, revision }
}

function readMirroredMessages<T>(
  key: string,
  parse: (raw: string) => StoredMessages<T> | undefined,
): StoredMessages<T> | undefined {
  let newest: StoredMessages<T> | undefined
  for (const storage of storageMirrors()) {
    try {
      const raw = storage.getItem(key)
      if (!raw) continue
      const candidate = parse(raw)
      if (!candidate) {
        removeInvalidStoredValue(storage, key)
        continue
      }
      if (!newest || candidate.revision > newest.revision) newest = candidate
    } catch {}
  }
  return newest
}

function writeMirroredEnvelope(
  key: string,
  previousRevision: number,
  envelope: OperationsChatOverlayEnvelope | OperationsChatCompleteSnapshot,
) {
  const serialized = JSON.stringify(envelope)
  const writtenStorages: Array<Storage> = []
  const verifiedStorages: Array<Storage> = []
  for (const storage of storageMirrors()) {
    try {
      storage.setItem(key, serialized)
      writtenStorages.push(storage)
      if (storage.getItem(key) === serialized) verifiedStorages.push(storage)
    } catch {}
  }
  if (envelope.revision !== previousRevision + 1) {
    return {
      anyVerified: false,
      persistentVerified: false,
      writtenStorages: [],
      verifiedStorages: [],
    }
  }
  return {
    anyVerified: verifiedStorages.length > 0,
    persistentVerified: verifiedStorages.some((storage) => {
      try {
        return storage === window.localStorage
      } catch {
        return false
      }
    }),
    writtenStorages,
    verifiedStorages,
  }
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

function mergeOperationsMessages<T extends { id: string }>(
  base: Array<T>,
  journal: Array<T>,
): Array<T> {
  const merged = new Map(base.map((message) => [message.id, message]))
  for (const message of journal) merged.set(message.id, message)
  return [...merged.values()]
}

function parseCompleteSnapshot(
  raw: string,
  cardId: string,
): StoredMessages<OperationsChatMessage> | undefined {
  try {
    const envelope = parseEnvelope(raw, cardId)
    if (!envelope) return undefined
    const { parsed, revision } = envelope
    const messages: Array<OperationsChatMessage> = []
    for (const candidateValue of parsed.messages as Array<unknown>) {
      if (
        !candidateValue ||
        typeof candidateValue !== 'object' ||
        Array.isArray(candidateValue)
      ) {
        return undefined
      }
      const candidate = candidateValue as Record<string, unknown>
      if (
        (candidate.role !== 'user' &&
          candidate.role !== 'assistant' &&
          candidate.role !== 'system') ||
        typeof candidate.id !== 'string' ||
        !candidate.id ||
        typeof candidate.content !== 'string' ||
        !candidate.content.trim()
      ) {
        return undefined
      }
      messages.push({
        id: candidate.id,
        role: candidate.role,
        content: candidate.content,
        ...(typeof candidate.timestamp === 'number' &&
        Number.isFinite(candidate.timestamp)
          ? { timestamp: candidate.timestamp }
          : {}),
      })
    }
    return { revision, messages }
  } catch {
    return undefined
  }
}

function readCompleteSnapshot(cardId: string): Array<OperationsChatMessage> {
  if (!cardId) return []
  const key = completeSnapshotStorageKey(cardId)
  const mirrors = storageMirrors()
  const base =
    readMirroredMessages(key, (raw) => parseCompleteSnapshot(raw, cardId))
      ?.messages ?? []
  const journal = readMessageJournal(
    key,
    mirrors,
    (message: OperationsChatMessage) => message.id,
    parseCompleteMessage,
  )
  return mergeOperationsMessages(base, journal)
}

function writeCompleteSnapshot(
  cardId: string,
  messages: Array<OperationsChatMessage>,
) {
  if (!cardId) return { anyVerified: false, persistentVerified: false }
  const key = completeSnapshotStorageKey(cardId)
  const previous = readMirroredMessages(key, (raw) =>
    parseCompleteSnapshot(raw, cardId),
  )
  const previousRevision = previous?.revision ?? 0
  const revision = previousRevision + 1
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    return { anyVerified: false, persistentVerified: false }
  }
  const envelope: OperationsChatCompleteSnapshot = {
    version: 2,
    revision,
    owner: { cardId },
    messages,
  }
  const envelopeWrite = writeMirroredEnvelope(key, previousRevision, envelope)
  if (!envelopeWrite.anyVerified) {
    return { anyVerified: false, persistentVerified: false }
  }
  const journalWrite = writeMessageJournal(
    key,
    messages,
    envelopeWrite.writtenStorages,
    (message) => message.id,
  )
  return {
    // The compact envelope remains a safe compatibility fallback if a mirror
    // cannot allocate the additional union-journal rows.
    anyVerified: envelopeWrite.anyVerified,
    persistentVerified:
      envelopeWrite.persistentVerified || journalWrite.persistentVerified,
  }
}

function parseOverlay(
  raw: string,
  cardId: string,
): StoredMessages<OperationsChatOverlayMessage> | undefined {
  try {
    const envelope = parseEnvelope(raw, cardId)
    if (!envelope) return undefined
    const { parsed, revision } = envelope
    const messages: Array<OperationsChatOverlayMessage> = []
    for (const candidateValue of parsed.messages as Array<unknown>) {
      if (
        !candidateValue ||
        typeof candidateValue !== 'object' ||
        Array.isArray(candidateValue)
      ) {
        return undefined
      }
      const candidate = candidateValue as Record<string, unknown>
      if (
        (candidate.role !== 'user' && candidate.role !== 'assistant') ||
        typeof candidate.id !== 'string' ||
        !candidate.id ||
        typeof candidate.content !== 'string' ||
        !candidate.content.trim() ||
        typeof candidate.acknowledgementOrdinal !== 'number' ||
        !Number.isSafeInteger(candidate.acknowledgementOrdinal) ||
        candidate.acknowledgementOrdinal < 1
      ) {
        return undefined
      }
      messages.push({
        id: candidate.id,
        role: candidate.role,
        content: candidate.content,
        acknowledgementOrdinal: candidate.acknowledgementOrdinal,
        ...(typeof candidate.timestamp === 'number' &&
        Number.isFinite(candidate.timestamp)
          ? { timestamp: candidate.timestamp }
          : {}),
      })
    }
    return { revision, messages }
  } catch {
    return undefined
  }
}

function readOverlay(cardId: string): Array<OperationsChatOverlayMessage> {
  if (!cardId) return []
  const key = overlayStorageKey(cardId)
  const mirrors = storageMirrors()
  const base =
    readMirroredMessages(key, (raw) => parseOverlay(raw, cardId))?.messages ??
    []
  const journal = readMessageJournal(
    key,
    mirrors,
    (message: OperationsChatOverlayMessage) => message.id,
    parseOverlayMessage,
  )
  return mergeOperationsMessages(base, journal)
}

function writeOverlay(
  cardId: string,
  messages: Array<OperationsChatOverlayMessage>,
  requirePersistent = true,
  acknowledged: Array<OperationsChatOverlayMessage> = [],
) {
  if (!cardId) return false
  const key = overlayStorageKey(cardId)
  const mirrors = storageMirrors()
  const previous = readMirroredMessages(key, (raw) => parseOverlay(raw, cardId))
  const previousRevision = previous?.revision ?? 0
  const revision = previousRevision + 1
  if (!Number.isSafeInteger(revision) || revision <= 0) return false
  const envelope: OperationsChatOverlayEnvelope = {
    version: 2,
    revision,
    owner: { cardId },
    messages,
  }
  const envelopeWrite = writeMirroredEnvelope(key, previousRevision, envelope)
  if (!envelopeWrite.anyVerified) return false
  const journalWrite = writeMessageJournal(
    key,
    messages,
    envelopeWrite.writtenStorages,
    (message) => message.id,
  )
  const persistentVerified =
    envelopeWrite.persistentVerified || journalWrite.persistentVerified
  if (requirePersistent && !persistentVerified) return false
  if (acknowledged.length > 0) {
    removeMessageJournalValues(
      key,
      acknowledged,
      envelopeWrite.verifiedStorages,
      (message) => message.id,
    )
  }
  return true
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
  onText: (text: string) => void,
) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Operations chat stream is unavailable')
  const decoder = new TextDecoder()
  let buffer = ''
  let assistantText = ''

  const processBufferedEvents = (flush: boolean) => {
    const blocks = buffer.split('\n\n')
    buffer = flush ? '' : (blocks.pop() ?? '')
    for (const block of blocks) {
      if (!block.trim()) continue
      const result = processSseBlock(block, assistantText)
      if (result.error) throw new Error(result.error)
      assistantText = result.text
      if (result.changed) onText(assistantText)
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
    processBufferedEvents(false)
  }
  buffer += decoder.decode().replaceAll('\r\n', '\n')
  if (buffer.trim()) buffer += '\n\n'
  processBufferedEvents(true)
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
  writeCompleteSnapshot: (
    cardId: string,
    messages: Array<OperationsChatMessage>,
  ) => writeCompleteSnapshot(cardId, messages).anyVerified,
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
  }>(() => ({
    ownerCardId: cardId,
    messages: readCompleteSnapshot(cardId),
    persistentVerified: false,
  }))
  const [overlayMessages, setOverlayMessages] = useState<
    Array<OperationsChatOverlayMessage>
  >(() => readOverlay(ownerCardId))
  const [durabilityError, setDurabilityError] = useState<string | null>(null)
  const overlayRef = useRef(overlayMessages)
  const overlayOwnerRef = useRef(ownerCardId)

  const commitOverlay = (
    nextMessages: Array<OperationsChatOverlayMessage>,
    expectedOwner = ownerCardId,
    requirePersistent = true,
  ) => {
    if (!expectedOwner) return false
    if (!writeOverlay(expectedOwner, nextMessages, requirePersistent))
      return false
    if (overlayOwnerRef.current === expectedOwner) {
      overlayRef.current = nextMessages
      setOverlayMessages(nextMessages)
    }
    return true
  }

  useEffect(() => {
    setDurabilityError(null)
    setCompleteSnapshot({
      ownerCardId: cardId,
      messages: readCompleteSnapshot(cardId),
      persistentVerified: false,
    })
  }, [cardId])

  useEffect(() => {
    if (!completeHistory || !cardId) return
    const snapshotWrite = writeCompleteSnapshot(
      cardId,
      currentAuthoritativeMessages,
    )
    if (snapshotWrite.anyVerified) {
      setDurabilityError(null)
      setCompleteSnapshot({
        ownerCardId: cardId,
        messages: currentAuthoritativeMessages,
        persistentVerified: snapshotWrite.persistentVerified,
      })
    } else {
      setDurabilityError(
        'Operations chat recovery storage is unavailable. This complete transcript is not available after reload until storage recovers.',
      )
    }
  }, [cardId, completeHistory, currentAuthoritativeMessages])

  useEffect(() => {
    overlayOwnerRef.current = ownerCardId
    const recovered = readOverlay(ownerCardId)
    overlayRef.current = recovered
    setOverlayMessages(recovered)
  }, [ownerCardId])

  const authoritativeMessages = completeHistory
    ? currentAuthoritativeMessages
    : completeSnapshot.ownerCardId === cardId
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
      completeSnapshot.ownerCardId !== cardId ||
      completeSnapshot.messages !== currentAuthoritativeMessages ||
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
    if (!completeSnapshot.persistentVerified) return
    if (!writeOverlay(ownerCardId, unacknowledgedOverlay, true, acknowledged)) {
      return
    }
    if (overlayOwnerRef.current === ownerCardId) {
      overlayRef.current = unacknowledgedOverlay
      setOverlayMessages(unacknowledgedOverlay)
    }
  }, [
    cardId,
    completeHistory,
    completeSnapshot,
    currentAuthoritativeMessages,
    ownerCardId,
    overlayMessages,
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
      let activeSendOverlay = [...overlayRef.current, optimisticUser]
      const overlayBeforeSend = overlayRef.current
      if (!commitOverlay(activeSendOverlay, ownerCardId)) {
        if (overlayOwnerRef.current === ownerCardId) {
          overlayRef.current = overlayBeforeSend
          setOverlayMessages(overlayBeforeSend)
        }
        throw new Error(
          'Operations chat recovery storage is unavailable. Message was not sent.',
        )
      }

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
      await consumeAssistantStream(response, (content) => {
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
          activeSendOverlay = activeSendOverlay.map((entry) =>
            entry.id === assistantId
              ? { ...entry, content, acknowledgementOrdinal }
              : entry,
          )
          if (!commitOverlay(activeSendOverlay, ownerCardId, false)) {
            throw new Error(
              'Operations chat recovery storage became unavailable. The last durable stream checkpoint is still shown.',
            )
          }
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
        activeSendOverlay = [...activeSendOverlay, assistant]
        if (!commitOverlay(activeSendOverlay, ownerCardId, false)) {
          throw new Error(
            'Operations chat recovery storage became unavailable. The last durable stream checkpoint is still shown.',
          )
        }
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
          durabilityError ||
          null

  return {
    messages,
    sendMessage: sendMutation.mutateAsync,
    canSend: Boolean(target && !child),
    isLoading: historyQuery.isPending,
    isRefreshing: historyQuery.isFetching,
    isSending: sendMutation.isPending,
    error,
    canRetryHistory: Boolean(
      target && (historyUnavailable || historyQuery.error),
    ),
    refresh: historyQuery.refetch,
  }
}
