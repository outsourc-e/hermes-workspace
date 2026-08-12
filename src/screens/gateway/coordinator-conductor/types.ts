import type {
  Mission,
  MissionNode,
  PreflightResult,
} from '@/server/mission-coordinator/types'

export type Evidence = MissionNode['evidence']
export type Event = {
  type: string
  payload: Record<string, unknown>
  createdAt: number
}

export type ListResponse = { ok: boolean; missions?: Array<Mission> }
export type Snapshot = {
  ok: boolean
  mission: Mission | null
  preflight: PreflightResult | null
  events: Array<Event>
  evidence: Array<{ nodeId: string; evidence: Evidence }>
}
export type MetricsResponse = {
  ok: boolean
  metrics: {
    total: number
    active: number
    completed: number
    failed: number
    byState: Record<string, number>
  }
}
export type SpawnResponse = {
  ok: boolean
  missionId?: string
  jobId?: string
  error?: string
  assignments?: Array<Record<string, unknown>>
}
