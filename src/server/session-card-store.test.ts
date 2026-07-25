import {
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SESSION_CARD_TITLE,
  SESSION_CARD_STORE_MAX_BYTES,
  SESSION_CARD_TITLE_MAX_LENGTH,
  archiveSessionCardMetadata,
  listSessionCardMetadata,
  readSessionCardMetadata,
  resolveSessionCardTitle,
  sessionCardStorePath,
  updateSessionCardMetadata,
} from './session-card-store'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    fsyncSync: vi.fn(actual.fsyncSync as typeof fsyncSync),
    openSync: vi.fn(actual.openSync as typeof openSync),
    renameSync: vi.fn(actual.renameSync as typeof renameSync),
    unlinkSync: vi.fn(actual.unlinkSync as typeof unlinkSync),
    writeFileSync: vi.fn(actual.writeFileSync as typeof writeFileSync),
  }
})

const originalStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
let stateDir = ''

type AtomicWriteFailurePoint = 'open' | 'write' | 'fsync' | 'rename'

function atomicWriteCallCount(operation: AtomicWriteFailurePoint): number {
  switch (operation) {
    case 'open':
      return vi.mocked(openSync).mock.calls.length
    case 'write':
      return vi.mocked(writeFileSync).mock.calls.length
    case 'fsync':
      return vi.mocked(fsyncSync).mock.calls.length
    case 'rename':
      return vi.mocked(renameSync).mock.calls.length
  }
}

function failNextAtomicWrite(
  operation: AtomicWriteFailurePoint,
  failure: Error,
): void {
  const fail = () => {
    throw failure
  }
  switch (operation) {
    case 'open':
      vi.mocked(openSync).mockImplementationOnce(fail)
      return
    case 'write':
      vi.mocked(writeFileSync).mockImplementationOnce(fail)
      return
    case 'fsync':
      vi.mocked(fsyncSync).mockImplementationOnce(fail)
      return
    case 'rename':
      vi.mocked(renameSync).mockImplementationOnce(fail)
  }
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'session-card-store-'))
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  if (originalStateDir === undefined) {
    delete process.env.HERMES_WORKSPACE_STATE_DIR
  } else {
    process.env.HERMES_WORKSPACE_STATE_DIR = originalStateDir
  }
  rmSync(stateDir, { recursive: true, force: true })
})

describe('Session Card title resolution', () => {
  it('uses default, then auto, then manual title precedence', () => {
    expect(resolveSessionCardTitle(null)).toEqual({
      title: DEFAULT_SESSION_CARD_TITLE,
      titleSource: 'default',
    })
    expect(
      resolveSessionCardTitle({
        cardId: 'card-1',
        autoTitle: 'Generated title',
        updatedAt: 1,
      }),
    ).toEqual({ title: 'Generated title', titleSource: 'auto' })
    expect(
      resolveSessionCardTitle({
        cardId: 'card-1',
        autoTitle: 'Generated title',
        manualTitle: 'Chosen title',
        updatedAt: 2,
      }),
    ).toEqual({ title: 'Chosen title', titleSource: 'manual' })
  })

  it('keeps a manual title when a new canonical segment updates the same card', () => {
    updateSessionCardMetadata('stable-card', {
      autoTitle: 'Title from segment one',
    })
    updateSessionCardMetadata('stable-card', { manualTitle: 'Keep this title' })

    // A continuation changes only the canonical segment outside this store. Its
    // auto-title refresh still targets the stable card ID.
    updateSessionCardMetadata('stable-card', {
      autoTitle: 'Title from segment two',
    })

    const metadata = readSessionCardMetadata('stable-card')
    expect(metadata).toMatchObject({
      cardId: 'stable-card',
      manualTitle: 'Keep this title',
      autoTitle: 'Title from segment two',
    })
    expect(resolveSessionCardTitle(metadata)).toEqual({
      title: 'Keep this title',
      titleSource: 'manual',
    })
  })
})

