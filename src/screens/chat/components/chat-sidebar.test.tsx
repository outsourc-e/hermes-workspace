// @vitest-environment jsdom

import React, { useState } from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DesktopSidebarResizeHandle } from './chat-sidebar'
import {
  DEFAULT_DESKTOP_SIDEBAR_WIDTH,
  MAX_DESKTOP_SIDEBAR_WIDTH,
  MIN_DESKTOP_SIDEBAR_WIDTH,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

type HarnessProps = {
  collapsed?: boolean
  mobile?: boolean
}

function ResizeHarness({ collapsed = false, mobile = false }: HarnessProps) {
  const [width, setWidth] = useState(DEFAULT_DESKTOP_SIDEBAR_WIDTH)
  const [resizing, setResizing] = useState(false)

  return (
    <aside
      data-testid="sidebar"
      data-resizing={resizing ? 'true' : 'false'}
      style={{ width }}
    >
      <DesktopSidebarResizeHandle
        enabled={!collapsed && !mobile}
        width={width}
        onWidthChange={(desktopSidebarWidth) => {
          setWidth(desktopSidebarWidth)
          useChatSettingsStore
            .getState()
            .updateSettings({ desktopSidebarWidth })
        }}
        onResizingChange={setResizing}
      />
    </aside>
  )
}

const mountedRoots: Array<() => void> = []

function renderHarness(props: HarnessProps = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(<ResizeHarness {...props} />))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return {
    rerender(nextProps: HarnessProps) {
      React.act(() => root.render(<ResizeHarness {...nextProps} />))
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useChatSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      desktopSidebarWidth: DEFAULT_DESKTOP_SIDEBAR_WIDTH,
    },
  }))
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})

describe('desktop session sidebar resize handle', () => {
  it('exposes separator values and supports bounded keyboard resizing', () => {
    renderHarness()
    const separator = screen.getByRole('separator', {
      name: 'Resize sessions sidebar',
    })

    expect(separator.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator.getAttribute('aria-valuemin')).toBe(
      String(MIN_DESKTOP_SIDEBAR_WIDTH),
    )
    expect(separator.getAttribute('aria-valuemax')).toBe(
      String(MAX_DESKTOP_SIDEBAR_WIDTH),
    )
    expect(separator.getAttribute('aria-valuenow')).toBe(
      String(DEFAULT_DESKTOP_SIDEBAR_WIDTH),
    )

    React.act(() => fireEvent.keyDown(separator, { key: 'ArrowRight' }))
    expect(screen.getByTestId('sidebar').style.width).toBe(
      `${DEFAULT_DESKTOP_SIDEBAR_WIDTH + 16}px`,
    )

    React.act(() => fireEvent.keyDown(separator, { key: 'ArrowLeft' }))
    expect(separator.getAttribute('aria-valuenow')).toBe(
      String(DEFAULT_DESKTOP_SIDEBAR_WIDTH),
    )

    React.act(() => fireEvent.keyDown(separator, { key: 'Home' }))
    expect(separator.getAttribute('aria-valuenow')).toBe(
      String(MIN_DESKTOP_SIDEBAR_WIDTH),
    )

    React.act(() => fireEvent.keyDown(separator, { key: 'End' }))
    expect(separator.getAttribute('aria-valuenow')).toBe(
      String(MAX_DESKTOP_SIDEBAR_WIDTH),
    )
  })

  it('clamps pointer dragging, persists it, and restores document selection state', () => {
    renderHarness()
    const separator = screen.getByRole('separator', {
      name: 'Resize sessions sidebar',
    })
    const sidebar = screen.getByTestId('sidebar')
    Object.defineProperty(sidebar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 100 }),
    })

    React.act(() =>
      fireEvent.pointerDown(separator, {
        button: 0,
        clientX: 400,
        pointerId: 7,
      }),
    )
    expect(sidebar.getAttribute('data-resizing')).toBe('true')
    expect(document.body.style.userSelect).toBe('none')

    React.act(() =>
      fireEvent.pointerMove(window, { clientX: 1000, pointerId: 7 }),
    )
    expect(sidebar.style.width).toBe(`${MAX_DESKTOP_SIDEBAR_WIDTH}px`)

    React.act(() => fireEvent.pointerUp(window, { pointerId: 7 }))
    expect(sidebar.getAttribute('data-resizing')).toBe('false')
    expect(document.body.style.userSelect).toBe('')
    expect(
      JSON.parse(localStorage.getItem('chat-settings') ?? '{}'),
    ).toMatchObject({
      state: {
        settings: { desktopSidebarWidth: MAX_DESKTOP_SIDEBAR_WIDTH },
      },
    })
  })

  it('removes the control and safely stops dragging when collapsed or mobile', () => {
    const view = renderHarness()
    const separator = screen.getByRole('separator')

    React.act(() =>
      fireEvent.pointerDown(separator, { button: 0, pointerId: 9 }),
    )
    expect(document.body.style.userSelect).toBe('none')

    view.rerender({ collapsed: true })
    expect(screen.queryByRole('separator')).toBeNull()
    expect(document.body.style.userSelect).toBe('')

    React.act(() =>
      fireEvent.pointerMove(window, { clientX: 500, pointerId: 9 }),
    )
    view.rerender({})
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
      String(DEFAULT_DESKTOP_SIDEBAR_WIDTH),
    )

    view.rerender({ mobile: true })
    expect(screen.queryByRole('separator')).toBeNull()
  })
})
