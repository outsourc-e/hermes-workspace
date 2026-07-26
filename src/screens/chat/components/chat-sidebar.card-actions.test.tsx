// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DesktopCardActionFailureNotice,
  useDesktopSessionCardActions,
} from './chat-sidebar'
import type { SessionCard } from '../types'

const cardQueryMocks = vi.hoisted(() => ({
  archiveSessionCard: vi.fn(),
  branchSessionCard: vi.fn(),
  updateSessionCardMetadata: vi.fn(),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string
    variant?: string
  }) => <button {...props} />,
  buttonVariants: () => '',
}))

vi.mock('../chat-queries', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  archiveSessionCard: cardQueryMocks.archiveSessionCard,
  branchSessionCard: cardQueryMocks.branchSessionCard,
  updateSessionCardMetadata: cardQueryMocks.updateSessionCardMetadata,
}))

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const activeCard: SessionCard = {
  cardId: 'card:active',
  title: 'Active Card',
  titleSource: 'manual',
  canonicalSegmentKey: 'remote:active',
  continuationSegmentKeys: ['remote:active'],
  continuationCount: 1,
  relationshipKind: 'root',
  childNodes: [],
  updatedAt: 10,
  archived: false,
  pinned: false,
}

type HarnessProps = {
  invalidateCards: () => Promise<unknown> | unknown
  navigateToCard: (cardId: string) => Promise<unknown> | unknown
  onActiveSessionDelete: () => void
}

function CardActionsHarness({
  invalidateCards,
  navigateToCard,
  onActiveSessionDelete,
}: HarnessProps) {
  const actions = useDesktopSessionCardActions({
    activeCardId: activeCard.cardId,
    invalidateCards,
    navigateToCard,
    onActiveSessionDelete,
  })

  return (
    <div>
      <button
        type="button"
        onClick={() => actions.rename(activeCard, 'Renamed')}
      >
        Rename action
      </button>
      <button type="button" onClick={() => actions.togglePin(activeCard)}>
        Pin action
      </button>
      <button type="button" onClick={() => actions.branch(activeCard)}>
        Branch action
      </button>
      <button type="button" onClick={() => actions.archive(activeCard)}>
        Archive action
      </button>
      <output data-testid="pending">
        {actions.pendingCardIds.has(activeCard.cardId) ? 'pending' : 'idle'}
      </output>
      {actions.failure ? (
        <DesktopCardActionFailureNotice
          failure={actions.failure}
          pending={actions.pendingCardIds.has(actions.failure.cardId)}
          onDismiss={actions.dismissFailure}
        />
      ) : null}
    </div>
  )
}

const mountedRoots: Array<() => void> = []

function renderHarness(overrides: Partial<HarnessProps> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const props: HarnessProps = {
    invalidateCards: vi.fn().mockResolvedValue(undefined),
    navigateToCard: vi.fn().mockResolvedValue(undefined),
    onActiveSessionDelete: vi.fn(),
    ...overrides,
  }
  React.act(() => root.render(<CardActionsHarness {...props} />))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return props
}

async function invoke(name: string) {
  await React.act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('desktop Session Card mutation failures', () => {
  it.each([
    ['Rename action', 'Rename', cardQueryMocks.updateSessionCardMetadata],
    ['Pin action', 'Pin', cardQueryMocks.updateSessionCardMetadata],
    ['Branch action', 'Branch', cardQueryMocks.branchSessionCard],
    ['Archive action', 'Archive', cardQueryMocks.archiveSessionCard],
  ])(
    'catches a failed %s, clears pending state, invalidates, and discloses retry UI',
    async (buttonName, actionLabel, mutation) => {
      mutation.mockRejectedValueOnce(new Error(`${actionLabel} request failed`))
      const props = renderHarness()

      await invoke(buttonName)

      expect(screen.getByTestId('pending').textContent).toBe('idle')
      expect(props.invalidateCards).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('alert').textContent).toContain(
        `${actionLabel} unavailable for “Active Card”.`,
      )
      const details = screen.getByText('Details').closest('details')
      expect(details?.open).toBe(false)
      React.act(() => fireEvent.click(screen.getByText('Details')))
      expect(details?.open).toBe(true)
      expect(screen.getByText(`${actionLabel} request failed`)).toBeTruthy()
      expect(
        screen.getByRole('button', {
          name: `Retry ${actionLabel.toLowerCase()} for Active Card`,
        }),
      ).toBeTruthy()
      expect(props.onActiveSessionDelete).not.toHaveBeenCalled()
      if (actionLabel === 'Branch') {
        expect(props.navigateToCard).not.toHaveBeenCalled()
      }
    },
  )

  it('retries the failed Card mutation and clears the unavailable state on success', async () => {
    cardQueryMocks.archiveSessionCard
      .mockRejectedValueOnce(new Error('Archive temporarily failed'))
      .mockResolvedValueOnce(undefined)
    const props = renderHarness()

    await invoke('Archive action')
    expect(screen.getByRole('alert')).toBeTruthy()

    await invoke('Retry archive for Active Card')

    expect(cardQueryMocks.archiveSessionCard).toHaveBeenCalledTimes(2)
    expect(props.invalidateCards).toHaveBeenCalledTimes(2)
    expect(props.onActiveSessionDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('pending').textContent).toBe('idle')
  })
})

describe('active Card archive ordering', () => {
  it('does not leave the active Card until archive succeeds', async () => {
    const events: Array<string> = []
    let resolveArchive: (() => void) | undefined
    cardQueryMocks.archiveSessionCard.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          events.push('archive:start')
          resolveArchive = () => {
            events.push('archive:success')
            resolve()
          }
        }),
    )
    const props = renderHarness({
      onActiveSessionDelete: vi.fn(() => events.push('active:leave')),
      invalidateCards: vi.fn(() => {
        events.push('cards:invalidate')
        return Promise.resolve()
      }),
    })

    await invoke('Archive action')

    expect(screen.getByTestId('pending').textContent).toBe('pending')
    expect(props.onActiveSessionDelete).not.toHaveBeenCalled()
    expect(events).toEqual(['archive:start'])

    await React.act(async () => {
      resolveArchive?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(events).toEqual([
      'archive:start',
      'archive:success',
      'active:leave',
      'cards:invalidate',
    ])
    expect(screen.getByTestId('pending').textContent).toBe('idle')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
