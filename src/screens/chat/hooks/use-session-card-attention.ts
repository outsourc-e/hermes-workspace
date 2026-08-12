'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { SessionCard } from '../types'

const SESSION_CARD_ATTENTION_VERSION = 1
export const SESSION_CARD_ATTENTION_STORAGE_KEY =
  'hermes-session-card-attention-v1'

type ActivityTimestamp = number | null

type SessionCardAttentionEvidence = {
  observedAt: ActivityTimestamp
  acknowledgedAt: ActivityTimestamp
  attentionAt: ActivityTimestamp
}

export type SessionCardAttentionState = {
  cards: Record<string, SessionCardAttentionEvidence>
}

type AttentionCard = Pick<
  SessionCard,
  'cardId' | 'relationshipKind' | 'activity'
>

export type SessionCardAttentionAction =
  | { type: 'hydrate'; state: SessionCardAttentionState }
  | { type: 'observe'; cards: ReadonlyArray<AttentionCard> }
  | {
      type: 'acknowledge'
      cardId: string
      throughUpdatedAt: ActivityTimestamp
    }

const EMPTY_ATTENTION_STATE: SessionCardAttentionState = { cards: {} }

function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasAttention(evidence: SessionCardAttentionEvidence): boolean {
  return evidence.attentionAt !== null
}

function observeCards(
  state: SessionCardAttentionState,
  cards: ReadonlyArray<AttentionCard>,
): SessionCardAttentionState {
  let nextCards = state.cards

  for (const card of cards) {
    if (card.relationshipKind !== 'root' || card.cardId.trim().length === 0) {
      continue
    }

    const activity = card.activity
    const activityUpdatedAt =
      activity && isValidTimestamp(activity.updatedAt)
        ? activity.updatedAt
        : null
    const current = nextCards[card.cardId]

    if (!current) {
      if (nextCards === state.cards) nextCards = { ...state.cards }
      nextCards[card.cardId] = {
        observedAt: activityUpdatedAt,
        acknowledgedAt: activityUpdatedAt,
        attentionAt: null,
      }
      continue
    }

    if (
      activityUpdatedAt === null ||
      (current.observedAt !== null && activityUpdatedAt <= current.observedAt)
    ) {
      continue
    }

    const terminalNeedsAttention =
      activity?.state === 'completed' || activity?.state === 'pending_approval'
    if (nextCards === state.cards) nextCards = { ...state.cards }
    nextCards[card.cardId] = {
      ...current,
      observedAt: activityUpdatedAt,
      attentionAt: terminalNeedsAttention
        ? activityUpdatedAt
        : current.attentionAt,
    }
  }

  return nextCards === state.cards ? state : { cards: nextCards }
}

function acknowledgeCard(
  state: SessionCardAttentionState,
  cardId: string,
  throughUpdatedAt: ActivityTimestamp,
): SessionCardAttentionState {
  const current = state.cards[cardId]
  if (
    !current ||
    current.observedAt === null ||
    throughUpdatedAt === null ||
    !isValidTimestamp(throughUpdatedAt)
  ) {
    return state
  }

  const acknowledgedAt = Math.min(throughUpdatedAt, current.observedAt)
  const nextAcknowledgedAt = Math.max(
    current.acknowledgedAt ?? 0,
    acknowledgedAt,
  )
  const nextAttentionAt =
    current.attentionAt !== null && current.attentionAt <= nextAcknowledgedAt
      ? null
      : current.attentionAt

  if (
    nextAcknowledgedAt === current.acknowledgedAt &&
    nextAttentionAt === current.attentionAt
  ) {
    return state
  }

  return {
    cards: {
      ...state.cards,
      [cardId]: {
        ...current,
        acknowledgedAt: nextAcknowledgedAt,
        attentionAt: nextAttentionAt,
      },
    },
  }
}

export function sessionCardAttentionReducer(
  state: SessionCardAttentionState,
  action: SessionCardAttentionAction,
): SessionCardAttentionState {
  if (action.type === 'hydrate') return action.state
  if (action.type === 'observe') return observeCards(state, action.cards)
  return acknowledgeCard(state, action.cardId, action.throughUpdatedAt)
}

