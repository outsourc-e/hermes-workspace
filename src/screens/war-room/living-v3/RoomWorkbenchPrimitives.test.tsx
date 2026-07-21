/** @vitest-environment jsdom */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  RoomWorkbenchCommandTable,
  RoomWorkbenchGauge,
  RoomWorkbenchKpiCard,
  RoomWorkbenchPillRow,
  RoomWorkbenchProofDetails,
} from './RoomWorkbenchPrimitives'

describe('RoomWorkbenchPrimitives', () => {
  it('renders reusable visual workbench primitives with visible hierarchy and collapsed proof', () => {
    const { container } = render(
      <div>
        <RoomWorkbenchKpiCard label="DB rows" value="80 runs" note="Supabase readback" tone="good" />
        <RoomWorkbenchGauge label="stores ready" value={4} max={5} tone="warn" note="one source needs proof" />
        <RoomWorkbenchPillRow items={['DB logged', 'No live sends', 'Executors locked']} tone="locked" />
        <RoomWorkbenchCommandTable
          title="Pipeline command table"
          rows={[
            { id: 'approval', label: 'Approval', value: '4 waiting', status: 'Needs OK', next: 'Open drawer', tone: 'warn' },
          ]}
        />
        <RoomWorkbenchProofDetails>
          <p>Source proof stays collapsed by default.</p>
        </RoomWorkbenchProofDetails>
      </div>,
    )

    expect(container.textContent).toContain('DB rows')
    expect(container.textContent).toContain('80 runs')
    expect(container.textContent).toContain('stores ready')
    expect(container.textContent).toContain('Pipeline command table')
    expect(container.textContent).toContain('Needs OK')
    expect(container.querySelector('[data-proof-collapsed="true"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-workbench-tone]').length).toBeGreaterThanOrEqual(4)
  })
})
