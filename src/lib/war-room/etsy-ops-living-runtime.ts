import type {
  EtsyOpsAgentActivity,
  EtsyOpsAgentState,
  EtsyOpsAnimationClip,
  EtsyOpsAnimationManifest,
  EtsyOpsAnimationState,
  EtsyOpsDirection,
  EtsyOpsPoint,
  EtsyOpsStationId,
} from './etsy-ops-room-contract'

export type EtsyOpsAgentRuntimeSnapshot = {
  agentId: string
  stationId: EtsyOpsStationId
  targetStationId: EtsyOpsStationId
  x: number
  y: number
  activity: EtsyOpsAgentActivity
  direction: EtsyOpsDirection
  animationState: EtsyOpsAnimationState
  frameIndex: number
  frameCount: number
  spriteFrameIndex: number
  spriteFrameCount: number
  motionFrameIndex: number
  motionFrameCount: number
  motionPhase: number
  bodyBobPx: number
  bodyLeanDeg: number
  carryingPacket: string | null
  message: string
  loopProgress: number
  attention: 'none' | 'handoff' | 'approval' | 'blocked' | 'chat'
}

export type EtsyOpsRoomRuntimeSummary = {
  agentCount: number
  targetFramesPerAgent: number
  allExternalActionsLocked: true
  modelProfiles: Array<string>
  pendingFullGeneration: Array<string>
  styleLockRequired: boolean
}

const REQUIRED_MANIFEST_STATES: Array<EtsyOpsAnimationState> = [
  'idle',
  'walk-north',
  'walk-south',
  'walk-east',
  'walk-west',
  'walk-north-east',
  'walk-north-west',
  'walk-south-east',
  'walk-south-west',
  'carry-packet',
  'work-at-station',
  'talk-status',
  'wait-approval',
  'rest-or-blocked',
]

