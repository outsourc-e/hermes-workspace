/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { HUDShell } from '../HUDShell'

// Vitest 3 + pnpm: ESM `import { X } from 'react'` resolves to a synthetic
// ESM wrapper, separate from the CJS react that react-dom uses, causing
// ReactCurrentDispatcher.current = null when hooks are called. Fix: redirect
// the ESM import to the CJS copy via vi.hoisted + vi.mock, unifying the instances.
const cjsReact = vi.hoisted(() => require('react'))
vi.mock('react', () => ({ ...cjsReact, default: cjsReact }))

// CustomisePanel uses React Query hooks; mock it so HUDShell tests stay isolated.
vi.mock('../CustomisePanel', () => ({ CustomisePanel: () => null }))

describe('HUDShell', () => {
  afterEach(() => cleanup())

  const slots = {
    brief: cjsReact.createElement('div', { 'data-testid': 'b' }, 'BRIEF'),
    bento: cjsReact.createElement('div', { 'data-testid': 'bn' }, 'BENTO'),
    timeline: cjsReact.createElement('div', { 'data-testid': 't' }, 'TL'),
    missionControl: cjsReact.createElement('div', { 'data-testid': 'm' }, 'MC'),
    inbox: cjsReact.createElement('div', { 'data-testid': 'i' }, 'IB'),
  }

  it('renders the topbar with HERMES · HUD brand', () => {
    render(cjsReact.createElement(HUDShell, slots))
    expect(screen.queryByText(/HERMES · HUD/)).not.toBeNull()
  })

  it('renders all 5 named regions', () => {
    render(cjsReact.createElement(HUDShell, slots))
    ;['brief', 'bento', 'timeline', 'mission-control', 'inbox'].forEach(
      (label) => {
        expect(screen.getByRole('region', { name: label })).toBeTruthy()
      },
    )
  })

  it('places provided children in correct slots', () => {
    render(cjsReact.createElement(HUDShell, slots))
    expect(screen.getByTestId('b')).toBeTruthy()
    expect(screen.getByTestId('bn')).toBeTruthy()
    expect(screen.getByTestId('t')).toBeTruthy()
    expect(screen.getByTestId('m')).toBeTruthy()
    expect(screen.getByTestId('i')).toBeTruthy()
  })

  it('renders a customise gear button in the topbar', () => {
    render(cjsReact.createElement(HUDShell, slots))
    expect(screen.getByRole('button', { name: /customise/i })).toBeTruthy()
  })
})
