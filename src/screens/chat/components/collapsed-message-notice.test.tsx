// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import {
  CollapsedMessageNotice,
  getCollapsedMessageNotice,
  rawTextForCollapseDetection,
} from './collapsed-message-notice'
import type { ChatMessage } from '../types'

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  document.body.replaceChildren()
})

function mount(text: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(<CollapsedMessageNotice text={text} />)
  })
  mountedRoots.push(() => React.act(() => root.unmount()))
  return container
}

describe('getCollapsedMessageNotice', () => {
  it('recognizes only the exact context-compaction message prefix', () => {
    expect(
      getCollapsedMessageNotice('[CONTEXT COMPACTION — REFERENCE ONLY]\nBody'),
    ).toEqual({
      kind: 'context-compression',
      label: '🗜️ Context Compression Complete',
    })
    expect(
      getCollapsedMessageNotice(' [CONTEXT COMPACTION — REFERENCE ONLY]\nBody'),
    ).toBeNull()
    expect(
      getCollapsedMessageNotice('[context compaction — reference only]\nBody'),
    ).toBeNull()
  })

  it('preserves raw message text when checking the prefix and rendering expanded content', () => {
    const text = ' [CONTEXT COMPACTION — REFERENCE ONLY]\n  Original details  '
    const rawText = rawTextForCollapseDetection({
      content: [{ type: 'text', text }],
    } as ChatMessage)

    expect(rawText).toBe(text)
    expect(getCollapsedMessageNotice(rawText)).toBeNull()
  })

  it('extracts a delegation identifier only from a complete delegation header', () => {
    expect(
      getCollapsedMessageNotice(
        '[ASYNC DELEGATION BATCH COMPLETE — batch_7f20]\nWorker output',
      ),
    ).toEqual({
      kind: 'delegation-result',
      label: 'Delegation batch_7f20 Result',
    })
    expect(
      getCollapsedMessageNotice(
        '[ASYNC DELEGATION BATCH COMPLETE —   ]\nWorker output',
      ),
    ).toBeNull()
    expect(
      getCollapsedMessageNotice(
        'prefix [ASYNC DELEGATION BATCH COMPLETE — batch_7f20]',
      ),
    ).toBeNull()
  })
})

describe('CollapsedMessageNotice', () => {
  it('starts collapsed and reveals the original message through its summary', () => {
    const text =
      '[ASYNC DELEGATION BATCH COMPLETE — batch_7f20]\nWorker result details'
    const container = mount(text)

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(details?.className).toContain('w-fit')
    expect(details?.className).toContain('open:w-full')
    expect(screen.getByText('Delegation batch_7f20 Result')).toBeTruthy()

    const summary = container.querySelector('summary')
    expect(summary).not.toBeNull()
    React.act(() => {
      fireEvent.click(summary!)
    })

    expect(details?.open).toBe(true)
    expect(container.textContent).toContain(text)
  })
})
