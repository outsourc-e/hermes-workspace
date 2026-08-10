import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWorkerMessages } from './swarm-chat-reader'
import { resolveManagedPythonBin } from './managed-python'

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

  it('reads a worker SQLite session with the managed Hermes interpreter', () => {
    const profilePath = mkdtempSync(join(tmpdir(), 'swarm-chat-reader-db-'))
    const dbPath = join(profilePath, 'state.db')
    const createFixture = `import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
conn.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, started_at INTEGER)")
conn.execute("CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at INTEGER)")
conn.execute("INSERT INTO sessions VALUES ('s1', 'Validation', 1)")
conn.execute("INSERT INTO messages VALUES ('m1', 's1', 'assistant', 'PYTHON_READER_OK', 2)")
conn.commit()
conn.close()`

    try {
      execFileSync(resolveManagedPythonBin(), ['-c', createFixture, dbPath])
      const result = readWorkerMessages(profilePath, 30)
      expect(result.ok).toBe(true)
      expect(result.sessionId).toBe('s1')
      expect(result.messages.at(-1)?.content).toBe('PYTHON_READER_OK')
    } finally {
      rmSync(profilePath, { recursive: true, force: true })
    }
  })
})
