export type ConnectionErrorKind =
  | 'clawsuite_auth_required'
  | 'gateway_auth_rejected'
  | 'gateway_unreachable'
  | 'handshake_failed'
  | 'handshake_timeout'
  | 'disconnected'
  | 'unknown'

export function classifyConnectionError(
  error: string | Error,
): ConnectionErrorKind {
  const msg = typeof error === 'string' ? error : error.message
  const lower = msg.toLowerCase()
  if (lower.includes('unauthorized') || lower.includes('forbidden'))
    return 'gateway_auth_rejected'
  if (
    lower.includes('econnrefused') ||
    lower.includes('unreachable') ||
    lower.includes('getaddrinfo')
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
        title: 'Gateway Auth Failed',
        description:
          'The gateway rejected your credentials. Check your token or password.',
        action: 'Update credentials in Settings',
      }
    case 'gateway_unreachable':
      return {
        title: 'Gateway Unreachable',
        description: 'Cannot reach the OpenClaw gateway. Is it running?',
        action: 'Check that OpenClaw is running and the URL is correct',
      }
    case 'handshake_failed':
      return {
        title: 'Handshake Failed',
        description:
          'Connection handshake error. This usually fixes itself on retry.',
        action: 'Try refreshing the page',
      }
    case 'handshake_timeout':
      return {
        title: 'Connection Timeout',
        description: 'Gateway did not respond in time.',
        action: 'Check network and try again',
      }
    case 'disconnected':
      return {
        title: 'Disconnected',
        description: 'Lost connection to gateway. Reconnecting…',
      }
    case 'unknown':
      return {
        title: 'Connection Error',
        description: 'Something went wrong connecting to the gateway.',
        action: 'Check logs for details',
      }
  }
}
