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
 *
 * Slice 5 adds two things here. `jvRule()` — the grid step PLUS the hairline a
 * bordered edge eats under `box-sizing: border-box` — and `JV_MOBILE`, the
 * 390 × 844 frame artboards 03 and 04 are drawn on. Both boards share this
 * module the same way they already share `JV_BOARD`.
 */

/** `jvGrid(55)` → `calc(var(--jv-space-4) * 55)` → 220px. */
export function jvGrid(steps: number): string {
  return `calc(var(--jv-space-4) * ${steps})`
}

/**
 * `jvGrid(steps)` plus one hairline — for a box whose artboard height is
 * measured to the OUTSIDE of a 1px border.
 *
 * Every board here is `box-sizing: border-box`, so a `border-b` is subtracted
 * from `height` rather than added to it: `height: jvGrid(11)` on a bar with a
 * bottom rule leaves 43px of content under a 44px measurement. `jvRule(11)`
 * asks for 44px of content and a rule beneath it, which is what the artboard
 * actually draws. The hairline is `--jv-space-1`, the same token the border
 * itself resolves to, so it is still a value from the grid and not a fudge.
 */
export function jvRule(steps: number): string {
  return `calc(var(--jv-space-4) * ${steps} + var(--jv-space-1))`
}

/** Every structural dimension the board uses, named after what it measures. */
export const JV_BOARD = {
  /** 1440 × 900 fixed frame. */
  frameWidth: jvGrid(360),
  frameHeight: jvGrid(225),
  /**
   * The top bar: 44px of content under its 1px bottom rule.
   *
   * Was `jvGrid(11)`, which under `border-box` spent one of those 44px on the
   * rule and left the bar 43px tall — so every row beneath it on BOTH desktop
   * boards sat a pixel high. `jvRule(11)` restores the artboard's measurement.
   */
  topbarHeight: jvRule(11),
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

/**
 * The mobile frame (artboards 03 and 04, 390 × 844).
 *
 * Only the frame and its status bar are fixed. Mobile is a single fluid
 * column, so every other dimension on those boards is flow or a `--jv-space-*`
 * padding — there is nothing else worth pinning to the grid, and pinning more
 * would fight the "fills the viewport width" requirement.
 */
export const JV_MOBILE = {
  /** 390px — the artboard width, used as a MAX so a narrower phone still fills. */
  frameWidth: jvGrid(97.5),
  /** 844px — the artboard height, used as a MIN so the column can grow. */
  frameHeight: jvGrid(211),
  /** 44px status bar over its 1px rule — same measurement as the desktop bar. */
  statusBarHeight: jvRule(11),
  /** 36px timestamp column in the LAST NIGHT list. */
  runTimeWidth: jvGrid(9),
} as const
