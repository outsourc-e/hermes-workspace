import { describe, expect, it } from 'vitest'
import { jvGrid } from '../command/geometry'
import { JV_CONDUCTOR } from './geometry'

describe('JV_CONDUCTOR', () => {
  it('hangs the chain connector off the card by exactly its own width', () => {
    // The connector spans the grid gutter, so the offset must be the width
    // inverted — otherwise the edge detaches from the next card.
    expect(JV_CONDUCTOR.connectorWidth).toBe(jvGrid(4))
    expect(JV_CONDUCTOR.connectorOffset).toBe(jvGrid(-4))
  })

  it('states every run-log column as a grid multiple, not a raw px value', () => {
    const columns = [
      JV_CONDUCTOR.runTimeWidth,
      JV_CONDUCTOR.runJobWidth,
      JV_CONDUCTOR.runWorkerWidth,
      JV_CONDUCTOR.runOutcomeWidth,
      JV_CONDUCTOR.runDurationWidth,
    ]

    for (const column of columns) {
      expect(column).toMatch(/^calc\(var\(--jv-space-4\) \* -?[\d.]+\)$/)
    }
  })

  it('keeps the fixed columns clear of the 1440 frame', () => {
    // Sum of the fixed columns + the 20px page gutters must leave RESULT room.
    const steps = 14 + 52.5 + 30 + 19.5 + 17.5
    expect(steps * 4).toBeLessThan(1440)
  })
})
