/**
 * Artboard geometry for the Desktop Conductor board (artboard 02, 1440×900).
 *
 * Companion to `../command/geometry.ts`, which owns the shared frame and the
 * `jvGrid()` helper this file re-uses. Everything here is Conductor-only — the
 * run-log column widths and the chain connector — so it lives beside the board
 * rather than widening the Command board's module.
 *
 * Same rule as there: a structural dimension is expressed as a multiple of the
 * 4px `--jv-space-4` grid, never as a raw `w-[..px]`. Fractional steps are
 * exact — the run log's 210px JOB column is 52.5 steps and `calc()` handles it.
 */
import { jvGrid } from '../command/geometry'

/** Conductor-only structural dimensions, named after what they measure. */
export const JV_CONDUCTOR = {
  /**
   * The chain edge between two worker cards: 16px, which is exactly the grid
   * gap, so the connector spans the gutter and the negative offset that hangs
   * it off the card's right edge is the same measure inverted.
   */
  connectorWidth: jvGrid(4),
  connectorOffset: jvGrid(-4),

  /* Run-log columns. RESULT is the flexible one and takes what is left. */
  /** 56px TIME. */
  runTimeWidth: jvGrid(14),
  /** 210px JOB. */
  runJobWidth: jvGrid(52.5),
  /** 120px WORKER. */
  runWorkerWidth: jvGrid(30),
  /** 78px OUTCOME, right-aligned. */
  runOutcomeWidth: jvGrid(19.5),
  /** 70px DURATION, right-aligned. */
  runDurationWidth: jvGrid(17.5),
} as const
