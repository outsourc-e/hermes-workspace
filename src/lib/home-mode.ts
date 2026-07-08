export type HomeModeLane =
  | 'morning_ramp_up'
  | 'work_block'
  | 'transition_home'
  | 'family_evening'
  | 'light_creative_planning'
  | 'late_night_danger_zone'
  | 'weekend_reset'
  | 'override_build_mode'

export type RecommendedIntensity =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'bounded'

export type CalendarSignal = {
  title?: string
  startsAt?: string
  endsAt?: string
  laneHint?: HomeModeLane
  busy?: boolean
}

export type HomeModePreferences = {
  timezone?: string
  location?: string
  workdayStartMinute?: number
  workdayEndMinute?: number
  rampStartMinute?: number
  rampEndMinute?: number
  transitionHomeStartMinute?: number
  transitionHomeEndMinute?: number
  eveningHomeEndMinute?: number
  lightCreativeEndMinute?: number
  defaultAfterWorkHomeProtection?: boolean
}

export type HomeModeInput = {
  now?: Date | string
  timezone?: string
  location?: string
  calendar?: Array<CalendarSignal>
  preferences?: HomeModePreferences
  explicitBuildMode?: boolean
}

export type HomeModeContext = {
  now_local: string
  timezone: string
  lane: HomeModeLane
  confidence: number
  reason: string
  suggested_boundary: string
  recommended_intensity: RecommendedIntensity
}

type LocalParts = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
  weekday: string
}

const DEFAULT_TIMEZONE = 'America/Chicago'
const DEFAULT_LOCATION = 'United States'

const DEFAULT_PREFERENCES = {
  workdayStartMinute: 8 * 60,
  workdayEndMinute: 17 * 60,
  rampStartMinute: 5 * 60,
  rampEndMinute: 6 * 60,
  transitionHomeStartMinute: 17 * 60,
  transitionHomeEndMinute: 18 * 60,
  eveningHomeEndMinute: 20 * 60 + 30,
  lightCreativeEndMinute: 22 * 60,
  defaultAfterWorkHomeProtection: true,
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}

function normalizeDate(now: Date | string | undefined): Date {
  if (!now) return new Date()
  if (now instanceof Date) return now
  return new Date(now)
}

function getLocalParts(now: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(now)

  const byType = parts.reduce<
    Partial<Record<Intl.DateTimeFormatPartTypes, string>>
  >((accumulator, part) => {
    if (part.type !== 'literal') {
      accumulator[part.type] = part.value
    }
    return accumulator
  }, {})

  return {
    year: byType.year ?? '0000',
    month: byType.month ?? '01',
    day: byType.day ?? '01',
    hour: byType.hour ?? '00',
    minute: byType.minute ?? '00',
    second: byType.second ?? '00',
    weekday: byType.weekday ?? 'Mon',
  }
}

function localIso(parts: LocalParts): string {
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

function minuteOfDay(parts: LocalParts): number {
  return Number(parts.hour) * 60 + Number(parts.minute)
}

function isWeekend(parts: LocalParts): boolean {
  return parts.weekday === 'Sat' || parts.weekday === 'Sun'
}

function calendarApplies(event: CalendarSignal, now: Date): boolean {
  if (!event.startsAt || !event.endsAt) return true
  const start = Date.parse(event.startsAt)
  const end = Date.parse(event.endsAt)
  const current = now.getTime()
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    current >= start &&
    current < end
  )
}

function findCurrentCalendarSignal(
  calendar: Array<CalendarSignal> | undefined,
  now: Date,
): CalendarSignal | null {
  if (!calendar?.length) return null
  return calendar.find((event) => calendarApplies(event, now)) ?? null
}

function calendarLane(event: CalendarSignal | null): HomeModeLane | null {
  if (!event) return null
  if (event.laneHint) return event.laneHint
  const title = event.title?.toLowerCase() ?? ''
  if (/\b(build|ship|deploy|incident|deadline|launch)\b/.test(title)) {
    return 'override_build_mode'
  }
  if (/\b(family|home|dinner|school|kid|kids)\b/.test(title)) {
    return 'family_evening'
  }
  if (/\b(plan|creative|write|sketch|brainstorm)\b/.test(title)) {
    return 'light_creative_planning'
  }
  if (/\b(work|meeting|client|shop|neon moon|mesquite)\b/.test(title)) {
    return 'work_block'
  }
  return null
}

function laneBoundary(lane: HomeModeLane): string {
  switch (lane) {
    case 'morning_ramp_up':
      return 'Start gentle: one short orientation, one must-do, then breakfast/body basics.'
    case 'work_block':
      return 'Use a defined work block with a visible stop point before home time.'
    case 'transition_home':
      return 'Close loops, park open tabs, and protect the handoff into home.'
    case 'family_evening':
      return 'Default to home/family presence; only urgent work gets a short, explicit box.'
    case 'light_creative_planning':
      return 'Keep it light: notes, sketches, planning, or one bounded polish pass.'
    case 'late_night_danger_zone':
      return 'No new rabbit holes; park the idea, choose sleep, and schedule tomorrow.'
    case 'weekend_reset':
      return 'Favor reset, family, chores, recovery, and only opt-in building.'
    case 'override_build_mode':
      return 'Build mode is explicit: define a cap, success condition, and shutdown ritual.'
  }
}

