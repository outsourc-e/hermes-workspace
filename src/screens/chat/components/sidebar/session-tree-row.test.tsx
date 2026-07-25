// @vitest-environment jsdom

import React, { useMemo, useState } from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionTreeRow } from './session-tree-row'
import type {
  SessionMeta,
  SessionTreeRow as SessionTreeRowModel,
} from '../../types'

const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to: _to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode
    params?: { sessionKey?: string }
    to?: string
  }) => (
    <a href={`/chat/${params?.sessionKey ?? ''}`} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('@/components/ui/menu', () => ({
  MenuRoot: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MenuTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
  MenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MenuItem: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
}))

function session(key: string, title: string): SessionMeta {
  return { key, friendlyId: `${key}-route`, title }
}

function model(
  value: SessionMeta,
  overrides: Partial<SessionTreeRowModel> = {},
): SessionTreeRowModel {
  return {
    key: value.key,
    session: value,
    relationshipKind: 'root',
    depth: 0,
    isExpandable: false,
    isExpanded: false,
    childCount: 0,
    continuationCount: 1,
    isOrphan: false,
    ...overrides,
  }
}

function DisclosureHarness() {
  const [expanded, setExpanded] = useState(false)
  const root = model(session('root', 'Root'), {
    isExpandable: true,
    isExpanded: expanded,
    childCount: 1,
  })
  const child = model(session('child', 'Child'), {
    relationshipKind: 'child',
    depth: 1,
    parentKey: 'root',
  })
  const childrenByParent = useMemo(
    () => new Map<string, Array<SessionTreeRowModel>>([['root', [child]]]),
    [],
  )

  return (
    <div>
      <SessionTreeRow
        row={root}
        childrenByParent={childrenByParent}
        activeFriendlyId=""
        pinnedSessionKeys={new Set()}
        onToggleExpanded={(_key, nextExpanded) => setExpanded(nextExpanded)}
        onSelect={vi.fn()}
        onTogglePin={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    </div>
  )
}

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

const mountedRoots: Array<() => void> = []

function render(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(element))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return container
}

describe('SessionTreeRow disclosure', () => {
  it('uses a keyboard-focusable button with aria-expanded and aria-controls', () => {
    render(<DisclosureHarness />)

    const disclosure = screen.getByRole('button', {
      name: /Expand related sessions for root-route/i,
    })
    const controls = disclosure.getAttribute('aria-controls')

    expect(disclosure.tagName).toBe('BUTTON')
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(controls).toBeTruthy()
    expect(screen.queryByText('Child')).toBeNull()

    disclosure.focus()
    expect(document.activeElement).toBe(disclosure)
    fireEvent.keyDown(disclosure, { key: 'Enter' })
    React.act(() => fireEvent.click(disclosure))

    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(controls!)).toBeTruthy()
    expect(screen.getByText('Child')).toBeTruthy()
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.queryByRole('treeitem')).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('renders an already-expanded active path without another local interaction', () => {
    const root = model(session('root', 'Root'), {
      isExpandable: true,
      isExpanded: true,
      childCount: 1,
    })
    const child = model(session('active-child', 'Active child'), {
      relationshipKind: 'branch',
      depth: 1,
      parentKey: 'root',
    })

    render(
      <div>
        <SessionTreeRow
          row={root}
          childrenByParent={new Map([['root', [child]]])}
          activeFriendlyId="active-child-route"
          pinnedSessionKeys={new Set()}
          onToggleExpanded={vi.fn()}
          onSelect={vi.fn()}
          onTogglePin={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      </div>,
    )

    expect(screen.getByText('Active child')).toBeTruthy()
    expect(screen.getByText('Branch')).toBeTruthy()
  })

  it.each([
    ['branch', 'Branch · 3 segments'],
    ['child', 'Delegated session · 3 segments'],
  ] as const)(
    'keeps the %s identity label when its logical row has continuation segments',
    (relationshipKind, expectedLabel) => {
      const value = session(relationshipKind, `${relationshipKind} work`)
      const row = model(value, {
        relationshipKind,
        continuationCount: 3,
      })

      render(
        <SessionTreeRow
          row={row}
          childrenByParent={new Map()}
          activeFriendlyId=""
          pinnedSessionKeys={new Set()}
          onToggleExpanded={vi.fn()}
          onSelect={vi.fn()}
          onTogglePin={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />,
      )

      expect(screen.getByText(expectedLabel)).toBeTruthy()
      expect(screen.queryByText(/^Continued/)).toBeNull()
    },
  )
})
