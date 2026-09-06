/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WidgetShell } from '../WidgetShell'

describe('WidgetShell', () => {
  it('renders children when state=loaded', () => {
    render(
      <WidgetShell state="loaded" title="Agents">
        <div data-testid="content">7 running</div>
      </WidgetShell>,
    )
    const content = screen.queryByTestId('content')
    expect(content).not.toBeNull()
    expect(content?.textContent).toContain('7 running')
  })

  it('shows skeleton when state=loading', () => {
    render(
      <WidgetShell state="loading" title="Agents">
        <div />
      </WidgetShell>,
    )
    expect(screen.queryByTestId('skeleton')).not.toBeNull()
  })

  it('shows last-known + stale badge when state=stale', () => {
    render(
      <WidgetShell state="stale" title="Agents" fetchedAt={Date.now() - 120000}>
        <div>7</div>
      </WidgetShell>,
    )
    const staleEl = screen.queryByText(/stale/i)
    expect(staleEl).not.toBeNull()
    expect(screen.queryByText('7')).not.toBeNull()
  })

  it('shows error badge when state=errored', () => {
    render(
      <WidgetShell
        state="errored"
        title="Agents"
        error={{ message: 'fetch failed' }}
      >
        <div>last known: 5</div>
      </WidgetShell>,
    )
    const errBtn = screen.queryByRole('button', { name: /error/i })
    expect(errBtn).not.toBeNull()
    const lastKnown = screen.queryByText('last known: 5')
    expect(lastKnown).not.toBeNull()
  })

  it('returns null when state=disabled', () => {
    const { container } = render(
      <WidgetShell state="disabled" title="Agents">
        <div />
      </WidgetShell>,
    )
    expect(container.firstChild).toBeNull()
  })
})
