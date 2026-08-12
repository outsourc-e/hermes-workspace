const SOURCE_QUALIFIED_CARD_ID_PATTERN = /^(remote|local):\S+$/

/**
 * Resolve the active route to the logical Card identity accepted by the
 * session-status API. Bootstrap aliases and legacy raw session IDs are not
 * Cards, so polling them would repeatedly receive "Card usage unavailable".
 */
export function resolveUsageMeterSessionKey(pathname: string): string | null {
  if (!pathname.startsWith('/chat/')) return null
  const raw = pathname.slice('/chat/'.length).split('/')[0]
  if (!raw) return null
  let cardId: string
  try {
    cardId = decodeURIComponent(raw)
  } catch {
    return null
  }
  return SOURCE_QUALIFIED_CARD_ID_PATTERN.test(cardId) ? cardId : null
}

export function shouldShowUsageMeterContextAlert({
  pathname,
  visible,
}: {
  pathname: string
  visible: boolean
}): boolean {
  return visible && resolveUsageMeterSessionKey(pathname) !== null
}

export function resolveContextAlertThreshold({
  previous,
  current,
  thresholds,
  sent,
}: {
  previous: number | null
  current: number
  thresholds: Array<number>
  sent: Record<number, boolean>
}): number | null {
  if (!Number.isFinite(current)) return null
  if (previous === null || !Number.isFinite(previous)) return null
  if (current <= previous) return null

  const crossed = thresholds.filter(
    (threshold) =>
      previous < threshold && current >= threshold && !sent[threshold],
  )

  if (crossed.length === 0) return null
  return crossed[crossed.length - 1] ?? null
}
