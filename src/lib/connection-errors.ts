export type ConnectionErrorKind =
  | 'clawsuite_auth_required'
  | 'gateway_auth_rejected'
  | 'gateway_pairing_required'
  | 'gateway_unreachable'
  | 'handshake_failed'
  | 'handshake_timeout'
  | 'disconnected'
  | 'unknown'

// Markers that indicate an auth failure happened (used to qualify generic
// keywords like "token" so we don't misclassify network noise).
const AUTH_FAILURE_MARKERS = [
  'unauthorized',
  'unauthenticated',
  'forbidden',
  'invalid',
  'expired',
  'rejected',
  'denied',
  'missing',
  'no auth',
  'auth failed',
  'auth required',
  '401',
  '403',
]

function looksLikeAuthFailure(lower: string): boolean {
  return AUTH_FAILURE_MARKERS.some((marker) => lower.includes(marker))
}

export function classifyConnectionError(
  error?: string | Error | null,
  status?: number | null,
): ConnectionErrorKind {
  const msg = typeof error === 'string' ? error : (error?.message ?? '')
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
  // Gateway auth rejection: the gateway received our request but refused
  // the device's auth token. Match on phrases that clearly indicate an
  // auth failure — generic words like "token" only count when paired with
  // an auth-failure marker (rejected/invalid/expired/etc.) so that benign
  // strings like "failed to fetch token from /api/x" don't get misrouted
  // to a "log in again" prompt.
  if (
    lower.includes('missing gateway auth') ||
    lower.includes('gateway auth') ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    (lower.includes('token') && looksLikeAuthFailure(lower))
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
        title: 'Требуется вход в ClawSuite',
        description: 'Для доступа к этому экземпляру нужен пароль.',
        action: 'Введите пароль, чтобы продолжить',
      }
    case 'gateway_auth_rejected':
      return {
        title: 'Шлюз отклонил это устройство',
        description:
          "Шлюз доступен, но отклонил токен этого устройства. Токен отсутствует, недействителен или истёк.",
        action:
          'Подключите устройство к шлюзу заново или проверьте токен авторизации шлюза.',
      }
    case 'gateway_pairing_required':
      return {
        title: 'Сначала подключите это устройство',
        description: 'Это устройство ещё не подключено к шлюзу.',
        action: 'Выполните `claude pair` на машине со шлюзом и подключитесь снова.',
      }
    case 'gateway_unreachable':
      return {
        title: 'Шлюз недоступен',
        description: 'Не удаётся подключиться к настроенному шлюзу.',
        action: 'Убедитесь, что шлюз запущен, а URL указан верно.',
      }
    case 'handshake_failed':
      return {
        title: 'Не удалось проверить подключение',
        description:
          'Шлюз ответил, но защищённое соединение установить не удалось.',
        action:
          'Попробуйте переподключиться. Если не получается, проверьте сопряжение и авторизацию шлюза.',
      }
    case 'handshake_timeout':
      return {
        title: 'Время подключения истекло',
        description: 'Шлюз не ответил вовремя.',
        action: 'Проверьте сеть и повторите попытку.',
      }
    case 'disconnected':
      return {
        title: 'Подключение потеряно',
        description: 'Подключение к шлюзу прервано.',
        action: 'Подождите немного и повторите, если подключение не восстановится.',
      }
    case 'unknown':
      return {
        title: 'Ошибка подключения',
        description: 'При подключении к шлюзу что-то пошло не так.',
        action: 'Повторите попытку или проверьте настройки шлюза.',
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
    typeof error === 'string' ? error.trim() : (error?.message?.trim() ?? '')

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
