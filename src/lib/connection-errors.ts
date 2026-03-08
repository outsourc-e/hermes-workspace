export type ConnectionErrorKind =
  | 'clawsuite_auth_required'
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
  if (status === 401) return 'clawsuite_auth_required'
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
    case 'clawsuite_auth_required':
      return {
        title: 'ClawSuite Login Required',
        description: 'This instance requires a password to access.',
        action: 'Enter your password to continue',
      }
    case 'gateway_auth_rejected':
      return {
        title: 'Authentication required',
        description:
          'The gateway rejected this connection.',
        action: 'Update your gateway token in Settings and try again.',
      }
    case 'gateway_pairing_required':
      return {
        title: 'Pair this device first',
        description:
          'This device is not paired with the gateway yet.',
        action: 'Run `openclaw pair` on the gateway machine, then reconnect.',
      }
    case 'gateway_unreachable':
      return {
        title: 'Gateway unreachable',
        description: 'ClawSuite cannot reach the configured OpenClaw gateway.',
        action: 'Check that OpenClaw is running and the gateway URL is correct.',
      }
    case 'handshake_failed':
      return {
        title: 'Connection could not be verified',
        description:
          'The gateway responded, but the secure connection handshake did not complete.',
        action: 'Try reconnecting. If it keeps failing, check gateway pairing and auth.',
      }
    case 'handshake_timeout':
      return {
        title: 'Connection timed out',
        description: 'The gateway did not respond in time.',
        action: 'Check your network and try again.',
      }
    case 'disconnected':
      return {
        title: 'Connection lost',
        description: 'The connection to the gateway was interrupted.',
        action: 'Wait a moment, then retry if it does not reconnect.',
      }
    case 'unknown':
      return {
        title: 'Connection error',
        description: 'Something went wrong while connecting to the gateway.',
        action: 'Try again, or review the gateway settings.',
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
      'could not reach clawsuite server',
    ].includes(details.toLowerCase())

  return {
    kind,
    ...base,
    details: showDetails ? details : undefined,
  }
}
