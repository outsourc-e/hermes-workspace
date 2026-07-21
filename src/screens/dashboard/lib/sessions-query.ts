export interface DashboardSessionsPayload {
  sessions?: Array<Record<string, unknown>>
  source?: string
  code?: string
  message?: string
}

export interface DashboardSessionsResult {
  sessions: Array<Record<string, unknown>>
  unavailable: boolean
  message?: string
}

export function normalizeDashboardSessionsPayload(
  data: DashboardSessionsPayload,
): DashboardSessionsResult {
  return {
    sessions: data.sessions ?? [],
    unavailable:
      data.source === 'unavailable' || data.code === 'capability_unavailable',
    message: typeof data.message === 'string' ? data.message : undefined,
  }
}
