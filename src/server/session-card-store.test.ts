import { fork } from 'node:child_process'
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
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SESSION_CARD_TITLE,
  SESSION_CARD_BRANCH_COMPLETED_TTL_MS,
  SESSION_CARD_BRANCH_PENDING_TTL_MS,
  SESSION_CARD_STORE_MAX_BYTES,
  SESSION_CARD_TITLE_MAX_LENGTH,
  archiveSessionCardMetadata,
  completeSessionCardBranchReplay,
  listSessionCardMetadata,
  readSessionCardBranchReplay,
  readSessionCardMetadata,
  reconcileSessionCardBranchReplay,
  reserveSessionCardBranchReplay,
  resolveSessionCardTitle,
  sessionCardStoreLockPath,
  sessionCardStorePath,
  updateSessionCardMetadata,
} from './session-card-store'
import type { ChildProcess } from 'node:child_process'

type WorkerReservation = {
  ok: boolean
  reservation?: { status: string }
}

type WorkerUpdate = {
  ok: boolean
  error?: string
}

type ActualFs = {
  renameSync: typeof renameSync
  unlinkSync: typeof unlinkSync
  writeFileSync: typeof writeFileSync
}

function waitForWorkerMessage<T>(worker: ChildProcess): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: T) => {
      cleanup()
      resolve(message)
    }
    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`Session Card test worker exited with code ${code}`))
    }
    const cleanup = () => {
      worker.off('message', onMessage)
      worker.off('exit', onExit)
    }
    worker.once('message', onMessage)
    worker.once('exit', onExit)
  })
}

async function startReservationWorker(): Promise<ChildProcess> {
  const worker = fork(
    fileURLToPath(
      new URL(
        './test-fixtures/session-card-store-concurrency-worker.ts',
        import.meta.url,
      ),
    ),
    [],
    {
      env: { ...process.env, HERMES_WORKSPACE_STATE_DIR: stateDir },
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    },
  )
  await waitForWorkerMessage<{ ready: true }>(worker)
  return worker
}

function reserveInWorker(
  worker: ChildProcess,
  request: { cardId: string; requestKeyHash: string; fingerprint: string },
): Promise<WorkerReservation> {
  const response = waitForWorkerMessage<WorkerReservation>(worker)
  worker.send(request)
  return response
}

