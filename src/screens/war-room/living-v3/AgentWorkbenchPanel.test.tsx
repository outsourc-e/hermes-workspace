/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { AgentWorkbenchPanel } from './AgentWorkbenchPanel'
import type { LivingV3AgentDefinition } from '../../../lib/war-room/living-v3/living-v3-contract'
import type { LivingV3AgentSnapshot } from '../../../lib/war-room/living-v3/living-v3-runtime'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const agent: LivingV3AgentDefinition = {
  id: 'loki',
  label: 'Loki · Product Search',
  shortLabel: 'Loki',
  role: 'Search and evidence operator',
  persona: 'Finds candidates, shows proof, and never treats a visual match as supplier identity proof.',
  accent: '#86efac',
  home: { roomId: 'etsy-market-lab', point: { x: 100, y: 100 } },
  primaryStationIds: ['etsy-loki-product-hunt', 'etsy-loki-source-leads'],
  assetFolder: 'loki',
  portraitPath: '/loki.png',
  clips: {
    idle: { assetPath: '/idle.webp', frameCount: 8 },
    'walk-north': { assetPath: '/walk.webp', frameCount: 8 },
    'walk-south': { assetPath: '/walk.webp', frameCount: 8 },
    'walk-east': { assetPath: '/walk.webp', frameCount: 8 },
    'walk-west': { assetPath: '/walk.webp', frameCount: 8 },
    'walk-north-east': { assetPath: '/walk.webp', frameCount: 8 },
    'walk-north-west': { assetPath: '/walk.webp', frameCount: 8 },
    'walk-south-east': { assetPath: '/walk.webp', frameCount: 8 },
    'walk-south-west': { assetPath: '/walk.webp', frameCount: 8 },
    'work-standing': { assetPath: '/work.webp', frameCount: 8 },
    'talk-standing': { assetPath: '/talk.webp', frameCount: 8 },
    'carry-packet': { assetPath: '/carry.webp', frameCount: 8 },
    'wait-approval': { assetPath: '/approve.webp', frameCount: 8 },
    sit: { assetPath: '/sit.webp', frameCount: 8 },
    sleep: { assetPath: '/sleep.webp', frameCount: 8 },
  },
  visualStatus: 'norse-operator-runtime-final',
}

const snapshot: LivingV3AgentSnapshot = {
  agentId: 'loki',
  roomId: 'etsy-market-lab',
  world: { x: 100, y: 100 },
  roomPoint: { x: 10, y: 10 },
  activity: 'working',
  animationState: 'work-standing',
  direction: 'east',
  clipPath: '/work.webp',
  spriteFrameIndex: 1,
  spriteFrameCount: 8,
  badge: 'active-task',
  label: 'Comparing three verified shop studies',
  packetLabel: 'research-shop-1',
  navigation: {
    status: 'same-room',
    routeId: 'route-1',
    roomPath: ['etsy-market-lab'],
    bridgePath: [],
    doorIds: [],
    segmentLabel: 'At Product Search',
    waypointCount: 1,
    waypoints: [],
  },
}

it('renders a clear agent workbench and keeps advanced controls collapsed', async () => {
  const onAssignStation = vi.fn()
  const onDraftChange = vi.fn()
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault())
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await React.act(() => {
    root.render(
      <AgentWorkbenchPanel
        agent={agent}
        snapshot={snapshot}
        roomLabel="Etsy Market Lab"
        windowSizeLabel="640×720"
        messages={[
          { id: 'm1', from: 'agent', text: 'Evidence packet ready.' },
          { id: 'm2', from: 'operator', text: 'תראה לי את המקורות' },
        ]}
        draft=""
        stations={[
          { id: 'etsy-loki-product-hunt', label: 'Product Search' },
          { id: 'etsy-loki-source-leads', label: 'Source Leads' },
        ]}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        onAssignStation={onAssignStation}
        onRest={vi.fn()}
        onFitWindow={vi.fn()}
        onResetWindow={vi.fn()}
        onClose={vi.fn()}
        onBeginMove={vi.fn()}
        onBeginResize={vi.fn()}
      />,
    )
  })

  expect(container.querySelector('[data-agent-workbench-panel="v2"]')).toBeTruthy()
  expect(container.textContent).toContain('Loki · Product Search')
  expect(container.textContent).toContain('Comparing three verified shop studies')
  expect(container.textContent).toContain('research-shop-1')
  expect(container.textContent).toContain('Etsy Market Lab')
  expect(container.textContent).toContain('Recommended · Open & work')
  expect(container.querySelector('[data-agent-context-now="working"]')).toBeTruthy()
  expect(container.querySelector('details[data-agent-advanced-controls="collapsed"]')?.hasAttribute('open')).toBe(false)
  expect(container.querySelector('[data-agent-message-from="operator"]')?.getAttribute('dir')).toBe('rtl')

  const stationButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Product Search'))
  await React.act(() => stationButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(onAssignStation).toHaveBeenCalledWith('etsy-loki-product-hunt')

  const input = container.querySelector<HTMLInputElement>('[data-agent-message-input]')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await React.act(() => {
    setter?.call(input, 'New task')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(onDraftChange).toHaveBeenCalledWith('New task')

  await React.act(() => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(onSubmit).toHaveBeenCalledTimes(1)

  await React.act(() => root.unmount())
  document.body.removeChild(container)
})