export function parseSessionCardAttentionState(
  raw: string | null,
): SessionCardAttentionState {
  if (!raw) return EMPTY_ATTENTION_STATE

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      parsed.version !== SESSION_CARD_ATTENTION_VERSION ||
      !Array.isArray(parsed.cards)
    ) {
      return EMPTY_ATTENTION_STATE
    }

    const cards: Record<string, SessionCardAttentionEvidence> = {}
    for (const candidate of parsed.cards) {
      if (
        !isRecord(candidate) ||
        typeof candidate.cardId !== 'string' ||
        candidate.cardId.trim().length === 0
      ) {
        continue
      }

      const observedAt = candidate.observedAt
      const acknowledgedAt = candidate.acknowledgedAt
      const attentionAt = candidate.attentionAt
      const validNullableTimestamp = (value: unknown) =>
        value === null || isValidTimestamp(value)
      if (
        !validNullableTimestamp(observedAt) ||
        !validNullableTimestamp(acknowledgedAt) ||
        !validNullableTimestamp(attentionAt) ||
        (observedAt === null &&
          (acknowledgedAt !== null || attentionAt !== null)) ||
        (observedAt !== null &&
          acknowledgedAt !== null &&
          acknowledgedAt > observedAt) ||
        (observedAt !== null &&
          attentionAt !== null &&
          attentionAt > observedAt)
      ) {
        continue
      }

      cards[candidate.cardId] = {
        observedAt: observedAt as ActivityTimestamp,
        acknowledgedAt: acknowledgedAt as ActivityTimestamp,
        attentionAt:
          attentionAt !== null &&
          acknowledgedAt !== null &&
          attentionAt <= acknowledgedAt
            ? null
            : (attentionAt as ActivityTimestamp),
      }
    }
    return { cards }
  } catch {
    return EMPTY_ATTENTION_STATE
  }
}

function serializeSessionCardAttentionState(
  state: SessionCardAttentionState,
): string {
  return JSON.stringify({
    version: SESSION_CARD_ATTENTION_VERSION,
    cards: Object.entries(state.cards)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cardId, evidence]) => ({ cardId, ...evidence })),
  })
}

function loadSessionCardAttentionState(): SessionCardAttentionState {
  if (typeof window === 'undefined') return EMPTY_ATTENTION_STATE
  try {
    return parseSessionCardAttentionState(
      window.localStorage.getItem(SESSION_CARD_ATTENTION_STORAGE_KEY),
    )
  } catch {
    return EMPTY_ATTENTION_STATE
  }
}

type PendingView = {
  cardId: string
  fromActiveCardId: string
  throughUpdatedAt: ActivityTimestamp
}

export function useSessionCardAttention({
  cards,
  activeCardId,
}: {
  cards: ReadonlyArray<SessionCard>
  activeCardId: string
}) {
  const [state, dispatch] = useReducer(
    sessionCardAttentionReducer,
    EMPTY_ATTENTION_STATE,
  )
  const [hydrated, setHydrated] = useState(false)
  const stateRef = useRef(state)
  const activeCardIdRef = useRef<string | undefined>(undefined)
  const pendingViewRef = useRef<PendingView | null>(null)
  stateRef.current = state

  useEffect(() => {
    dispatch({ type: 'hydrate', state: loadSessionCardAttentionState() })
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    dispatch({ type: 'observe', cards })

    const previousActiveCardId = activeCardIdRef.current
    const becameActive = previousActiveCardId !== activeCardId
    let throughUpdatedAt: ActivityTimestamp = null

    if (activeCardId && activeCardId !== 'new') {
      const pendingView = pendingViewRef.current
      const consumesPendingView =
        becameActive &&
        pendingView?.cardId === activeCardId &&
        pendingView.fromActiveCardId === previousActiveCardId
      throughUpdatedAt = consumesPendingView
        ? pendingView.throughUpdatedAt
        : Number.MAX_SAFE_INTEGER
    }

    if (throughUpdatedAt !== null) {
      dispatch({
        type: 'acknowledge',
        cardId: activeCardId,
        throughUpdatedAt,
      })
    }
    if (becameActive) pendingViewRef.current = null
    activeCardIdRef.current = activeCardId
  }, [activeCardId, cards, hydrated])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        SESSION_CARD_ATTENTION_STORAGE_KEY,
        serializeSessionCardAttentionState(state),
      )
    } catch {
      // Attention remains safely latched in memory when persistence is blocked.
    }
  }, [hydrated, state])

  const attentionCardIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [cardId, evidence] of Object.entries(state.cards)) {
      if (hasAttention(evidence)) ids.add(cardId)
    }
    return ids as ReadonlySet<string>
  }, [state.cards])

  const markCardForViewing = useCallback((cardId: string) => {
    const fromActiveCardId = activeCardIdRef.current ?? ''
    if (cardId === fromActiveCardId) return
    pendingViewRef.current = {
      cardId,
      fromActiveCardId,
      throughUpdatedAt: stateRef.current.cards[cardId]?.observedAt ?? null,
    }
  }, [])

  return { attentionCardIds, markCardForViewing }
}