describe('Session Card metadata persistence', () => {
  it.each(['toString', 'hasOwnProperty'])(
    'returns null for absent inherited-key card ID %s',
    (cardId) => {
      const metadata = readSessionCardMetadata(cardId)

      expect(metadata).toBeNull()
      expect(resolveSessionCardTitle(metadata)).toEqual({
        title: DEFAULT_SESSION_CARD_TITLE,
        titleSource: 'default',
      })
    },
  )

  it('rejects invalid titles, records, card IDs, and non-metadata fields', () => {
    expect(() =>
      updateSessionCardMetadata('card-1', { manualTitle: '   ' }),
    ).toThrow(/title/i)
    expect(() =>
      updateSessionCardMetadata('card-1', {
        autoTitle: 'x'.repeat(SESSION_CARD_TITLE_MAX_LENGTH + 1),
      }),
    ).toThrow(/title/i)
    expect(() =>
      updateSessionCardMetadata('bad card id', { autoTitle: 'Valid title' }),
    ).toThrow(/card id/i)
    expect(() =>
      updateSessionCardMetadata('card-1', {
        transcript: 'must never be stored',
      } as never),
    ).toThrow(/field/i)
    expect(existsSync(sessionCardStorePath())).toBe(false)

    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      sessionCardStorePath(),
      JSON.stringify({
        version: 1,
        cards: {
          good: { cardId: 'good', autoTitle: 'Safe title', updatedAt: 1 },
          mismatched: {
            cardId: 'different-id',
            manualTitle: 'Wrong card',
            updatedAt: 1,
          },
          sensitive: {
            cardId: 'sensitive',
            manualTitle: 'Unsafe record',
            transcript: 'secret transcript',
            updatedAt: 1,
          },
        },
      }),
      'utf8',
    )

    expect(readSessionCardMetadata('good')?.autoTitle).toBe('Safe title')
    expect(readSessionCardMetadata('mismatched')).toBeNull()
    expect(readSessionCardMetadata('sensitive')).toBeNull()
  })

  it('falls back safely for corrupt or oversized files and can recover atomically', () => {
    writeFileSync(sessionCardStorePath(), '{ definitely not json', 'utf8')
    expect(readSessionCardMetadata('card-1')).toBeNull()
    expect(resolveSessionCardTitle(readSessionCardMetadata('card-1'))).toEqual({
      title: DEFAULT_SESSION_CARD_TITLE,
      titleSource: 'default',
    })

    writeFileSync(
      sessionCardStorePath(),
      'x'.repeat(SESSION_CARD_STORE_MAX_BYTES + 1),
      'utf8',
    )
    expect(listSessionCardMetadata()).toEqual([])

    updateSessionCardMetadata('card-1', { autoTitle: 'Recovered title' })
    const persisted = JSON.parse(
      readFileSync(sessionCardStorePath(), 'utf8'),
    ) as Record<string, unknown>
    expect(persisted.version).toBe(1)
    expect(readSessionCardMetadata('card-1')?.autoTitle).toBe('Recovered title')
    expect(readdirSync(stateDir).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    )
  })

  it.each(['open', 'write', 'fsync', 'rename'] as const)(
    'preserves the prior store and removes temporary files when atomic %s fails',
    (operation) => {
      updateSessionCardMetadata('card-1', { autoTitle: 'Previous title' })
      const previousStore = readFileSync(sessionCardStorePath(), 'utf8')
      const callsBeforeFailure = atomicWriteCallCount(operation)
      const failure = new Error(`${operation} failed`)
      failNextAtomicWrite(operation, failure)

      let thrown: unknown
      try {
        updateSessionCardMetadata('card-1', { autoTitle: 'Replacement title' })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBe(failure)
      expect(atomicWriteCallCount(operation)).toBe(callsBeforeFailure + 1)
      expect(readFileSync(sessionCardStorePath(), 'utf8')).toBe(previousStore)
      expect(readSessionCardMetadata('card-1')?.autoTitle).toBe(
        'Previous title',
      )
      expect(
        readdirSync(stateDir).filter((name) => name.endsWith('.tmp')),
      ).toEqual([])
    },
  )

  it('does not swallow a temporary-file cleanup failure', () => {
    updateSessionCardMetadata('card-1', { autoTitle: 'Previous title' })
    const previousStore = readFileSync(sessionCardStorePath(), 'utf8')
    const renameFailure = new Error('rename failed')
    const cleanupFailure = Object.assign(new Error('cleanup failed'), {
      code: 'EIO',
    })
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw renameFailure
    })
    vi.mocked(unlinkSync).mockImplementationOnce(() => {
      throw cleanupFailure
    })

    let thrown: unknown
    try {
      updateSessionCardMetadata('card-1', { autoTitle: 'Replacement title' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      renameFailure,
      cleanupFailure,
    ])
    expect(readFileSync(sessionCardStorePath(), 'utf8')).toBe(previousStore)
  })

  it('persists archive state across a fresh module load', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'))
    updateSessionCardMetadata('card-1', { manualTitle: 'Archived card' })
    const archived = archiveSessionCardMetadata('card-1')
    expect(archived.archivedAt).toBe(Date.now())

    vi.resetModules()
    const reloaded = await import('./session-card-store')
    expect(reloaded.readSessionCardMetadata('card-1')).toEqual(archived)
  })

  it('never imports legacy browser title, pin, or pending-send state', () => {
    writeFileSync(
      join(stateDir, 'claude.sessionTitles.v1'),
      JSON.stringify({
        'segment-1': {
          title: 'Legacy browser title',
          source: 'manual',
          pinned: true,
          pendingSend: 'secret draft',
        },
      }),
      'utf8',
    )
    writeFileSync(
      join(stateDir, 'browser-state.json'),
      JSON.stringify({ pinned: ['segment-1'], pendingSend: 'secret draft' }),
      'utf8',
    )

    expect(readSessionCardMetadata('segment-1')).toBeNull()
    expect(resolveSessionCardTitle(null).title).toBe(DEFAULT_SESSION_CARD_TITLE)
    expect(existsSync(sessionCardStorePath())).toBe(false)

    updateSessionCardMetadata('card-1', { autoTitle: 'Server title' })
    const persisted = readFileSync(sessionCardStorePath(), 'utf8')
    expect(persisted).not.toContain('Legacy browser title')
    expect(persisted).not.toContain('pendingSend')
    expect(persisted).not.toContain('pinned')
  })
})