function laneIntensity(lane: HomeModeLane): RecommendedIntensity {
  switch (lane) {
    case 'morning_ramp_up':
      return 'low'
    case 'work_block':
      return 'high'
    case 'transition_home':
      return 'bounded'
    case 'family_evening':
      return 'none'
    case 'light_creative_planning':
      return 'low'
    case 'late_night_danger_zone':
      return 'none'
    case 'weekend_reset':
      return 'low'
    case 'override_build_mode':
      return 'bounded'
  }
}

export function classifyHomeMode(input: HomeModeInput = {}): HomeModeContext {
  const preferences = { ...DEFAULT_PREFERENCES, ...input.preferences }
  const timezone =
    input.timezone || input.preferences?.timezone || DEFAULT_TIMEZONE
  const location =
    input.location || input.preferences?.location || DEFAULT_LOCATION
  const now = normalizeDate(input.now)
  const local = getLocalParts(now, timezone)
  const minutes = minuteOfDay(local)
  const currentCalendar = findCurrentCalendarSignal(input.calendar, now)
  const hintedLane = calendarLane(currentCalendar)

  let lane: HomeModeLane
  let confidence = 0.82
  let reason = `Live local clock in ${timezone}`

  if (input.explicitBuildMode || hintedLane === 'override_build_mode') {
    lane = 'override_build_mode'
    confidence = input.explicitBuildMode ? 0.95 : 0.88
    reason = input.explicitBuildMode
      ? 'Taylor explicitly chose build mode.'
      : `Calendar context points at build mode: ${currentCalendar?.title ?? 'busy block'}.`
  } else if (hintedLane === 'family_evening') {
    lane = 'family_evening'
    confidence = 0.9
    reason = `Calendar context protects home/family time: ${currentCalendar?.title ?? 'busy block'}.`
  } else if (
    minutes >= preferences.lightCreativeEndMinute ||
    minutes < preferences.rampStartMinute
  ) {
    lane = 'late_night_danger_zone'
    confidence = 0.93
    reason = `It is ${local.hour}:${local.minute} in ${location}; this is the late-night guardrail window.`
  } else if (isWeekend(local) && !hintedLane) {
    lane = 'weekend_reset'
    confidence = 0.85
    reason = `${local.weekday} in ${location}; defaulting to weekend/reset unless build mode is explicit.`
  } else if (
    minutes >= preferences.rampStartMinute &&
    minutes < preferences.rampEndMinute
  ) {
    lane = 'morning_ramp_up'
    confidence = 0.9
    reason = `It is ${local.hour}:${local.minute} in ${location}; this is the gentle ramp-up window.`
  } else if (
    hintedLane === 'light_creative_planning' ||
    (minutes >= preferences.eveningHomeEndMinute &&
      minutes < preferences.lightCreativeEndMinute)
  ) {
    lane = 'light_creative_planning'
    confidence = hintedLane ? 0.88 : 0.84
    reason = hintedLane
      ? `Calendar context suggests light planning: ${currentCalendar?.title ?? 'calendar block'}.`
      : `It is ${local.hour}:${local.minute} in ${location}; evening work should stay light and bounded.`
  } else if (
    minutes >= preferences.transitionHomeStartMinute &&
    minutes < preferences.transitionHomeEndMinute
  ) {
    lane = 'transition_home'
    confidence = 0.86
    reason = `It is ${local.hour}:${local.minute} in ${location}; protect the work-to-home transition.`
  } else if (
    preferences.defaultAfterWorkHomeProtection &&
    minutes >= preferences.transitionHomeEndMinute &&
    minutes < preferences.eveningHomeEndMinute
  ) {
    lane = 'family_evening'
    confidence = 0.88
    reason = `It is ${local.hour}:${local.minute} in ${location}; after-work time defaults to home/family protection.`
  } else if (
    hintedLane === 'work_block' ||
    (minutes >= preferences.workdayStartMinute &&
      minutes < preferences.workdayEndMinute)
  ) {
    lane = 'work_block'
    confidence = hintedLane ? 0.86 : 0.82
    reason = hintedLane
      ? `Calendar context says work block: ${currentCalendar?.title ?? 'calendar block'}.`
      : `It is ${local.hour}:${local.minute} in ${location}; normal work block.`
  } else {
    lane = 'morning_ramp_up'
    confidence = 0.62
    reason = `It is ${local.hour}:${local.minute} in ${location}; no stronger lane matched, so keep the start gentle.`
  }

  return {
    now_local: localIso(local),
    timezone,
    lane,
    confidence: clampConfidence(confidence),
    reason,
    suggested_boundary: laneBoundary(lane),
    recommended_intensity: laneIntensity(lane),
  }
}
