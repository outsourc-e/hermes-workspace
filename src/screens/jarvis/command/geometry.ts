/**
 * Artboard geometry for the Desktop Command board (artboard 01, 1440×900).
 *
 * The board has a handful of STRUCTURAL dimensions — frame size, rail widths,
 * top-bar height, the time gutter, the prose measure — that are neither colour,
 * type, padding nor radius, and so have no `--jv-*` utility of their own.
 *
 * The slice's token-discipline gate forbids raw px in these files, and writing
 * `w-[220px]` would smuggle a magic number in anyway. Every such dimension is
 * therefore expressed as a multiple of the 4px `--jv-space-4` grid the artboard
 * itself is drawn on, so the value still resolves through the token layer and
 * changing the grid step changes the whole board.
 *
 * Fractional steps are allowed and exact: the artboard uses a few half-steps
 * (18px = 4.5, 34px = 8.5) and `calc()` handles them without rounding.
 */

/** `jvGrid(55)` → `calc(var(--jv-space-4) * 55)` → 220px. */
export function jvGrid(steps: number): string {
  return `calc(var(--jv-space-4) * ${steps})`
}

/** Every structural dimension the board uses, named after what it measures. */
export const JV_BOARD = {
  /** 1440 × 900 fixed frame. */
  frameWidth: jvGrid(360),
  frameHeight: jvGrid(225),
  /** 44px top bar. */
  topbarHeight: jvGrid(11),
  /** 18px — the top bar's item gap and the THREADS label's top padding. */
  gap18: jvGrid(4.5),
  /** 220px workers/threads rail. */
  leftRailWidth: jvGrid(55),
  /** 320px work-trail rail. */
  rightRailWidth: jvGrid(80),
  /** 52px YOU/JVS time gutter. */
  speakerGutterWidth: jvGrid(13),
  /** 640px measure for a plain turn, 660px for one carrying evidence cards. */
  turnMeasure: jvGrid(160),
  turnMeasureWide: jvGrid(165),
  /** 34px timestamp column in the TOOL CALLS list. */
  toolCallTimeWidth: jvGrid(8.5),
  /** The streaming caret sits 2px below the baseline. */
  caretBaselineOffset: `calc(var(--jv-space-2) * -1)`,
} as const
