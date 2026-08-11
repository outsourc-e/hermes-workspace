import { beforeEach, describe, expect, it } from 'vitest'

import { clearRuntimeRouteSnapshot, readRuntimeRouteSnapshot, writeRuntimeRouteSnapshot } from './runtime-route-cache'

describe('runtime route snapshot', () => {
  beforeEach(() => clearRuntimeRouteSnapshot())

  it('keeps a bounded defensive snapshot of currently available subscription routes', () => {
    const input = [
      { id: 'openai-codex/gpt-5.6-sol', account: 'openai-codex', model: 'gpt-5.6-sol', status: 'available' },
      { id: 'claude-cwm4tx/opus-5', account: 'cwm4tx', model: 'opus-5', status: 'quota_limited' },
      { id: 'bad', account: '', model: 'bad', status: 'available' },
      ...Array.from({ length: 600 }, (_, index) => ({
        id: `route-${index}/model`, account: `account-${index}`, model: 'model', status: 'available',
      })),
    ]

    writeRuntimeRouteSnapshot(input)
    input[0].id = 'mutated'
    const first = readRuntimeRouteSnapshot()
    expect(first).toHaveLength(500)
    expect(first[0]).toEqual({
      id: 'openai-codex/gpt-5.6-sol', account: 'openai-codex', model: 'gpt-5.6-sol', status: 'available',
    })
    first[0].id = 'also-mutated'
    expect(readRuntimeRouteSnapshot()[0].id).toBe('openai-codex/gpt-5.6-sol')
  })
})
