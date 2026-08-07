// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MessageItem } from './message-item'
import type { ChatMessage } from '../types'

vi.mock('@/hooks/use-chat-settings', () => ({
  selectChatProfileAvatarDataUrl: (state: {
    profileAvatarDataUrl: string | null
  }) => state.profileAvatarDataUrl,
  selectChatProfileDisplayName: (state: { profileDisplayName: string }) =>
    state.profileDisplayName,
  selectAgentAvatarDataUrl: (state: { agentAvatarDataUrl: string | null }) =>
    state.agentAvatarDataUrl,
  selectAgentDisplayName: (state: { agentDisplayName: string }) =>
    state.agentDisplayName,
  useChatSettingsStore: (
    selector: (state: {
      profileAvatarDataUrl: string | null
      profileDisplayName: string
      agentAvatarDataUrl: string | null
      agentDisplayName: string
    }) => unknown,
  ) =>
    selector({
      profileAvatarDataUrl: null,
      profileDisplayName: 'You',
      agentAvatarDataUrl: null,
      agentDisplayName: 'Marty',
    }),
}))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  document.body.replaceChildren()
})

function renderMessage(role: 'user' | 'assistant', text: string) {
  const message: ChatMessage = {
    id: `${role}-collapsed-message`,
    role,
    content: [{ type: 'text', text }],
    timestamp: 1,
  } as ChatMessage
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(<MessageItem message={message} />)
  })
  mountedRoots.push(() => React.act(() => root.unmount()))
  return container
}

describe('MessageItem collapsed system messages', () => {
  it('collapses a context-compaction message even when it is stored as a user message', () => {
    const text = '[CONTEXT COMPACTION — REFERENCE ONLY]\nCompacted details'
    const container = renderMessage('user', text)

    const collapsedNotice = container.querySelector(
      '[data-chat-collapsed-message="context-compression"]',
    )
    expect(collapsedNotice).not.toBeNull()
    expect(collapsedNotice?.previousElementSibling).toMatchObject({
      tagName: 'IMG',
      alt: 'Marty',
    })
    expect(
      collapsedNotice?.parentElement?.getAttribute(
        'data-chat-collapsed-message-row',
      ),
    ).not.toBeNull()
    expect(collapsedNotice?.parentElement?.className).toContain('w-full')
    expect(collapsedNotice?.parentElement?.className).toContain(
      'grid-cols-[24px_minmax(0,1fr)]',
    )
    expect(collapsedNotice?.parentElement?.className).toContain('gap-x-2')
    expect(collapsedNotice?.parentElement?.className).toContain('md:gap-x-3')
    expect(collapsedNotice?.className).toContain('open:col-span-2')
    expect(collapsedNotice?.previousElementSibling?.className).toContain(
      'group-has-[details[open]]/collapsed-message-row:hidden',
    )
    expect(screen.getByText('🗜️ Context Compression Complete')).toBeTruthy()
    expect(
      container.querySelector('[data-chat-message-bubble="user"]'),
    ).toBeNull()
  })

  it('collapses a delegation completion message and expands its exact original content', () => {
    const text =
      '[ASYNC DELEGATION BATCH COMPLETE — delegation-42]\n  Delegated work output  '
    const container = renderMessage('assistant', text)

    const details = container.querySelector('details')
    expect(details?.open).toBe(false)
    expect(screen.getByText('Delegation delegation-42 Result')).toBeTruthy()

    React.act(() => {
      fireEvent.click(container.querySelector('summary')!)
    })

    expect(details?.open).toBe(true)
    expect(
      container.querySelector('[data-chat-collapsed-message-content]')?.textContent,
    ).toBe(text)
  })
})
