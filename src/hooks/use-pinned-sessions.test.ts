import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  planLegacyPinMigration,
  writeSessionPin,
} from './use-pinned-sessions'
import type { SessionMeta } from '@/screens/chat/types'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('writeSessionPin', () => {
  it('PATCHes the shared sessions API with the durable pin value', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, pinned: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await writeSessionPin(
      {
        key: 'session-key',
        friendlyId: 'friendly-id',
      },
      true,
    )

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionKey: 'session-key',
        friendlyId: 'friendly-id',
        pinned: true,
      }),
    })
  })

  it('rejects a successful response that does not confirm persistence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(
      writeSessionPin(
        {
          key: 'session-key',
          friendlyId: 'friendly-id',
        },
        true,
      ),
    ).rejects.toThrow('did not confirm')
  })
})

describe('planLegacyPinMigration', () => {
  it('migrates resolvable backend pins while preserving missing and local keys', () => {
    const sessions: Array<SessionMeta> = [
      {
        key: 'already-pinned',
        friendlyId: 'already-pinned',
        pinned: true,
      },
      {
        key: 'candidate',
        friendlyId: 'candidate',
        pinned: false,
      },
      {
        key: 'local-session',
        friendlyId: 'local-session',
        source: 'local',
        pinned: false,
      },
    ]

    const plan = planLegacyPinMigration(
      ['already-pinned', 'candidate', 'local-session', 'not-loaded'],
      sessions,
    )

    expect(plan.candidates.map(({ legacyKey }) => legacyKey)).toEqual([
      'candidate',
    ])
    expect([...plan.unresolved]).toEqual([
      'candidate',
      'local-session',
      'not-loaded',
    ])
    expect([...plan.unattempted]).toEqual(['not-loaded'])
  })
})