async function waitForPath(path: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!existsSync(path)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for Session Card worker path: ${path}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

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
  it('durably replays a completed Card branch after a fresh module load', async () => {
    const reservation = reserveSessionCardBranchReplay(
      'card-1',
      'a'.repeat(64),
      'b'.repeat(64),
    )
    expect(reservation).toMatchObject({ status: 'reserved' })
    if (reservation.status !== 'reserved') {
      throw new Error('Expected durable replay reservation')
    }
    completeSessionCardBranchReplay(
      'card-1',
      'a'.repeat(64),
      'b'.repeat(64),
      reservation.reservationId,
      {
        kind: 'projection-pending',
        canonicalSegmentKey: 'remote:tip',
        childSessionKey: 'remote:child',
      },
    )

    vi.resetModules()
    const reloaded = await import('./session-card-store')
    expect(
      reloaded.readSessionCardBranchReplay('card-1', 'a'.repeat(64)),
    ).toMatchObject({
      fingerprint: 'b'.repeat(64),
      outcome: {
        kind: 'projection-pending',
        canonicalSegmentKey: 'remote:tip',
        childSessionKey: 'remote:child',
      },
    })
  })

  it('atomically conflicts on a reused Card branch key with a different fingerprint', () => {
    expect(
      reserveSessionCardBranchReplay('card-1', 'c'.repeat(64), 'd'.repeat(64)),
    ).toMatchObject({ status: 'reserved' })

    expect(
      reserveSessionCardBranchReplay('card-1', 'c'.repeat(64), 'e'.repeat(64)),
    ).toEqual({ status: 'conflict' })
    expect(readSessionCardBranchReplay('card-1', 'c'.repeat(64))).toMatchObject(
      { fingerprint: 'd'.repeat(64) },
    )
  })

  it('bounds durable branch history without evicting an earlier replay', () => {
    for (let index = 0; index < 32; index += 1) {
      expect(
        reserveSessionCardBranchReplay(
          'card-1',
          index.toString(16).padStart(64, '0'),
          (index + 100).toString(16).padStart(64, '0'),
        ),
      ).toMatchObject({ status: 'reserved' })
    }

    expect(
      reserveSessionCardBranchReplay('card-1', 'f'.repeat(64), 'e'.repeat(64)),
    ).toEqual({ status: 'capacity' })
    expect(readSessionCardBranchReplay('card-1', '0'.repeat(64))).toMatchObject(
      { fingerprint: (100).toString(16).padStart(64, '0') },
    )
  })

  it('terminalizes an expired opaque-fork reservation after restart and rejects the stale owner', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    const requestKeyHash = '1'.repeat(64)
    const fingerprint = '2'.repeat(64)
    const first = reserveSessionCardBranchReplay(
      'card-restart',
      requestKeyHash,
      fingerprint,
    )
    expect(first).toMatchObject({
      status: 'reserved',
      reservationId: expect.stringMatching(/^[a-f0-9]{32}$/),
    })
    const opaqueFork = vi.fn()
    opaqueFork()

    vi.resetModules()
    const restarted = await import('./session-card-store')
    expect(
      restarted.reserveSessionCardBranchReplay(
        'card-restart',
        requestKeyHash,
        fingerprint,
      ),
    ).toMatchObject({ status: 'pending' })

    vi.advanceTimersByTime(SESSION_CARD_BRANCH_PENDING_TTL_MS + 1)
    const recovered = restarted.reserveSessionCardBranchReplay(
      'card-restart',
      requestKeyHash,
      fingerprint,
    )
    expect(recovered).toMatchObject({
      status: 'completed',
      replay: { outcome: { kind: 'ambiguous' } },
    })
    if (first.status !== 'reserved') {
      throw new Error('Expected original reservation')
    }
    expect(() =>
      restarted.completeSessionCardBranchReplay(
        'card-restart',
        requestKeyHash,
        fingerprint,
        first.reservationId,
        { kind: 'failed' },
      ),
    ).toThrow(/reservation.*unavailable/i)
    expect(
      restarted.readSessionCardBranchReplay('card-restart', requestKeyHash),
    ).toMatchObject({ outcome: { kind: 'ambiguous' } })
    expect(opaqueFork).toHaveBeenCalledTimes(1)
  })

  it('never reserves an ambiguous opaque fork again, even after completed replay TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    const requestKeyHash = '3'.repeat(64)
    const fingerprint = '4'.repeat(64)

    expect(
      reserveSessionCardBranchReplay(
        'card-bounded',
        requestKeyHash,
        fingerprint,
      ),
    ).toMatchObject({ status: 'reserved' })
    vi.advanceTimersByTime(SESSION_CARD_BRANCH_PENDING_TTL_MS + 1)
    expect(
      reserveSessionCardBranchReplay(
        'card-bounded',
        requestKeyHash,
        fingerprint,
      ),
    ).toMatchObject({
      status: 'completed',
      replay: { outcome: { kind: 'ambiguous' } },
    })
    vi.advanceTimersByTime(SESSION_CARD_BRANCH_COMPLETED_TTL_MS + 1)
    expect(
      reserveSessionCardBranchReplay(
        'card-bounded',
        requestKeyHash,
        fingerprint,
      ),
    ).toMatchObject({
      status: 'completed',
      replay: { outcome: { kind: 'ambiguous' } },
    })
  })

  it('evicts expired completed outcomes so capacity eventually admits new keys', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    for (let index = 0; index < 32; index += 1) {
      const requestKeyHash = index.toString(16).padStart(64, '0')
      const fingerprint = (index + 100).toString(16).padStart(64, '0')
      const reservation = reserveSessionCardBranchReplay(
        'card-capacity',
        requestKeyHash,
        fingerprint,
      )
      if (reservation.status !== 'reserved') {
        throw new Error('Expected capacity fixture reservation')
      }
      completeSessionCardBranchReplay(
        'card-capacity',
        requestKeyHash,
        fingerprint,
        reservation.reservationId,
        { kind: 'failed' },
      )
    }
    expect(
      reserveSessionCardBranchReplay(
        'card-capacity',
        'e'.repeat(64),
        'f'.repeat(64),
      ),
    ).toEqual({ status: 'capacity' })

    vi.advanceTimersByTime(SESSION_CARD_BRANCH_COMPLETED_TTL_MS + 1)
    expect(
      reserveSessionCardBranchReplay(
        'card-capacity',
        'e'.repeat(64),
        'f'.repeat(64),
      ),
    ).toMatchObject({ status: 'reserved' })
    expect(
      readSessionCardBranchReplay('card-capacity', '0'.repeat(64)),
    ).toBeNull()
  })

  it('recovers ambiguous capacity only after fresh authenticated operator evidence', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    for (let index = 0; index < 32; index += 1) {
      expect(
        reserveSessionCardBranchReplay(
          'card-abandoned-capacity',
          index.toString(16).padStart(64, '0'),
          (index + 500).toString(16).padStart(64, '0'),
        ),
      ).toMatchObject({ status: 'reserved' })
    }

    vi.advanceTimersByTime(
      SESSION_CARD_BRANCH_PENDING_TTL_MS +
        SESSION_CARD_BRANCH_COMPLETED_TTL_MS +
        1,
    )
    expect(
      reserveSessionCardBranchReplay(
        'card-abandoned-capacity',
        'a'.repeat(64),
        'b'.repeat(64),
      ),
    ).toEqual({ status: 'capacity' })

    const reconciledKey = '0'.repeat(64)
    const reconciledFingerprint = (500).toString(16).padStart(64, '0')
    expect(
      reconcileSessionCardBranchReplay(
        'card-abandoned-capacity',
        reconciledKey,
        reconciledFingerprint,
        {
          kind: 'operator-no-effect',
          actorFingerprint: 'c'.repeat(64),
          assertedAt: Date.now(),
        },
      ),
    ).toEqual({ status: 'removed' })
    expect(
      reserveSessionCardBranchReplay(
        'card-abandoned-capacity',
        'a'.repeat(64),
        'b'.repeat(64),
      ),
    ).toMatchObject({ status: 'reserved' })
  })

  it('recovers global ambiguous capacity only after authoritative no-effect evidence', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    for (let cardIndex = 0; cardIndex < 8; cardIndex += 1) {
      for (let replayIndex = 0; replayIndex < 32; replayIndex += 1) {
        const ordinal = cardIndex * 32 + replayIndex
        expect(
          reserveSessionCardBranchReplay(
            `card-global-capacity-${cardIndex}`,
            ordinal.toString(16).padStart(64, '0'),
            (ordinal + 1_000).toString(16).padStart(64, '0'),
          ),
        ).toMatchObject({ status: 'reserved' })
      }
    }
    vi.advanceTimersByTime(SESSION_CARD_BRANCH_PENDING_TTL_MS + 1)
    expect(
      reserveSessionCardBranchReplay(
        'card-global-overflow',
        'a'.repeat(64),
        'b'.repeat(64),
      ),
    ).toEqual({ status: 'capacity' })

    expect(
      reconcileSessionCardBranchReplay(
        'card-global-capacity-0',
        '0'.repeat(64),
        (1_000).toString(16).padStart(64, '0'),
        {
          kind: 'operator-no-effect',
          actorFingerprint: 'c'.repeat(64),
          assertedAt: Date.now(),
        },
      ),
    ).toEqual({ status: 'removed' })
    expect(
      reserveSessionCardBranchReplay(
        'card-global-overflow',
        'a'.repeat(64),
        'b'.repeat(64),
      ),
    ).toMatchObject({ status: 'reserved' })
  })

  it('rejects stale or impossible ambiguity reconciliation evidence', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    const requestKeyHash = 'd'.repeat(64)
    const fingerprint = 'e'.repeat(64)
    reserveSessionCardBranchReplay(
      'card-impossible-evidence',
      requestKeyHash,
      fingerprint,
    )
    vi.advanceTimersByTime(SESSION_CARD_BRANCH_PENDING_TTL_MS + 1)
    reserveSessionCardBranchReplay(
      'card-impossible-evidence',
      requestKeyHash,
      fingerprint,
    )

    expect(() =>
      reconcileSessionCardBranchReplay(
        'card-impossible-evidence',
        requestKeyHash,
        fingerprint,
        {
          kind: 'operator-no-effect',
          actorFingerprint: 'f'.repeat(64),
          assertedAt: Date.now() - SESSION_CARD_BRANCH_PENDING_TTL_MS - 1,
        },
      ),
    ).toThrow(/evidence/i)
    expect(() =>
      reconcileSessionCardBranchReplay(
        'card-impossible-evidence',
        requestKeyHash,
        fingerprint,
        {
          kind: 'projection-created',
          canonicalSegmentKey: 'remote:same',
          childSessionKey: 'remote:same',
        },
      ),
    ).toThrow(/evidence/i)
    expect(() =>
      reconcileSessionCardBranchReplay(
        'card-impossible-evidence',
        requestKeyHash,
        fingerprint,
        {
          kind: 'unknown-evidence',
          actorFingerprint: 'f'.repeat(64),
          assertedAt: Date.now(),
        } as never,
      ),
    ).toThrow(/evidence/i)
    expect(
      readSessionCardBranchReplay('card-impossible-evidence', requestKeyHash),
    ).toMatchObject({ outcome: { kind: 'ambiguous' } })
  })

  it('replays a projection-reconciled ambiguity without reserving another fork', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    const requestKeyHash = '1'.repeat(64)
    const fingerprint = '2'.repeat(64)
    reserveSessionCardBranchReplay(
      'card-projected-reconciliation',
      requestKeyHash,
      fingerprint,
    )
    vi.advanceTimersByTime(SESSION_CARD_BRANCH_PENDING_TTL_MS + 1)
    reserveSessionCardBranchReplay(
      'card-projected-reconciliation',
      requestKeyHash,
      fingerprint,
    )

    expect(
      reconcileSessionCardBranchReplay(
        'card-projected-reconciliation',
        requestKeyHash,
        fingerprint,
        {
          kind: 'projection-created',
          canonicalSegmentKey: 'remote:parent',
          childSessionKey: 'remote:child',
        },
      ),
    ).toMatchObject({
      status: 'reconciled',
      replay: {
        outcome: {
          kind: 'created',
          canonicalSegmentKey: 'remote:parent',
          childSessionKey: 'remote:child',
        },
      },
    })
    expect(
      reserveSessionCardBranchReplay(
        'card-projected-reconciliation',
        requestKeyHash,
        fingerprint,
      ),
    ).toMatchObject({
      status: 'completed',
      replay: { outcome: { kind: 'created' } },
    })
    vi.advanceTimersByTime(SESSION_CARD_BRANCH_COMPLETED_TTL_MS + 1)
    expect(
      reserveSessionCardBranchReplay(
        'card-projected-reconciliation',
        requestKeyHash,
        fingerprint,
      ),
    ).toMatchObject({
      status: 'completed',
      replay: { outcome: { kind: 'created' } },
    })
  })

  it('rejects a new branch reservation when archive committed after projection', () => {
    updateSessionCardMetadata('card-archived-race', {
      manualTitle: 'Projected while active',
    })
    archiveSessionCardMetadata('card-archived-race')

    expect(
      reserveSessionCardBranchReplay(
        'card-archived-race',
        '9'.repeat(64),
        'a'.repeat(64),
      ),
    ).toEqual({ status: 'archived' })
    expect(
      readSessionCardBranchReplay('card-archived-race', '9'.repeat(64)),
    ).toBeNull()
  })

  it('recovers a stale exclusive store lock left by another process', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      sessionCardStoreLockPath(),
      `${JSON.stringify({
        token: 'a'.repeat(32),
        pid: 999_999_999,
        createdAt: Date.now() - SESSION_CARD_BRANCH_PENDING_TTL_MS - 1,
      })}\n`,
      { encoding: 'utf8', mode: 0o600 },
    )

    expect(
      reserveSessionCardBranchReplay(
        'card-stale-lock',
        '5'.repeat(64),
        '6'.repeat(64),
      ),
    ).toMatchObject({ status: 'reserved' })
    expect(existsSync(sessionCardStoreLockPath())).toBe(false)
  })

  it('does not release a successor lock after ownership changes', async () => {
    const actualFs = await vi.importActual<ActualFs>('node:fs')
    const successor = {
      token: 'b'.repeat(32),
      pid: process.pid + 1,
      createdAt: Date.now(),
    }
    vi.mocked(renameSync).mockImplementationOnce((oldPath, newPath) => {
      actualFs.renameSync(oldPath, newPath)
      actualFs.unlinkSync(sessionCardStoreLockPath())
      actualFs.writeFileSync(
        sessionCardStoreLockPath(),
        `${JSON.stringify(successor)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      )
    })

    expect(() =>
      reserveSessionCardBranchReplay(
        'card-successor-lock',
        '7'.repeat(64),
        '8'.repeat(64),
      ),
    ).toThrow(/lock|fenc|ownership/i)
    expect(
      JSON.parse(readFileSync(sessionCardStoreLockPath(), 'utf8')),
    ).toEqual(successor)
    actualFs.unlinkSync(sessionCardStoreLockPath())
  })

  it('fences a suspended cross-process owner after stale-lock takeover', async () => {
    updateSessionCardMetadata('card-suspended-owner', {
      autoTitle: 'Baseline title',
    })
    const worker = await startReservationWorker()
    const pauseMarker = join(stateDir, 'owner-paused')
    const resumeMarker = join(stateDir, 'owner-resume')
    const response = waitForWorkerMessage<WorkerUpdate>(worker)
    worker.send({
      action: 'paused-update',
      cardId: 'card-suspended-owner',
      title: 'Stale owner title',
      pauseMarker,
      resumeMarker,
    })

    try {
      await waitForPath(pauseMarker)
      const staleLock = JSON.parse(
        readFileSync(sessionCardStoreLockPath(), 'utf8'),
      ) as Record<string, unknown>
      writeFileSync(
        sessionCardStoreLockPath(),
        `${JSON.stringify({
          ...staleLock,
          createdAt: Date.now() - SESSION_CARD_BRANCH_PENDING_TTL_MS - 1,
        })}\n`,
        'utf8',
      )

      updateSessionCardMetadata('card-suspended-owner', {
        autoTitle: 'Successor title',
      })
      writeFileSync(resumeMarker, 'resume\n', 'utf8')

      expect(await response).toMatchObject({
        ok: false,
        error: expect.stringMatching(/lock|fenc|ownership/i),
      })
      expect(readSessionCardMetadata('card-suspended-owner')?.autoTitle).toBe(
        'Successor title',
      )
    } finally {
      writeFileSync(resumeMarker, 'resume\n', 'utf8')
      worker.kill()
    }
  }, 10_000)

  it('admits exactly one reservation across independent server processes', async () => {
    const workers = await Promise.all([
      startReservationWorker(),
      startReservationWorker(),
    ])
    try {
      for (let index = 0; index < 24; index += 1) {
        const request = {
          cardId: `process-card-${index}`,
          requestKeyHash: index.toString(16).padStart(64, '0'),
          fingerprint: (index + 1000).toString(16).padStart(64, '0'),
        }
        const results = await Promise.all(
          workers.map((worker) => reserveInWorker(worker, request)),
        )
        expect(results.every((result) => result.ok)).toBe(true)
        expect(
          results
            .map((result) => result.reservation?.status)
            .sort((a, b) => String(a).localeCompare(String(b))),
        ).toEqual(['pending', 'reserved'])
      }
    } finally {
      for (const worker of workers) worker.kill()
    }
  }, 20_000)

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

  it('fails closed for branch replay operations when durable metadata is corrupt', () => {
    writeFileSync(sessionCardStorePath(), '{ definitely not json', 'utf8')
    const corrupt = readFileSync(sessionCardStorePath(), 'utf8')

    expect(() => readSessionCardBranchReplay('card-1', 'a'.repeat(64))).toThrow(
      /json|store|metadata/i,
    )
    expect(() =>
      reserveSessionCardBranchReplay('card-1', 'a'.repeat(64), 'b'.repeat(64)),
    ).toThrow(/json|store|metadata/i)
    expect(readFileSync(sessionCardStorePath(), 'utf8')).toBe(corrupt)
  })

  it('rejects persisted replay leases that exceed the bounded TTL', () => {
    const now = Date.now()
    writeFileSync(
      sessionCardStorePath(),
      JSON.stringify({
        version: 1,
        cards: {
          'card-lease': {
            cardId: 'card-lease',
            updatedAt: now,
            branchReplays: [
              {
                requestKeyHash: 'a'.repeat(64),
                fingerprint: 'b'.repeat(64),
                createdAt: now,
                updatedAt: now,
                expiresAt: now + SESSION_CARD_BRANCH_PENDING_TTL_MS + 1,
                attemptCount: 1,
                reservationId: 'c'.repeat(32),
              },
            ],
          },
        },
      }),
      'utf8',
    )

    expect(() =>
      reserveSessionCardBranchReplay(
        'card-lease',
        'a'.repeat(64),
        'b'.repeat(64),
      ),
    ).toThrow(/invalid|store|metadata/i)
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

  it('persists primitive pin state across reload and clears it when archived', async () => {
    const pinned = updateSessionCardMetadata('card-1', { pinned: true })
    expect(pinned).toMatchObject({ cardId: 'card-1', pinned: true })

    vi.resetModules()
    const reloaded = await import('./session-card-store')
    expect(reloaded.readSessionCardMetadata('card-1')).toMatchObject({
      cardId: 'card-1',
      pinned: true,
    })

    const archived = reloaded.archiveSessionCardMetadata('card-1')
    expect(archived.archivedAt).toBeDefined()
    expect(archived.pinned).toBeUndefined()
    expect(
      JSON.parse(readFileSync(sessionCardStorePath(), 'utf8')).cards['card-1'],
    ).not.toHaveProperty('pinned')

    const afterStalePinUpdate = reloaded.updateSessionCardMetadata('card-1', {
      pinned: true,
    })
    expect(afterStalePinUpdate).toMatchObject({
      cardId: 'card-1',
      archivedAt: expect.any(Number),
    })
    expect(afterStalePinUpdate).not.toHaveProperty('pinned')
  })

  it('fails closed for an archived persisted record that still contains a pin', () => {
    writeFileSync(
      sessionCardStorePath(),
      JSON.stringify({
        version: 1,
        cards: {
          archived: {
            cardId: 'archived',
            pinned: true,
            updatedAt: 2,
            archivedAt: 2,
          },
        },
      }),
      'utf8',
    )

    expect(readSessionCardMetadata('archived')).toEqual({
      cardId: 'archived',
      updatedAt: 2,
      archivedAt: 2,
    })
  })

  it('rejects non-boolean pin updates and safely drops malformed persisted pin fields', () => {
    for (const pinned of [undefined, null, 0, 1, 'true', [], {}]) {
      expect(() =>
        updateSessionCardMetadata('card-1', { pinned } as never),
      ).toThrow(/pinned|boolean/i)
    }
    expect(existsSync(sessionCardStorePath())).toBe(false)

    writeFileSync(
      sessionCardStorePath(),
      JSON.stringify({
        version: 1,
        cards: {
          validAbsent: {
            cardId: 'validAbsent',
            manualTitle: 'Legacy-safe metadata',
            updatedAt: 1,
          },
          validFalse: {
            cardId: 'validFalse',
            pinned: false,
            updatedAt: 2,
          },
          malformed: {
            cardId: 'malformed',
            pinned: 'false',
            updatedAt: 3,
          },
        },
      }),
      'utf8',
    )

    expect(readSessionCardMetadata('validAbsent')).toMatchObject({
      cardId: 'validAbsent',
    })
    expect(readSessionCardMetadata('validFalse')).toMatchObject({
      cardId: 'validFalse',
      pinned: false,
    })
    expect(readSessionCardMetadata('malformed')).toBeNull()

    expect(
      updateSessionCardMetadata('malformed', { pinned: true }),
    ).toMatchObject({ cardId: 'malformed', pinned: true })
    expect(readSessionCardMetadata('malformed')).toMatchObject({
      cardId: 'malformed',
      pinned: true,
    })
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
