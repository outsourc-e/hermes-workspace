import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWorkerMessages } from './swarm-chat-reader'

describe('readWorkerMessages', () => {
  it('treats a missing state.db as an unavailable session, not a UI error', () => {
    const profilePath = mkdtempSync(join(tmpdir(), 'swarm-chat-reader-'))

    try {
      const result = readWorkerMessages(profilePath, 30)

      expect(result).toEqual({
        sessionId: null,
        sessionTitle: null,
        messages: [],
        ok: false,
      })
      expect(result.error).toBeUndefined()
    } finally {
      rmSync(profilePath, { recursive: true, force: true })
    }
  })
})
