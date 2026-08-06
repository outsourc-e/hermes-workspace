// @vitest-environment jsdom

import React from 'react'
import { screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chat-store'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function MountedCardStreams({ cardId }: { cardId: string }) {
  const runs = React.useSyncExternalStore(useChatStore.subscribe, () =>
    useChatStore.getState().cardStreamingRuns.get(cardId),
  )
  return (
    <div>
      {Array.from(runs?.values() ?? []).map((run) => (
        <output data-testid={`stream-${run.runId}`} key={run.runId}>
          {run.text}
        </output>
      ))}
    </div>
  )
}

let unmount: (() => void) | null = null

beforeEach(() => {
  window.localStorage.clear()
  useChatStore.setState({
    realtimeMessages: new Map(),
    streamingState: new Map(),
    cardStreamingRuns: new Map(),
  })
})

afterEach(() => {
  unmount?.()
  unmount = null
})

describe('mounted same-Card concurrent stream projection', () => {
  it('renders independent rows and removes only the completed immutable run', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => root.render(<MountedCardStreams cardId="remote:card" />))
    unmount = () => {
      React.act(() => root.unmount())
      container.remove()
    }

    React.act(() => {
      useChatStore.getState().processCardEvent('remote:card', {
        type: 'chunk',
        text: 'alpha live content',
        runId: 'run-alpha',
        sessionKey: 'remote:segment-alpha',
        transport: 'chat-events',
      })
      useChatStore.getState().processCardEvent('remote:card', {
        type: 'chunk',
        text: 'beta live content',
        runId: 'run-beta',
        sessionKey: 'remote:segment-beta',
        transport: 'chat-events',
      })
    })

    expect(screen.getByTestId('stream-run-alpha').textContent).toBe(
      'alpha live content',
    )
    expect(screen.getByTestId('stream-run-beta').textContent).toBe(
      'beta live content',
    )

    React.act(() => {
      useChatStore.getState().processCardEvent('remote:card', {
        type: 'done',
        state: 'complete',
        runId: 'run-alpha',
        sessionKey: 'remote:segment-alpha',
        transport: 'chat-events',
      })
    })

    expect(screen.queryByTestId('stream-run-alpha')).toBeNull()
    expect(screen.getByTestId('stream-run-beta').textContent).toBe(
      'beta live content',
    )
  })
})