function clamp01(value: number) {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function smoothStep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function roundPct(value: number) {
  return Math.round(value * 100) / 100
}

function distance(a: EtsyOpsPoint, b: EtsyOpsPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

const ACTIVITY_DURATION_FACTOR: Record<EtsyOpsAgentActivity, number> = {
  idle: 1.45,
  walking: 1.85,
  working: 1.6,
  carrying: 1.95,
  talking: 1.7,
  'waiting-approval': 1.85,
  resting: 2.15,
  blocked: 1.85,
}

function durationForStep(agentId: string, stepId: string, durationMs: number, activity: EtsyOpsAgentActivity) {
  const variation = ((hashText(`${agentId}:${stepId}`) % 15) - 7) / 100
  return Math.max(1, Math.round(durationMs * ACTIVITY_DURATION_FACTOR[activity] * (1 + variation)))
}

export function directionBetweenPoints(from: EtsyOpsPoint, to: EtsyOpsPoint): EtsyOpsDirection {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return 'still'

  const horizontal = Math.abs(dx) > 0.05 ? (dx > 0 ? 'east' : 'west') : ''
  const vertical = Math.abs(dy) > 0.05 ? (dy > 0 ? 'south' : 'north') : ''
  if (horizontal && vertical) return `${vertical}-${horizontal}` as EtsyOpsDirection
  return (horizontal || vertical || 'still') as EtsyOpsDirection
}

export function animationStateFor(activity: EtsyOpsAgentActivity, direction: EtsyOpsDirection): EtsyOpsAnimationState {
  if (activity === 'resting' || activity === 'blocked') return 'rest-or-blocked'
  if (activity === 'waiting-approval') return 'wait-approval'
  if (activity === 'working') return 'work-at-station'
  if (activity === 'talking') return 'talk-status'
  if (activity === 'carrying') return 'carry-packet'
  if (activity === 'walking') {
    if (direction === 'north') return 'walk-north'
    if (direction === 'south') return 'walk-south'
    if (direction === 'east') return 'walk-east'
    if (direction === 'west') return 'walk-west'
    if (direction === 'north-east') return 'walk-north-east'
    if (direction === 'north-west') return 'walk-north-west'
    if (direction === 'south-east') return 'walk-south-east'
    if (direction === 'south-west') return 'walk-south-west'
  }
  return 'idle'
}

function clipForState(manifest: EtsyOpsAnimationManifest, state: EtsyOpsAnimationState): EtsyOpsAnimationClip | null {
  const exact = manifest.clips.find((clip) => clip.state === state && clip.frameCount > 0)
  if (exact) return exact
  const fallbackState = manifest.clips.find((clip) => clip.state === state)?.fallbackState
  const fallback = fallbackState
    ? manifest.clips.find((clip) => clip.state === fallbackState && clip.frameCount > 0)
    : null
  return fallback ?? manifest.clips.find((clip) => clip.state === 'idle' && clip.frameCount > 0) ?? null
}

function clipFrameMsFor(activity: EtsyOpsAgentActivity) {
  if (activity === 'walking' || activity === 'carrying') return 145
  if (activity === 'working') return 170
  if (activity === 'talking' || activity === 'waiting-approval') return 190
  return 240
}

function motionFrameFloorFor(activity: EtsyOpsAgentActivity) {
  if (activity === 'walking' || activity === 'carrying') return 48
  if (activity === 'working' || activity === 'waiting-approval') return 36
  if (activity === 'talking') return 32
  return 24
}

function waveFor(frameIndex: number, frameCount: number) {
  if (frameCount <= 1) return 0
  return Math.sin((frameIndex / frameCount) * Math.PI * 2)
}

function bodyBobFor(activity: EtsyOpsAgentActivity, phaseWave: number) {
  if (activity === 'walking') return roundPct(Math.abs(phaseWave) * -2.4)
  if (activity === 'carrying') return roundPct(Math.abs(phaseWave) * -1.8)
  if (activity === 'working') return roundPct(phaseWave * -0.9)
  if (activity === 'talking') return roundPct(phaseWave * -0.7)
  if (activity === 'waiting-approval') return roundPct(phaseWave * -0.5)
  return roundPct(phaseWave * -0.35)
}

function bodyLeanFor(activity: EtsyOpsAgentActivity, direction: EtsyOpsDirection, phaseWave: number) {
  void activity
  void direction
  void phaseWave
  return 0
}

function buildTravelPath(from: EtsyOpsPoint, step: { point: EtsyOpsPoint; path?: Array<EtsyOpsPoint> }) {
  const points = [from, ...(step.path ?? []), step.point]
  return points.filter((point, index) => {
    if (index === 0) return true
    return distance(points[index - 1], point) > 0.05
  })
}

function interpolateTravelPath(points: Array<EtsyOpsPoint>, progress: number) {
  if (points.length <= 1) {
    const point = points[0] ?? { x: 50, y: 50 }
    return { point, from: point, to: point }
  }

  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: distance(points[index], point),
  }))
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  if (totalLength <= 0) {
    const point = points[points.length - 1]
    return { point, from: point, to: point }
  }

  let remaining = clamp01(progress) * totalLength
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const segmentProgress = segment.length <= 0 ? 1 : remaining / segment.length
      return {
        point: {
          x: segment.from.x + (segment.to.x - segment.from.x) * segmentProgress,
          y: segment.from.y + (segment.to.y - segment.from.y) * segmentProgress,
        },
        from: segment.from,
        to: segment.to,
      }
    }
    remaining -= segment.length
  }

  const last = segments[segments.length - 1]
  return { point: last.to, from: last.from, to: last.to }
}

function attentionFor(activity: EtsyOpsAgentActivity, stationId: EtsyOpsStationId): EtsyOpsAgentRuntimeSnapshot['attention'] {
  if (activity === 'blocked') return 'blocked'
  if (activity === 'waiting-approval' || stationId === 'dlv-approval') return 'approval'
  if (activity === 'talking') return 'chat'
  if (activity === 'carrying') return 'handoff'
  return 'none'
}

