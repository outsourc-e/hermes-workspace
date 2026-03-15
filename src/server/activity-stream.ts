export type ActivityStreamStatus = 'connecting' | 'connected' | 'disconnected'

export type ActivityStreamDiagnostics = {
  status: ActivityStreamStatus
  connectedSinceMs: number | null
  lastDisconnectedAtMs: number | null
}

let lastDisconnectedAtMs: number | null = Date.now()

export function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
}

export function getActivityStreamStatus(): ActivityStreamStatus {
  return 'disconnected'
}

export function getActivityStreamDiagnostics(): ActivityStreamDiagnostics {
  return {
    status: 'disconnected',
    connectedSinceMs: null,
    lastDisconnectedAtMs,
  }
}

export function ensureActivityStreamStarted(): Promise<void> {
  return Promise.resolve()
}

export async function reconnectActivityStream(): Promise<void> {
  lastDisconnectedAtMs = Date.now()
}
