const SOURCE_QUALIFIED_IDENTITY_PATTERN = /^(remote|local):\S+$/

function isSourceQualifiedIdentity(value: string): boolean {
  return SOURCE_QUALIFIED_IDENTITY_PATTERN.test(value)
}

export type SessionCardStatusUsage = {
  model: string
  contextPercent: number
  maxTokens: number
  usedTokens: number
}

export function parseSessionCardStatusUsage(
  payload: unknown,
  cardId: string,
): SessionCardStatusUsage | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null
  const outer = payload as Record<string, unknown>
  const body =
    outer.payload &&
    typeof outer.payload === 'object' &&
    !Array.isArray(outer.payload)
      ? (outer.payload as Record<string, unknown>)
      : outer
  if (!Array.isArray(body.cards)) return null
  const matches = body.cards.filter(
    (candidate): candidate is Record<string, unknown> =>
      Boolean(candidate) &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      (candidate as Record<string, unknown>).cardId === cardId,
  )
  if (matches.length !== 1) return null
  const usage = matches[0]!.usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null
  const record = usage as Record<string, unknown>
  const finiteNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0
  return {
    model: typeof record.model === 'string' ? record.model.trim() : '',
    contextPercent: finiteNumber(record.contextPercent),
    maxTokens: finiteNumber(record.maxTokens),
    usedTokens: finiteNumber(record.usedTokens),
  }
}

export function parseSessionCardStatusModel(
  payload: unknown,
  cardId: string,
): string {
  return parseSessionCardStatusUsage(payload, cardId)?.model ?? ''
}

export async function fetchSessionCardStatusModel(
  cardId?: string,
): Promise<string> {
  const normalized = cardId?.trim()
  if (!normalized || !isSourceQualifiedIdentity(normalized)) return ''
  const response = await fetch(
    `/api/session-status?cardId=${encodeURIComponent(normalized)}`,
  )
  if (!response.ok) throw new Error('Failed to fetch Card status model')
  return parseSessionCardStatusModel(await response.json(), normalized)
}
