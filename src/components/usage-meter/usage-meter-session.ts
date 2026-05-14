export function resolveUsageMeterSessionKey(pathname: string): string {
  if (!pathname.startsWith('/chat/')) return 'main'
  const raw = pathname.slice('/chat/'.length).split('/')[0] || 'main'
  try {
    return decodeURIComponent(raw) || 'main'
  } catch {
    return raw || 'main'
  }
}

export function shouldShowUsageMeterContextAlert({
  pathname,
  visible,
}: {
  pathname: string
  visible: boolean
}): boolean {
  return visible && pathname.startsWith('/chat/')
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
    (threshold) => previous < threshold && current >= threshold && !sent[threshold],
  )

  if (crossed.length === 0) return null
  return crossed[crossed.length - 1] ?? null
}
