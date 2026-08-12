export type LatestDescendantResolution = {
  requestedSessionKey: string
  sessionKey: string
  changed: boolean
}

type LatestDescendantPayload = {
  ok?: unknown
  supported?: unknown
  changed?: unknown
  requestedSessionKey?: unknown
  sessionKey?: unknown
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

function fallbackResolution(sessionKey: string): LatestDescendantResolution {
  return {
    requestedSessionKey: sessionKey,
    sessionKey,
    changed: false,
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/**
 * Resolve a remote session to its canonical continuation tip. Unsupported,
 * failed, and malformed responses deliberately fall back to the requested key
 * so lineage support can never block ordinary history loading.
 */
export async function resolveLatestDescendant(
  requestedSessionKey: string,
  options: { signal?: AbortSignal; fetcher?: Fetcher } = {},
): Promise<LatestDescendantResolution> {
  const sessionKey = requestedSessionKey.trim()
  if (!sessionKey) return fallbackResolution(requestedSessionKey)

  const fetcher = options.fetcher ?? fetch
  try {
    const response = await fetcher(
      `/api/sessions/${encodeURIComponent(sessionKey)}/latest-descendant`,
      { signal: options.signal },
    )
    if (!response.ok) return fallbackResolution(sessionKey)

    const payload = (await response.json()) as LatestDescendantPayload | null
    if (!payload || typeof payload !== 'object') {
      return fallbackResolution(sessionKey)
    }

    const payloadRequestedSessionKey =
      typeof payload.requestedSessionKey === 'string'
        ? payload.requestedSessionKey.trim()
        : ''
    const resolvedSessionKey =
      typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : ''
    const isChangedResolution =
      payload.ok === true &&
      payload.supported === true &&
      payload.changed === true &&
      payloadRequestedSessionKey === sessionKey &&
      resolvedSessionKey.length > 0 &&
      resolvedSessionKey !== sessionKey

    if (!isChangedResolution) return fallbackResolution(sessionKey)

    return {
      requestedSessionKey: sessionKey,
      sessionKey: resolvedSessionKey,
      changed: true,
    }
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error
    return fallbackResolution(sessionKey)
  }
}
