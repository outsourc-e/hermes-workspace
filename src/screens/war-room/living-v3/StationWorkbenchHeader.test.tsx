/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'

import { StationWorkbenchHeader } from './StationWorkbenchHeader'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('shows room, station role, and safety state without duplicating the root close action', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await React.act(() => {
    root.render(
      <StationWorkbenchHeader
        roomLabel="Olympus Command"
        stationLabel="Mission Control"
        role="Routes work to the correct room and operator"
        modeLabel="Command workbench"
        localOnly
        hasReadback
      />,
    )
  })

  expect(container.querySelector('[data-station-workbench-header="v2"]')).toBeTruthy()
  expect(container.textContent).toContain('Olympus Command')
  expect(container.textContent).toContain('Mission Control')
  expect(container.textContent).toContain('Local-only mode')
  expect(container.textContent).toContain('Readback ready')

  expect(container.querySelector('[data-close-station-workbench]')).toBeNull()

  await React.act(() => root.unmount())
  document.body.removeChild(container)
})
