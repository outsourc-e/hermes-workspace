import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as FsPromises from 'node:fs/promises'

const fsPromiseState = vi.hoisted(() => ({
  rejectedUnlinks: [] as Array<{ suffix: string; message: string }>,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>()
  return {
    ...actual,
    unlink: (filePath: Parameters<typeof actual.unlink>[0]) => {
      const rejection = fsPromiseState.rejectedUnlinks.find(({ suffix }) =>
        String(filePath).endsWith(suffix),
      )
      if (rejection) {
        return Promise.reject(
          Object.assign(new Error(rejection.message), {
            code: 'EACCES',
          }),
        )
      }
      return actual.unlink(filePath)
    },
  }
})

const originalHermesHome = process.env.HERMES_HOME

let tempHome: string | null = null

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetModules()
  fsPromiseState.rejectedUnlinks = []
  tempHome = mkdtempSync(join(tmpdir(), 'hermes-run-store-'))
  process.env.HERMES_HOME = tempHome
})

afterEach(() => {
  vi.useRealTimers()
  if (tempHome) rmSync(tempHome, { recursive: true, force: true })
  tempHome = null
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  vi.resetModules()
})

describe('run text persistence buffer', () => {
  it('coalesces appended deltas into one bounded-interval write', async () => {
    vi.useFakeTimers()
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi.fn(() => Promise.resolve(null))
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.append('Hello')
    buffer.append(', ')
    buffer.append('world')

    expect(write).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(499)
    expect(write).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('Hello, world', { replace: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('lets a full replacement supersede queued appends while preserving later deltas', async () => {
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const writes: Array<{ text: string; replace: boolean }> = []
    const buffer = createRunTextPersistenceBuffer((text, options) => {
      writes.push({ text, replace: options.replace })
      return Promise.resolve(null)
    })

    buffer.append('discarded delta')
    buffer.replace('authoritative snapshot')
    buffer.append(' plus delta')
    await buffer.flush()

    expect(writes).toEqual([
      { text: 'authoritative snapshot plus delta', replace: true },
    ])
  })

  it('flushes queued text immediately and cancels the scheduled write', async () => {
    vi.useFakeTimers()
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi.fn(() => Promise.resolve(null))
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.append('final text')
    await buffer.flush()

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('final text', { replace: false })
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('retries a rejected batch before newer pending text in original order', async () => {
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('temporary persistence failure'))
      .mockResolvedValue(null)
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.replace('authoritative snapshot')
    await expect(buffer.flush()).rejects.toThrow(
      'temporary persistence failure',
    )

    buffer.append(' plus newer delta')
    await buffer.flush()

    expect(write.mock.calls).toEqual([
      ['authoritative snapshot', { replace: true }],
      ['authoritative snapshot', { replace: true }],
      [' plus newer delta', { replace: false }],
    ])
  })

  it('retries a timer-rejected batch during the terminal seal and rejects later text', async () => {
    vi.useFakeTimers()
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const write = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('temporary persistence failure'))
      .mockResolvedValue(null)
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.append('persist me')
    await vi.advanceTimersByTimeAsync(500)
    buffer.append(' before terminal')

    await buffer.seal()
    buffer.append(' discarded after terminal')
    await buffer.flush()

    expect(write.mock.calls).toEqual([
      ['persist me', { replace: false }],
      ['persist me', { replace: false }],
      [' before terminal', { replace: false }],
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries an in-flight rejection during seal before newer text in original order', async () => {
    const { createRunTextPersistenceBuffer } = await import('./run-store')
    const inFlightWrite = createDeferred()
    const write = vi
      .fn<(text: string, options: { replace: boolean }) => Promise<unknown>>()
      .mockImplementationOnce(() => inFlightWrite.promise)
      .mockResolvedValue(null)
    const buffer = createRunTextPersistenceBuffer(write)

    buffer.replace('authoritative snapshot')
    const timerFlush = buffer.flush()
    expect(write).toHaveBeenCalledTimes(1)

    buffer.append(' plus newer delta')
    const terminalSeal = buffer.seal()
    inFlightWrite.reject(new Error('in-flight persistence failure'))

    await expect(timerFlush).rejects.toThrow('in-flight persistence failure')
    await terminalSeal

    expect(write.mock.calls).toEqual([
      ['authoritative snapshot', { replace: true }],
      ['authoritative snapshot', { replace: true }],
      [' plus newer delta', { replace: false }],
    ])
  })
})

describe('run-store persistence', () => {
  it('rejects unsafe run ids without writing outside the session directory', async () => {
    const { createPersistedRun, getPersistedRun } = await import('./run-store')
    const escapedPath = join(tempHome!, 'webui-mvp', 'escaped-run.json')

    await expect(
      createPersistedRun({
        runId: '../../escaped-run',
        sessionKey: 'session-a',
      }),
    ).rejects.toThrow(/run id/i)
    expect(existsSync(escapedPath)).toBe(false)

    for (const runId of [
      '..',
      '.',
      'run/child',
      String.raw`run\child`,
      'run%2fchild',
      'run%252fchild',
      'run.id',
      ' run-id',
      'run-id ',
      'x'.repeat(129),
    ]) {
      await expect(
        createPersistedRun({ runId, sessionKey: 'session-a' }),
      ).rejects.toThrow(/run id/i)
      await expect(getPersistedRun('session-a', runId)).resolves.toBeNull()
    }

    const boundedRunId = 'x'.repeat(128)
    await expect(
      createPersistedRun({ runId: boundedRunId, sessionKey: 'session-a' }),
    ).resolves.toMatchObject({ runId: boundedRunId })
    await expect(
      getPersistedRun('session-a', boundedRunId),
    ).resolves.toMatchObject({ runId: boundedRunId })
  })

  it('confines encoded session directories beneath the runs root', async () => {
    const { createPersistedRun } = await import('./run-store')
    const escapedPath = join(tempHome!, 'webui-mvp', 'safe-run.json')

    await expect(
      createPersistedRun({ runId: 'safe-run', sessionKey: '..' }),
    ).rejects.toThrow(/runs root/i)
    expect(existsSync(escapedPath)).toBe(false)
  })

  it('moves an active run to the authoritative successor for recovery polling', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getActiveRunForSession,
      getPersistedRun,
      migratePersistedRun,
    } = await import('./run-store')

    await createPersistedRun({
      runId: 'run-handoff',
      sessionKey: 'session-a',
      friendlyId: 'friendly-a',
    })
    await appendRunText('session-a', 'run-handoff', 'persisted before handoff')

    await migratePersistedRun(
      'session-a',
      'session-b',
      'run-handoff',
      'friendly-b',
    )
    await appendRunText('session-b', 'run-handoff', ' and after handoff')

    expect(await getPersistedRun('session-a', 'run-handoff')).toBeNull()
    expect(await getActiveRunForSession('session-b')).toMatchObject({
      runId: 'run-handoff',
      sessionKey: 'session-b',
      friendlyId: 'friendly-b',
      status: 'active',
      assistantText: 'persisted before handoff and after handoff',
    })
  })

  it('retains card identity and advances its canonical segment during migration', async () => {
    const {
      createPersistedRun,
      getActiveRunForCard,
      getPersistedRun,
      migratePersistedRun,
    } = await import('./run-store')

    await createPersistedRun({
      runId: 'card-run',
      sessionKey: 'remote:parent',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:parent',
    })
    await migratePersistedRun(
      'remote:parent',
      'remote:continuation',
      'card-run',
      'remote:parent-card',
      {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:continuation',
      },
    )

    expect(
      await getPersistedRun('remote:continuation', 'card-run'),
    ).toMatchObject({
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:continuation',
      sessionKey: 'remote:continuation',
    })
    expect(
      await getActiveRunForCard('remote:parent-card', 'remote:continuation'),
    ).toMatchObject({
      runId: 'card-run',
      friendlyId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:continuation',
    })
  })

  it('fails closed instead of overwriting a destination run owned by another Card', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getPersistedRun,
      migratePersistedRun,
    } = await import('./run-store')

    await createPersistedRun({
      runId: 'shared-run-id',
      sessionKey: 'remote:parent',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:parent',
    })
    await appendRunText('remote:parent', 'shared-run-id', 'parent Card output')
    await createPersistedRun({
      runId: 'shared-run-id',
      sessionKey: 'remote:continuation',
      friendlyId: 'remote:other-card',
      cardId: 'remote:other-card',
      canonicalSegmentKey: 'remote:continuation',
    })
    await appendRunText(
      'remote:continuation',
      'shared-run-id',
      'other Card output',
    )

    await expect(
      migratePersistedRun(
        'remote:parent',
        'remote:continuation',
        'shared-run-id',
        'remote:parent-card',
        {
          cardId: 'remote:parent-card',
          canonicalSegmentKey: 'remote:continuation',
        },
      ),
    ).rejects.toThrow('destination owner')

    await expect(
      getPersistedRun('remote:parent', 'shared-run-id'),
    ).resolves.toMatchObject({
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:parent',
      assistantText: 'parent Card output',
    })
    await expect(
      getPersistedRun('remote:continuation', 'shared-run-id'),
    ).resolves.toMatchObject({
      cardId: 'remote:other-card',
      canonicalSegmentKey: 'remote:continuation',
      assistantText: 'other Card output',
    })
  })

  it('does not adopt an incompatible destination Card when the source is missing', async () => {
    const { createPersistedRun, getPersistedRun, migratePersistedRun } =
      await import('./run-store')

    await createPersistedRun({
      runId: 'missing-source-run',
      sessionKey: 'remote:continuation',
      friendlyId: 'remote:other-card',
      cardId: 'remote:other-card',
      canonicalSegmentKey: 'remote:continuation',
    })

    await expect(
      migratePersistedRun(
        'remote:missing-parent',
        'remote:continuation',
        'missing-source-run',
        'remote:parent-card',
        {
          cardId: 'remote:parent-card',
          canonicalSegmentKey: 'remote:continuation',
        },
      ),
    ).rejects.toThrow('destination owner')
    await expect(
      getPersistedRun('remote:continuation', 'missing-source-run'),
    ).resolves.toMatchObject({
      cardId: 'remote:other-card',
      friendlyId: 'remote:other-card',
    })
  })

  it('does not opportunistically adopt a legacy run into a Card handoff', async () => {
    const {
      createPersistedRun,
      getActiveRunForCard,
      getPersistedRun,
      migratePersistedRun,
    } = await import('./run-store')

    await createPersistedRun({
      runId: 'legacy-run',
      sessionKey: 'remote:legacy-parent',
      friendlyId: 'remote:parent-card',
    })

    await expect(
      getActiveRunForCard('remote:parent-card', 'remote:continuation'),
    ).resolves.toBeNull()
    await expect(
      migratePersistedRun(
        'remote:legacy-parent',
        'remote:continuation',
        'legacy-run',
        'remote:parent-card',
        {
          cardId: 'remote:parent-card',
          canonicalSegmentKey: 'remote:continuation',
        },
      ),
    ).rejects.toThrow('source owner')
    await expect(
      getPersistedRun('remote:legacy-parent', 'legacy-run'),
    ).resolves.toMatchObject({
      sessionKey: 'remote:legacy-parent',
      friendlyId: 'remote:parent-card',
    })
    await expect(
      getPersistedRun('remote:continuation', 'legacy-run'),
    ).resolves.toBeNull()
  })

  it('returns the newest active run for the stable Card and current canonical segment', async () => {
    vi.useFakeTimers()
    const { createPersistedRun, getActiveRunForCard } =
      await import('./run-store')

    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'))
    await createPersistedRun({
      runId: 'older-current-run',
      sessionKey: 'tip-upstream-a',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:tip',
    })
    vi.setSystemTime(new Date('2026-07-26T12:00:03.000Z'))
    await createPersistedRun({
      runId: 'newest-stale-lineage-run',
      sessionKey: 'old-tip-upstream',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:old-tip',
    })
    vi.setSystemTime(new Date('2026-07-26T12:00:02.000Z'))
    await createPersistedRun({
      runId: 'newest-current-run',
      sessionKey: 'tip-upstream-b',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:tip',
    })

    await expect(
      getActiveRunForCard('remote:parent-card', 'remote:tip'),
    ).resolves.toMatchObject({
      runId: 'newest-current-run',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:tip',
    })
  })

  it('keeps a failed migration recoverable through the stable card id', async () => {
    const {
      createPersistedRun,
      getActiveRunForCard,
      getPersistedRun,
      listAllActiveRuns,
      migratePersistedRun,
    } = await import('./run-store')

    await createPersistedRun({
      runId: 'recoverable-card-run',
      sessionKey: 'remote:parent',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:parent',
    })
    fsPromiseState.rejectedUnlinks = [
      {
        suffix: join('remote%3Aparent', 'recoverable-card-run.json'),
        message: 'forced card migration failure',
      },
    ]

    await expect(
      migratePersistedRun(
        'remote:parent',
        'remote:continuation',
        'recoverable-card-run',
        'remote:parent-card',
        {
          cardId: 'remote:parent-card',
          canonicalSegmentKey: 'remote:continuation',
        },
      ),
    ).rejects.toThrow('forced card migration failure')
    fsPromiseState.rejectedUnlinks = []

    expect(
      await getActiveRunForCard('remote:parent-card', 'remote:parent'),
    ).toMatchObject({
      runId: 'recoverable-card-run',
      sessionKey: 'remote:parent',
      canonicalSegmentKey: 'remote:parent',
    })
    expect(
      await getActiveRunForCard('remote:parent-card', 'remote:continuation'),
    ).toMatchObject({
      runId: 'recoverable-card-run',
      sessionKey: 'remote:parent',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:continuation',
      recoverySourceCanonicalSegmentKey: 'remote:parent',
    })
    expect(
      await getPersistedRun('remote:parent', 'recoverable-card-run'),
    ).toMatchObject({
      canonicalSegmentKey: 'remote:parent',
    })
    expect(await listAllActiveRuns()).toEqual([
      expect.objectContaining({
        runId: 'recoverable-card-run',
        sessionKey: 'remote:parent',
        canonicalSegmentKey: 'remote:parent',
      }),
    ])
  })

  it('fails closed when multiple old Card owners make recovery ambiguous', async () => {
    const { createPersistedRun, getActiveRunForCard } =
      await import('./run-store')

    await createPersistedRun({
      runId: 'old-owner-a',
      sessionKey: 'remote:old-a',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:old-a',
    })
    await createPersistedRun({
      runId: 'old-owner-b',
      sessionKey: 'remote:old-b',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:old-b',
    })

    await expect(
      getActiveRunForCard('remote:parent-card', 'remote:continuation'),
    ).resolves.toBeNull()
  })

  it('does not leave a successor recovery clone when source unlink fails', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getActiveRunForSession,
      getPersistedRun,
      listAllActiveRuns,
      markRunStatus,
      migratePersistedRun,
    } = await import('./run-store')

    await createPersistedRun({
      runId: 'run-partial-migration',
      sessionKey: 'session-a',
      friendlyId: 'friendly-a',
    })
    await appendRunText('session-a', 'run-partial-migration', 'before handoff')
    fsPromiseState.rejectedUnlinks = [
      {
        suffix: join('session-a', 'run-partial-migration.json'),
        message: 'forced source unlink failure',
      },
    ]

    await expect(
      migratePersistedRun(
        'session-a',
        'session-b',
        'run-partial-migration',
        'friendly-b',
      ),
    ).rejects.toThrow('forced source unlink failure')
    fsPromiseState.rejectedUnlinks = []

    expect(await getActiveRunForSession('session-a')).toMatchObject({
      runId: 'run-partial-migration',
      sessionKey: 'session-a',
      assistantText: 'before handoff',
    })
    expect(
      await getPersistedRun('session-b', 'run-partial-migration'),
    ).toBeNull()
    expect(await listAllActiveRuns()).toEqual([
      expect.objectContaining({
        runId: 'run-partial-migration',
        sessionKey: 'session-a',
      }),
    ])

    await appendRunText('session-a', 'run-partial-migration', ' after fallback')
    await markRunStatus('session-a', 'run-partial-migration', 'complete')
    expect(
      await getPersistedRun('session-a', 'run-partial-migration'),
    ).toMatchObject({
      status: 'complete',
      assistantText: 'before handoff after fallback',
    })
    expect(
      await getPersistedRun('session-b', 'run-partial-migration'),
    ).toBeNull()
    expect(await listAllActiveRuns()).toEqual([])
  })

  it('terminalizes the successor when source and rollback unlink both fail', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getActiveRunForSession,
      getPersistedRun,
      listAllActiveRuns,
      migratePersistedRun,
    } = await import('./run-store')

    await createPersistedRun({
      runId: 'run-double-unlink',
      sessionKey: 'session-a',
      friendlyId: 'friendly-a',
    })
    await appendRunText('session-a', 'run-double-unlink', 'before handoff')
    fsPromiseState.rejectedUnlinks = [
      {
        suffix: join('session-a', 'run-double-unlink.json'),
        message: 'forced source unlink failure',
      },
      {
        suffix: join('session-b', 'run-double-unlink.json'),
        message: 'forced rollback unlink failure',
      },
    ]

    const migrationError = await migratePersistedRun(
      'session-a',
      'session-b',
      'run-double-unlink',
      'friendly-b',
    ).catch((error: unknown) => error)
    fsPromiseState.rejectedUnlinks = []

    expect(migrationError).toBeInstanceOf(AggregateError)
    expect((migrationError as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'forced source unlink failure' }),
      expect.objectContaining({ message: 'forced rollback unlink failure' }),
    ])
    expect(await getActiveRunForSession('session-a')).toMatchObject({
      runId: 'run-double-unlink',
      sessionKey: 'session-a',
      status: 'active',
      assistantText: 'before handoff',
    })
    expect(
      await getPersistedRun('session-b', 'run-double-unlink'),
    ).toMatchObject({
      runId: 'run-double-unlink',
      sessionKey: 'session-b',
      status: 'error',
    })
    expect(await getActiveRunForSession('session-b')).toBeNull()
    expect(await listAllActiveRuns()).toEqual([
      expect.objectContaining({
        runId: 'run-double-unlink',
        sessionKey: 'session-a',
      }),
    ])
  })

  it('preserves concurrent updates to the same run', async () => {
    const { addRunLifecycleEvent, createPersistedRun, getPersistedRun } =
      await import('./run-store')

    await createPersistedRun({ runId: 'run-1', sessionKey: 'session-1' })

    const events = Array.from({ length: 24 }, (_, index) => ({
      text: `event-${index}`,
      emoji: '',
      timestamp: index,
      isError: false,
    }))

    await Promise.all(
      events.map((event) => addRunLifecycleEvent('session-1', 'run-1', event)),
    )

    const stored = await getPersistedRun('session-1', 'run-1')
    expect(stored?.lifecycleEvents.map((event) => event.text).sort()).toEqual(
      events.map((event) => event.text).sort(),
    )
  })
})
