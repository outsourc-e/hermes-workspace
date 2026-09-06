export type WidgetState =
  | 'loaded'
  | 'loading'
  | 'stale'
  | 'errored'
  | 'disabled'

export type WidgetId =
  | 'brief'
  | 'up-next'
  | 'recovery'
  | 'next-deadline'
  | 'tomorrow'
  | 'timeline'
  | 'agents'
  | 'jobs'
  | 'sessions'
  | 'vm-health'
  | 'prs'
  | 'ci'
  | 'sms'
  | 'telegram'
  | 'plaud'
  | 'cliniko'
  | 'errors'
  | 'calendar-feeds'
  | 'inbox'

export interface WidgetSnapshot<T = unknown> {
  id: WidgetId
  state: WidgetState
  data: T | null
  fetchedAt: number // unix ms
  ttlMs: number // how long this snapshot stays "loaded" before going stale
  error?: { message: string; code?: string }
}

export interface HUDSnapshot {
  generatedAt: number
  widgets: Record<WidgetId, WidgetSnapshot>
}

export interface HUDConfig {
  widgets: Record<string, boolean> // widget-id → enabled
  mc_tile_order?: Array<WidgetId> // user-reordered MC tiles
  inbox_severity_overrides?: {
    starred_sms_contacts?: Array<string> // phone numbers → urgent
  }
  dismissed_inbox_items?: Record<string, number> // item-key → dismissed-until (unix ms)
  deadline_attendance?: Record<string, { status: string; updated_at: number }> // deadline-id → user-confirmed outcome
  mobile_tiles?: Array<WidgetId> // subset shown on mobile
}
