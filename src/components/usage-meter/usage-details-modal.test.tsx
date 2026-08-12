// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsageDetailsModal, buildUsageCsv } from './usage-details-modal'

vi.mock('@/components/ui/dialog', () => ({
  DialogClose: ({ children }: React.PropsWithChildren) => (
    <button>{children}</button>
  ),
  DialogDescription: ({ children }: React.PropsWithChildren) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

const usage = {
  inputTokens: 120,
  outputTokens: 30,
  contextPercent: 42,
  dailyCost: 0.004,
  models: [
    { model: 'gpt-4.1', inputTokens: 120, outputTokens: 30, costUsd: 0.004 },
  ],
  cards: [
    {
      cardId: 'card:operator-17',
      title: 'Customer launch plan',
      canonicalSource: 'remote' as const,
      state: 'running' as const,
      model: 'gpt-4.1',
      inputTokens: 120,
      outputTokens: 30,
      contextPercent: 42,
      costUsd: 0.004,
      updatedAt: 1_786_000_000_000,
    },
  ],
}

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function renderModal() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <UsageDetailsModal
        usage={usage}
        error={null}
        providerUsage={[]}
        providerError={null}
        providerUpdatedAt={null}
      />,
    )
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('UsageDetailsModal Card projection', () => {
  it('renders the Card display title instead of a raw session identity', () => {
    renderModal()

    React.act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    })

    expect(screen.getByText('Customer launch plan')).toBeTruthy()
    expect(document.body.textContent).not.toContain('card:operator-17')
    expect(screen.getByText('Remote · Running')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Session history')
    expect(document.body.textContent).not.toContain('raw-session-secret')
  })

  it('exports only Card-native identity columns', () => {
    const csv = buildUsageCsv(usage)

    expect(csv).toContain('Card Usage')
    expect(csv).toContain(
      'Card ID,Card Title,Canonical Source,State,Model,Input Tokens,Output Tokens,Context %,Cost (USD),Last Updated',
    )
    expect(csv).toContain(
      'card:operator-17,Customer launch plan,remote,running,gpt-4.1,120,30,42,0.0040',
    )
    expect(csv).not.toContain('Session History')
    expect(csv).not.toMatch(/(^|,)Session(,|$)/m)
    expect(csv).not.toContain('Segment')
    expect(csv).not.toContain('raw-session-secret')
  })

  it.each(['=1+1', '+SUM(1,2)', '-2+3', '@HYPERLINK("https://bad")'])(
    'neutralizes spreadsheet formulas that start with %s',
    (formula) => {
      const csv = buildUsageCsv({
        ...usage,
        models: [{ ...usage.models[0]!, model: formula }],
        cards: [{ ...usage.cards[0]!, title: `  ${formula}`, model: formula }],
      })

      expect(csv).toContain(`'${formula.replaceAll('"', '""')}`)
      expect(csv).toContain(`'  ${formula.replaceAll('"', '""')}`)
      expect(csv).not.toMatch(/(?:^|,)[ \t]*[=+\-@]/m)
    },
  )
})
