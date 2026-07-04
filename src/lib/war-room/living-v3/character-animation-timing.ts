// Workspace character animation timing — DLV approved
export const CHARACTER_ANIMATION_TIMING = {
  // 8-frame animations
  framesPerState: 8,

  // Per-frame duration in ms
  frameDurationMs: {
    portrait: 220, // ~4.5 fps — almost static
    idle: 170, // ~5.9 fps — calm breathing/blink
    wave: 120, // ~8.3 fps — greeting gesture
    talk_standing: 140, // ~7.1 fps — active but not frantic
    sleep_rest: 240, // ~4.2 fps — slow/resting

    walk_south: 90, // ~11.1 fps
    walk_east: 90,
    walk_north: 90,
    walk_west: 90,
    walk_southeast: 90,
    walk_northeast: 90,
    walk_northwest: 90,
    walk_southwest: 90,
  },

  // Movement speed for walking states only
  movement: {
    spriteWidthsPerSecond: 0.7,
    acceptableRange: [0.6, 0.8],
    examplePxPerSecondAt128pxSprite: 90,
  },
} as const

export const CHARACTER_WALK_PX_PER_SECOND = CHARACTER_ANIMATION_TIMING.movement.examplePxPerSecondAt128pxSprite

export function livingV3TravelDurationForDistance(distancePx: number, bounds: { minMs?: number; maxMs?: number } = {}) {
  const minMs = bounds.minMs ?? 1_400
  const maxMs = bounds.maxMs ?? 18_000
  const rawMs = (Math.max(0, distancePx) / CHARACTER_WALK_PX_PER_SECOND) * 1_000
  return Math.round(Math.max(minMs, Math.min(maxMs, rawMs)))
}
