export type DashboardOAuthStartResponse = {
  session_id?: unknown
  device_code?: unknown
  user_code?: unknown
  verification_url?: unknown
  verification_uri_complete?: unknown
  verification_uri?: unknown
  poll_interval?: unknown
  interval?: unknown
  expires_in?: unknown
  error?: unknown
  detail?: unknown
  message?: unknown
}


export function readOAuthError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const error = record.error
    const detail = record.detail
    const message = record.message
    return (
      (typeof error === 'string' ? error : '') ||
      (typeof detail === 'string' ? detail : '') ||
      (typeof message === 'string' ? message : '') ||
      fallback
    )
  }
  return fallback
}

export function mapDashboardOAuthStart(data: DashboardOAuthStartResponse) {
  const sessionId =
    typeof data.session_id === 'string' ? data.session_id : ''
  const deviceCode =
    (typeof data.device_code === 'string' ? data.device_code : '') || sessionId
  const verificationUrl =
    typeof data.verification_url === 'string' ? data.verification_url : ''
  const interval = data.interval
  const pollInterval = data.poll_interval

  return {
    device_code: deviceCode,
    user_code: typeof data.user_code === 'string' ? data.user_code : '',
    verification_uri_complete:
      (typeof data.verification_uri_complete === 'string'
        ? data.verification_uri_complete
        : '') || verificationUrl,
    verification_uri:
      (typeof data.verification_uri === 'string' ? data.verification_uri : '') ||
      verificationUrl,
    interval:
      typeof interval === 'number' && Number.isFinite(interval)
        ? interval
        : typeof pollInterval === 'number' && Number.isFinite(pollInterval)
          ? pollInterval
          : undefined,
    expires_in:
      typeof data.expires_in === 'number' && Number.isFinite(data.expires_in)
        ? data.expires_in
        : undefined,
  }
}