export function buildAgentRuntimeSnapshot(agent: EtsyOpsAgentState, elapsedMs: number): EtsyOpsAgentRuntimeSnapshot {
  const route = agent.route.length ? agent.route : [{
    id: `${agent.id}-home`,
    label: 'Home',
    stationId: agent.homeStationId,
    point: { x: 50, y: 50 },
    durationMs: 10_000,
    activity: 'idle' as const,
    carryingPacket: null,
    message: agent.speech,
  }]
  const stepDurations = route.map((step) => durationForStep(agent.id, step.id, step.durationMs, step.activity))
  const totalDuration = stepDurations.reduce((sum, duration) => sum + duration, 0)
  const phaseOffsetMs = hashText(agent.id) % totalDuration
  const loopMs = (((elapsedMs + phaseOffsetMs) % totalDuration) + totalDuration) % totalDuration
  let cursor = 0
  let stepIndex = 0

  for (let index = 0; index < route.length; index += 1) {
    const nextCursor = cursor + stepDurations[index]
    if (loopMs < nextCursor) {
      stepIndex = index
      break
    }
    cursor = nextCursor
  }

  const step = route[stepIndex]
  const previousStep = route[(stepIndex - 1 + route.length) % route.length]
  const rawProgress = (loopMs - cursor) / stepDurations[stepIndex]
  const travelProgress = smoothStep(rawProgress)
  const isMoving = step.activity === 'walking' || step.activity === 'carrying'
  const travelPath = buildTravelPath(previousStep.point, step)
  const travel = isMoving ? interpolateTravelPath(travelPath, travelProgress) : { point: step.point, from: step.point, to: step.point }
  const from = travel.from
  const to = travel.to
  const x = travel.point.x
  const y = travel.point.y
  const direction = isMoving
    ? directionBetweenPoints(from, to)
    : (step.directionHint ?? directionBetweenPoints(previousStep.point, step.point))
  const animationState = animationStateFor(step.activity, direction)
  const clip = clipForState(agent.animation, animationState)
  const spriteFrameCount = Math.max(1, clip?.frameCount ?? 1)
  const motionFrameCount = Math.max(clip?.motionFrameCount ?? 0, motionFrameFloorFor(step.activity))
  const motionFrameIndex = Math.floor(((elapsedMs + hashText(`${agent.id}:${step.id}:motion`)) / 75) % motionFrameCount)
  const spriteFrameIndex = Math.floor(((elapsedMs + hashText(`${agent.id}:${step.id}:sprite`)) / clipFrameMsFor(step.activity)) % spriteFrameCount)
  const motionPhase = roundPct(motionFrameCount <= 1 ? 0 : motionFrameIndex / (motionFrameCount - 1))
  const phaseWave = waveFor(motionFrameIndex, motionFrameCount)
  const effectiveActivity = distance(from, to) < 0.05 && isMoving ? 'idle' : step.activity

  return {
    agentId: agent.id,
    stationId: previousStep.stationId,
    targetStationId: step.stationId,
    x: roundPct(x),
    y: roundPct(y),
    activity: effectiveActivity,
    direction,
    animationState,
    frameIndex: motionFrameIndex,
    frameCount: motionFrameCount,
    spriteFrameIndex,
    spriteFrameCount,
    motionFrameIndex,
    motionFrameCount,
    motionPhase,
    bodyBobPx: bodyBobFor(effectiveActivity, phaseWave),
    bodyLeanDeg: bodyLeanFor(effectiveActivity, direction, phaseWave),
    carryingPacket: step.carryingPacket,
    message: step.message,
    loopProgress: roundPct(loopMs / totalDuration),
    attention: attentionFor(step.activity, step.stationId),
  }
}

