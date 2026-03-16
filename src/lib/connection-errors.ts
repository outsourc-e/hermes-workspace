export type ConnectionErrorKind =
  | 'hermes_auth_required'
  | 'gateway_auth_rejected'
  | 'gateway_pairing_required'
  | 'gateway_unreachable'
  | 'handshake_failed'
  | 'handshake_timeout'
  | 'disconnected'
  | 'unknown'

export function classifyConnectionError(
  error?: string | Error | null,
  status?: number | null,
): ConnectionErrorKind {
  const msg = typeof error === 'string' ? error : error?.message ?? ''
  const lower = msg.toLowerCase()
  if (!lower && !status) return 'gateway_unreachable'
  if (status === 401) return 'hermes_auth_required'
  if (
    status === 403 ||
    lower.includes('pair') ||
    lower.includes('not paired')
  ) {
    return 'gateway_pairing_required'
  }
  if (
    lower.includes('missing gateway auth') ||
    lower.includes('gateway auth') ||
    lower.includes('token') ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized')
  ) {
    return 'gateway_auth_rejected'
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('unreachable') ||
    lower.includes('getaddrinfo') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('not reachable')
  )
    return 'gateway_unreachable'
  if (
    lower.includes('nonce') ||
    lower.includes('invalid connect') ||
    lower.includes('handshake')
  )
    return 'handshake_failed'
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'handshake_timeout'
  if (lower.includes('closed') || lower.includes('disconnect'))
    return 'disconnected'
  return 'unknown'
}

export type ConnectionErrorInfo = {
  title: string
  description: string
  action?: string
}

export function getConnectionErrorMessage(
  kind: ConnectionErrorKind,
): ConnectionErrorInfo {
  switch (kind) {
    case 'hermes_auth_required':
      return {
        title: 'Hermes Workspace Login Required',
        description: 'This instance requires a password to access.',
        action: 'Enter your password to continue',
      }
    case 'gateway_auth_rejected':
      return {
        title: 'Authentication required',
        description:
          'Hermes rejected this connection.',
        action: 'Update your Hermes token in Settings and try again.',
      }
    case 'gateway_pairing_required':
      return {
        title: 'Pair this device first',
        description:
          'This device is not paired with Hermes yet.',
        action: 'Run `openclaw pair` on the Hermes machine, then reconnect.',
      }
    case 'gateway_unreachable':
      return {
        title: 'Hermes unreachable',
        description: 'Hermes Workspace cannot reach the configured Hermes instance.',
        action: 'Check that Hermes is running and the Hermes URL is correct.',
      }
    case 'handshake_failed':
      return {
        title: 'Connection could not be verified',
        description:
          'Hermes responded, but the secure connection handshake did not complete.',
        action: 'Try reconnecting. If it keeps failing, check Hermes pairing and auth.',
      }
    case 'handshake_timeout':
      return {
        title: 'Connection timed out',
        description: 'Hermes did not respond in time.',
        action: 'Check your network and try again.',
      }
    case 'disconnected':
      return {
        title: 'Connection lost',
        description: 'The connection to Hermes was interrupted.',
        action: 'Wait a moment, then retry if it does not reconnect.',
      }
    case 'unknown':
      return {
        title: 'Connection error',
        description: 'Something went wrong while connecting to Hermes.',
        action: 'Try again, or review the Hermes settings.',
      }
  }
}

export function getConnectionErrorInfo(
  error?: string | Error | null,
  status?: number | null,
): ConnectionErrorInfo & { kind: ConnectionErrorKind; details?: string } {
  const kind = classifyConnectionError(error, status)
  const base = getConnectionErrorMessage(kind)
  const details =
    typeof error === 'string'
      ? error.trim()
      : error?.message?.trim() ?? ''

  const showDetails =
    details.length > 0 &&
    ![
      'unauthorized',
      'forbidden',
      'failed to fetch',
      'gateway not reachable',
      'could not reach hermes server',
    ].includes(details.toLowerCase())

  return {
    kind,
    ...base,
    details: showDetails ? details : undefined,
  }
}
