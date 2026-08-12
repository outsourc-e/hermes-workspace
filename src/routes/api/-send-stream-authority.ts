const SESSION_BOOTSTRAP_KEYS = new Set(['main', 'new'])

export function isExplicitSendStreamBootstrap(
  rawSessionKey: string,
  bodySessionKey: unknown,
): boolean {
  return (
    typeof bodySessionKey === 'string' &&
    bodySessionKey === rawSessionKey &&
    SESSION_BOOTSTRAP_KEYS.has(rawSessionKey)
  )
}