export function buildAgentRuntimeSnapshots(agents: Array<EtsyOpsAgentState>, elapsedMs: number) {
  return separateAgentCollisions(agents.map((agent) => buildAgentRuntimeSnapshot(agent, elapsedMs)))
}

export function separateAgentCollisions(snapshots: Array<EtsyOpsAgentRuntimeSnapshot>) {
  const separated = snapshots.map((snapshot) => ({ ...snapshot }))
  const minimumDistance = 3.2

  for (let pass = 0; pass < 2; pass += 1) {
    for (let leftIndex = 0; leftIndex < separated.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < separated.length; rightIndex += 1) {
        const left = separated[leftIndex]
        const right = separated[rightIndex]
        const dx = right.x - left.x
        const dy = right.y - left.y
        const currentDistance = Math.hypot(dx, dy)
        if (currentDistance >= minimumDistance) continue

        const angle = currentDistance > 0.01
          ? Math.atan2(dy, dx)
          : ((hashText(`${left.agentId}:${right.agentId}`) % 360) * Math.PI) / 180
        const push = (minimumDistance - currentDistance + 0.4) / 2
        const ox = Math.cos(angle) * push
        const oy = Math.sin(angle) * push

        left.x = roundPct(clamp(left.x - ox, 4, 96))
        left.y = roundPct(clamp(left.y - oy, 4, 118))
        right.x = roundPct(clamp(right.x + ox, 4, 96))
        right.y = roundPct(clamp(right.y + oy, 4, 118))
      }
    }
  }

  return separated
}

export function validateAnimationManifest(manifest: EtsyOpsAnimationManifest) {
  const errors: Array<string> = []
  const warnings: Array<string> = []
  if (manifest.targetFrames < 96) errors.push(`${manifest.id} targetFrames must be at least 96.`)
  for (const state of REQUIRED_MANIFEST_STATES) {
    if (!manifest.clips.some((clip) => clip.state === state)) {
      errors.push(`${manifest.id} is missing required animation state ${state}.`)
    }
  }
  for (const clip of manifest.clips) {
    if (clip.motionFrameCount < motionFrameFloorFor(clip.state.startsWith('walk-') ? 'walking' : clip.state === 'carry-packet' ? 'carrying' : clip.state === 'work-at-station' ? 'working' : clip.state === 'talk-status' ? 'talking' : clip.state === 'wait-approval' ? 'waiting-approval' : 'idle')) {
      errors.push(`${manifest.id}:${clip.state} motionFrameCount is too low for professional playback.`)
    }
    if (clip.runtime !== 'pending-generation' && clip.assetPath && clip.frameCount <= 0) {
      errors.push(`${manifest.id}:${clip.state} must declare source frames for ${clip.assetPath}.`)
    }
  }
  if (manifest.availableFrames < manifest.targetFrames) {
    warnings.push(`${manifest.id} has ${manifest.availableFrames}/${manifest.targetFrames} frames available; full generation is still pending.`)
  }
  if (manifest.qa.requiresStyleLockApproval && manifest.status !== 'runtime-ready') {
    warnings.push(`${manifest.id} is a style-lock candidate, not a final sprite atlas.`)
  }
  return { ok: errors.length === 0, errors, warnings }
}

export function buildRuntimeSummary(agents: Array<EtsyOpsAgentState>): EtsyOpsRoomRuntimeSummary {
  return {
    agentCount: agents.length,
    targetFramesPerAgent: Math.max(...agents.map((agent) => agent.animation.targetFrames), 0),
    allExternalActionsLocked: true,
    modelProfiles: Array.from(new Set(agents.map((agent) => agent.modelProfileId))),
    pendingFullGeneration: agents
      .filter((agent) => agent.animation.status !== 'runtime-ready')
      .map((agent) => agent.id),
    styleLockRequired: agents.some((agent) => agent.animation.qa.requiresStyleLockApproval),
  }
}
