import { fork } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChildProcess } from 'node:child_process'
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

function writePersistedRunFixture(
  sessionKey: string,
  runId: string,
  overrides: Record<string, unknown> = {},
): string {
  const dir = join(
    tempHome!,
    'webui-mvp',
    'runs',
    encodeURIComponent(sessionKey || 'main'),
  )
  mkdirSync(dir, { recursive: true })
  const now = Date.now()
  const filePath = join(dir, `${runId}.json`)
  writeFileSync(
    filePath,
    JSON.stringify({
      runId,
      sessionKey,
      friendlyId: sessionKey,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastEventAt: now,
      assistantText: '',
      thinkingText: '',
      toolCalls: [],
      lifecycleEvents: [],
      ...overrides,
    }),
  )
  return filePath
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function waitForWorkerMessage<T>(worker: ChildProcess): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown) => {
      cleanup()
      resolve(message as T)
    }
    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`run-store worker exited before replying (${code})`))
    }
    const cleanup = () => {
      worker.off('message', onMessage)
      worker.off('exit', onExit)
    }
    worker.once('message', onMessage)
    worker.once('exit', onExit)
  })
}

async function startRunStoreWorker(): Promise<ChildProcess> {
  const worker = fork(
    fileURLToPath(
      new URL(
        './test-fixtures/run-store-concurrency-worker.ts',
        import.meta.url,
      ),
    ),
    [],
    {
      env: { ...process.env, HERMES_HOME: tempHome! },
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    },
  )
  await waitForWorkerMessage<{ ready: true }>(worker)
  return worker
}

async function runWorkerCommand<T>(
  worker: ChildProcess,
  command: Record<string, unknown>,
): Promise<T> {
  const response = waitForWorkerMessage<T>(worker)
  worker.send(command)
  return response
}

async function stopRunStoreWorker(worker: ChildProcess): Promise<void> {
  if (!worker.connected) return
  const stopped = waitForWorkerMessage<{ stopped: true }>(worker)
  worker.send({ action: 'stop' })
  await stopped
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
  it('creates run records exclusively instead of replacing a colliding owner', async () => {
    const { createPersistedRun, getPersistedRun } = await import('./run-store')

    await createPersistedRun({
      runId: 'provider-collision',
      sessionKey: 'shared-session',
      friendlyId: 'first-owner',
    })
    await expect(
      createPersistedRun({
        runId: 'provider-collision',
        sessionKey: 'shared-session',
        friendlyId: 'second-owner',
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' })

    await expect(
      getPersistedRun('shared-session', 'provider-collision'),
    ).resolves.toMatchObject({ friendlyId: 'first-owner' })
  })

  it('serializes creation and read-modify-write updates across independent processes', async () => {
    const workers = await Promise.all([
      startRunStoreWorker(),
      startRunStoreWorker(),
    ])
    try {
      const createResults = await Promise.all(
        workers.map((worker, index) =>
          runWorkerCommand<{ ok: boolean; code?: string }>(worker, {
            action: 'create',
            runId: 'cross-process-run',
            sessionKey: 'cross-process-session',
            friendlyId: `owner-${index}`,
          }),
        ),
      )
      expect(createResults.filter((result) => result.ok)).toHaveLength(1)
      expect(
        createResults.filter((result) => result.code === 'EEXIST'),
      ).toHaveLength(1)

      await Promise.all(
        workers.map((worker, index) =>
          runWorkerCommand(worker, {
            action: 'events',
            runId: 'cross-process-run',
            sessionKey: 'cross-process-session',
            prefix: `worker-${index}`,
            count: 20,
          }),
        ),
      )

      const { getPersistedRun } = await import('./run-store')
      const stored = await getPersistedRun(
        'cross-process-session',
        'cross-process-run',
      )
      expect(stored?.lifecycleEvents).toHaveLength(40)
      expect(
        new Set(stored?.lifecycleEvents.map((event) => event.text)),
      ).toEqual(
        new Set(
          workers.flatMap((_, workerIndex) =>
            Array.from(
              { length: 20 },
              (_unused, eventIndex) => `worker-${workerIndex}-${eventIndex}`,
            ),
          ),
        ),
      )
    } finally {
      await Promise.all(workers.map(stopRunStoreWorker))
    }
  })

  it('recovers a lock whose owning process is no longer alive', async () => {
    const { appendRunText, createPersistedRun, getPersistedRun } =
      await import('./run-store')
    await createPersistedRun({ runId: 'dead-lock', sessionKey: 'session-a' })
    writeFileSync(
      join(tempHome!, 'webui-mvp', 'runs', 'session-a', 'dead-lock.json.lock'),
      `${JSON.stringify({
        token: '00000000-0000-4000-8000-000000000000',
        pid: 2_147_483_647,
      })}\n`,
    )

    await appendRunText('session-a', 'dead-lock', 'recovered')

    await expect(
      getPersistedRun('session-a', 'dead-lock'),
    ).resolves.toMatchObject({ status: 'active', assistantText: 'recovered' })
  })

  it('keeps terminal statuses absorbing across independent process writers', async () => {
    const { createPersistedRun, getPersistedRun } = await import('./run-store')
    await createPersistedRun({
      runId: 'terminal-race',
      sessionKey: 'terminal-session',
    })
    const workers = await Promise.all([
      startRunStoreWorker(),
      startRunStoreWorker(),
    ])
    try {
      const results = await Promise.all([
        runWorkerCommand<{ ok: boolean; message?: string }>(workers[0], {
          action: 'status',
          runId: 'terminal-race',
          sessionKey: 'terminal-session',
          status: 'complete',
        }),
        runWorkerCommand<{ ok: boolean; message?: string }>(workers[1], {
          action: 'append-many',
          runId: 'terminal-race',
          sessionKey: 'terminal-session',
          count: 20,
        }),
      ])
      expect(results).toEqual([{ ok: true }, { ok: true }])

      await expect(
        getPersistedRun('terminal-session', 'terminal-race'),
      ).resolves.toMatchObject({ status: 'complete' })
    } finally {
      await Promise.all(workers.map(stopRunStoreWorker))
    }
  })

  it('bounds tool count and fields while allowing retained tools to terminalize', async () => {
    const {
      MAX_PERSISTED_RUN_TOOL_CALLS,
      PERSISTED_TOOL_ARGS_MAX_BYTES,
      PERSISTED_TOOL_RESULT_MAX_BYTES,
      createPersistedRun,
      getPersistedRun,
      upsertRunToolCall,
    } = await import('./run-store')
    await createPersistedRun({
      runId: 'bounded-tools',
      sessionKey: 'session-a',
    })

    for (let index = 0; index < MAX_PERSISTED_RUN_TOOL_CALLS; index += 1) {
      await upsertRunToolCall('session-a', 'bounded-tools', {
        id: `tool-${index}`,
        name: 'read_file',
        phase: 'calling',
        args: { payload: 'a'.repeat(PERSISTED_TOOL_ARGS_MAX_BYTES * 2) },
      })
    }
    await upsertRunToolCall('session-a', 'bounded-tools', {
      id: 'rejected-over-cap',
      name: 'unknown',
      phase: 'calling',
    })
    await upsertRunToolCall('session-a', 'bounded-tools', {
      id: 'tool-0',
      name: 'read_file',
      phase: 'complete',
      result: 'r'.repeat(PERSISTED_TOOL_RESULT_MAX_BYTES * 2),
    })

    const stored = await getPersistedRun('session-a', 'bounded-tools')
    expect(stored?.toolCalls).toHaveLength(MAX_PERSISTED_RUN_TOOL_CALLS)
    expect(stored?.toolCalls.some(({ id }) => id === 'rejected-over-cap')).toBe(
      false,
    )
    expect(stored?.toolCalls[0]).toMatchObject({
      id: 'tool-0',
      phase: 'complete',
    })
    expect(
      Buffer.byteLength(JSON.stringify(stored?.toolCalls[0]?.args), 'utf8'),
    ).toBeLessThanOrEqual(PERSISTED_TOOL_ARGS_MAX_BYTES)
    expect(
      Buffer.byteLength(stored?.toolCalls[0]?.result ?? '', 'utf8'),
    ).toBeLessThanOrEqual(PERSISTED_TOOL_RESULT_MAX_BYTES)
  })

  it('keeps tool-local failures recoverable without copying raw provider errors', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getPersistedRun,
      markRunStatus,
      upsertRunToolCall,
    } = await import('./run-store')
    await createPersistedRun({ runId: 'tool-error', sessionKey: 'session-a' })

    await upsertRunToolCall('session-a', 'tool-error', {
      id: 'failed-tool',
      name: 'shell',
      phase: 'error',
      result: 'secret-token=do-not-persist',
    })

    await appendRunText('session-a', 'tool-error', 'recovered output')
    await markRunStatus('session-a', 'tool-error', 'complete')

    const stored = await getPersistedRun('session-a', 'tool-error')
    expect(JSON.stringify(stored)).not.toContain('secret-token=do-not-persist')
    expect(stored).toMatchObject({
      status: 'complete',
      assistantText: 'recovered output',
      toolCalls: [
        expect.objectContaining({ phase: 'error', result: 'Tool failed.' }),
      ],
    })
    expect(stored).not.toHaveProperty('errorMessage')
  })

  it('redacts successful tool secrets and writes private run files atomically', async () => {
    const { createPersistedRun, getPersistedRun, upsertRunToolCall } =
      await import('./run-store')
    await createPersistedRun({
      runId: 'private-tools',
      sessionKey: 'session-a',
    })

    await upsertRunToolCall('session-a', 'private-tools', {
      id: 'successful-tool',
      name: 'http_request',
      phase: 'complete',
      args: {
        password: 'argument-password-secret',
        nested: { apiKey: 'argument-api-key-secret' },
        header: 'Authorization: Bearer argument-bearer-secret',
        query: 'safe search text',
      },
      preview: 'token=preview-token-secret',
      result:
        '{"access_token":"result-access-token-secret","value":"safe result"}\nX-API-Key: result-api-key-secret',
    })

    const stored = await getPersistedRun('session-a', 'private-tools')
    const serialized = JSON.stringify(stored)
    for (const secret of [
      'argument-password-secret',
      'argument-api-key-secret',
      'argument-bearer-secret',
      'preview-token-secret',
      'result-access-token-secret',
      'result-api-key-secret',
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).toContain('[REDACTED]')
    expect(stored?.toolCalls[0]).toMatchObject({
      phase: 'complete',
      args: { query: 'safe search text' },
    })
    const filePath = join(
      tempHome!,
      'webui-mvp',
      'runs',
      'session-a',
      'private-tools.json',
    )
    expect(statSync(filePath).mode & 0o777).toBe(0o600)
    expect(readFileSync(filePath, 'utf8')).toBe(
      `${JSON.stringify(stored, null, 2)}\n`,
    )
  })

  it('redacts assistant and thinking secrets before fresh state is bounded and written', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getPersistedRun,
      setRunThinking,
    } = await import('./run-store')
    await createPersistedRun({
      runId: 'private-transcript',
      sessionKey: 'session-a',
    })

    await appendRunText(
      'session-a',
      'private-transcript',
      'Authorization: Bearer fresh-assistant-bearer-sentinel',
    )
    await setRunThinking(
      'session-a',
      'private-transcript',
      'password=fresh-thinking-password-sentinel',
    )

    const stored = await getPersistedRun('session-a', 'private-transcript')
    const durable = readFileSync(
      join(
        tempHome!,
        'webui-mvp',
        'runs',
        'session-a',
        'private-transcript.json',
      ),
      'utf8',
    )
    for (const secret of [
      'fresh-assistant-bearer-sentinel',
      'fresh-thinking-password-sentinel',
    ]) {
      expect(JSON.stringify(stored)).not.toContain(secret)
      expect(durable).not.toContain(secret)
    }
    expect(stored?.assistantText).toBe('Authorization: [REDACTED]')
    expect(stored?.thinkingText).toBe('password=[REDACTED]')
  })

  it('keeps heavily escaped run text within the persisted file bound', async () => {
    const {
      MAX_PERSISTED_RUN_FILE_BYTES,
      appendRunText,
      createPersistedRun,
      getPersistedRun,
    } = await import('./run-store')
    await createPersistedRun({ runId: 'escaped-text', sessionKey: 'session-a' })
    await appendRunText(
      'session-a',
      'escaped-text',
      String.raw`"\n`.repeat(MAX_PERSISTED_RUN_FILE_BYTES),
    )

    const filePath = join(
      tempHome!,
      'webui-mvp',
      'runs',
      'session-a',
      'escaped-text.json',
    )
    expect(statSync(filePath).size).toBeLessThanOrEqual(
      MAX_PERSISTED_RUN_FILE_BYTES,
    )
    await expect(
      getPersistedRun('session-a', 'escaped-text'),
    ).resolves.toMatchObject({ status: 'active' })
  })

  it('normalizes, sanitizes, and bounds legacy persisted state on load', async () => {
    const {
      MAX_PERSISTED_RUN_LIFECYCLE_EVENTS,
      MAX_PERSISTED_RUN_TOOL_CALLS,
      PERSISTED_ASSISTANT_TEXT_MAX_BYTES,
      PERSISTED_LIFECYCLE_TEXT_MAX_BYTES,
      PERSISTED_THINKING_TEXT_MAX_BYTES,
      createPersistedRun,
      getPersistedRun,
    } = await import('./run-store')
    await createPersistedRun({ runId: 'legacy-state', sessionKey: 'session-a' })
    const filePath = join(
      tempHome!,
      'webui-mvp',
      'runs',
      'session-a',
      'legacy-state.json',
    )
    const now = Date.now()
    writeFileSync(
      filePath,
      JSON.stringify({
        runId: 'legacy-state',
        sessionKey: 'session-a',
        friendlyId: 'session-a',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastEventAt: now,
        assistantText: `Authorization: Bearer legacy-assistant-bearer-sentinel\n${'a'.repeat(PERSISTED_ASSISTANT_TEXT_MAX_BYTES + 100)}`,
        thinkingText: `password=legacy-thinking-password-sentinel\n${'t'.repeat(PERSISTED_THINKING_TEXT_MAX_BYTES + 100)}`,
        toolCalls: Array.from(
          { length: MAX_PERSISTED_RUN_TOOL_CALLS + 10 },
          (_, index) => ({
            id: `legacy-tool-${index}`,
            name: 'shell',
            phase: 'complete',
            args: { token: `legacy-argument-secret-${index}` },
            result: `password=legacy-result-secret-${index}`,
          }),
        ),
        lifecycleEvents: Array.from(
          { length: MAX_PERSISTED_RUN_LIFECYCLE_EVENTS + 10 },
          (_, index) => ({
            text: `${index}-${'e'.repeat(PERSISTED_LIFECYCLE_TEXT_MAX_BYTES + 100)}`,
            emoji: 'x'.repeat(200),
            timestamp: now + index,
            isError: false,
          }),
        ),
        unknownHostileField: 'must be dropped',
      }),
    )

    const stored = await getPersistedRun('session-a', 'legacy-state')
    expect(stored).not.toBeNull()
    expect(
      Buffer.byteLength(stored?.assistantText ?? '', 'utf8'),
    ).toBeLessThanOrEqual(PERSISTED_ASSISTANT_TEXT_MAX_BYTES)
    expect(
      Buffer.byteLength(stored?.thinkingText ?? '', 'utf8'),
    ).toBeLessThanOrEqual(PERSISTED_THINKING_TEXT_MAX_BYTES)
    expect(stored?.toolCalls).toHaveLength(MAX_PERSISTED_RUN_TOOL_CALLS)
    expect(stored?.lifecycleEvents).toHaveLength(
      MAX_PERSISTED_RUN_LIFECYCLE_EVENTS,
    )
    expect(
      Buffer.byteLength(stored?.lifecycleEvents[0]?.text ?? '', 'utf8'),
    ).toBeLessThanOrEqual(PERSISTED_LIFECYCLE_TEXT_MAX_BYTES)
    expect(JSON.stringify(stored)).not.toContain('legacy-argument-secret')
    expect(JSON.stringify(stored)).not.toContain('legacy-result-secret')
    expect(JSON.stringify(stored)).not.toContain(
      'legacy-assistant-bearer-sentinel',
    )
    expect(JSON.stringify(stored)).not.toContain(
      'legacy-thinking-password-sentinel',
    )
    expect(stored?.assistantText).toContain('Authorization: [REDACTED]')
    expect(stored?.thinkingText).toContain('password=[REDACTED]')
    expect(stored).not.toHaveProperty('unknownHostileField')
  })

  it('skips malformed and oversized state during concurrent Card scans', async () => {
    const {
      MAX_PERSISTED_RUN_FILE_BYTES,
      createPersistedRun,
      getActiveRunForCard,
      getPersistedRun,
    } = await import('./run-store')
    await createPersistedRun({
      runId: 'valid-card-run',
      sessionKey: 'remote:valid',
      friendlyId: 'card-a',
      cardId: 'card-a',
      canonicalSegmentKey: 'remote:valid',
    })
    await createPersistedRun({
      runId: 'oversized-run',
      sessionKey: 'remote:oversized',
      friendlyId: 'card-a',
      cardId: 'card-a',
      canonicalSegmentKey: 'remote:oversized',
    })
    const oversizedPath = join(
      tempHome!,
      'webui-mvp',
      'runs',
      'remote%3Aoversized',
      'oversized-run.json',
    )
    writeFileSync(oversizedPath, 'x'.repeat(MAX_PERSISTED_RUN_FILE_BYTES + 1))
    await createPersistedRun({
      runId: 'malformed-run',
      sessionKey: 'remote:malformed',
    })
    writeFileSync(
      join(
        tempHome!,
        'webui-mvp',
        'runs',
        'remote%3Amalformed',
        'malformed-run.json',
      ),
      JSON.stringify({
        runId: 'malformed-run',
        sessionKey: 'remote:malformed',
      }),
    )

    await expect(
      getPersistedRun('remote:oversized', 'oversized-run'),
    ).resolves.toBeNull()
    await expect(
      Promise.all(
        Array.from({ length: 16 }, () =>
          getActiveRunForCard('card-a', 'remote:valid'),
        ),
      ),
    ).resolves.toEqual(
      Array.from({ length: 16 }, () =>
        expect.objectContaining({ runId: 'valid-card-run' }),
      ),
    )
  })

  it('fails Card recovery closed when the runs root exceeds its directory-entry limit', async () => {
    const {
      MAX_PERSISTED_RUN_DIRECTORY_ENTRIES,
      createPersistedRun,
      getActiveRunForCard,
    } = await import('./run-store')
    await createPersistedRun({
      runId: 'bounded-directory-target',
      sessionKey: 'remote:bounded-directory-target',
      friendlyId: 'bounded-card',
      cardId: 'bounded-card',
      canonicalSegmentKey: 'remote:bounded-directory-target',
    })
    const runsRoot = join(tempHome!, 'webui-mvp', 'runs')
    for (
      let index = 0;
      index < MAX_PERSISTED_RUN_DIRECTORY_ENTRIES;
      index += 1
    ) {
      mkdirSync(join(runsRoot, `hostile-directory-${index}`))
    }

    await expect(
      getActiveRunForCard('bounded-card', 'remote:bounded-directory-target'),
    ).resolves.toBeNull()
  })

  it('fails Card recovery closed when a session exceeds the global file-entry limit', async () => {
    const {
      MAX_PERSISTED_RUN_FILE_ENTRIES,
      createPersistedRun,
      getActiveRunForCard,
    } = await import('./run-store')
    await createPersistedRun({
      runId: 'bounded-file-target',
      sessionKey: 'remote:bounded-file-target',
      friendlyId: 'bounded-card',
      cardId: 'bounded-card',
      canonicalSegmentKey: 'remote:bounded-file-target',
    })
    const dir = join(
      tempHome!,
      'webui-mvp',
      'runs',
      'remote%3Abounded-file-target',
    )
    for (let index = 0; index < MAX_PERSISTED_RUN_FILE_ENTRIES; index += 1) {
      writeFileSync(join(dir, `hostile-entry-${index}.tmp`), '')
    }

    await expect(
      getActiveRunForCard('bounded-card', 'remote:bounded-file-target'),
    ).resolves.toBeNull()
  })

  it('fails Card recovery closed when candidate reads exceed the aggregate byte limit', async () => {
    const {
      MAX_PERSISTED_RUN_FILE_BYTES,
      MAX_PERSISTED_RUN_TREE_BYTES,
      createPersistedRun,
      getActiveRunForCard,
    } = await import('./run-store')
    await createPersistedRun({
      runId: 'bounded-byte-target',
      sessionKey: 'remote:bounded-byte-target',
      friendlyId: 'bounded-card',
      cardId: 'bounded-card',
      canonicalSegmentKey: 'remote:bounded-byte-target',
    })
    const dir = join(
      tempHome!,
      'webui-mvp',
      'runs',
      'remote%3Abounded-byte-target',
    )
    const hostileFileCount =
      Math.floor(MAX_PERSISTED_RUN_TREE_BYTES / MAX_PERSISTED_RUN_FILE_BYTES) +
      1
    const hostilePayload = ' '.repeat(MAX_PERSISTED_RUN_FILE_BYTES)
    for (let index = 0; index < hostileFileCount; index += 1) {
      writeFileSync(join(dir, `hostile-byte-run-${index}.json`), hostilePayload)
    }

    await expect(
      getActiveRunForCard('bounded-card', 'remote:bounded-byte-target'),
    ).resolves.toBeNull()
  })

  it('fails Card recovery closed instead of dropping valid runs past the retained-result limit', async () => {
    const { MAX_PERSISTED_RUN_RESULTS, getActiveRunForCard } =
      await import('./run-store')
    writePersistedRunFixture(
      'remote:bounded-results',
      'bounded-result-target',
      {
        friendlyId: 'bounded-card',
        cardId: 'bounded-card',
        canonicalSegmentKey: 'remote:bounded-results',
      },
    )
    for (let index = 0; index < MAX_PERSISTED_RUN_RESULTS; index += 1) {
      writePersistedRunFixture(
        'remote:bounded-results',
        `hostile-result-${index}`,
      )
    }

    await expect(
      getActiveRunForCard('bounded-card', 'remote:bounded-results'),
    ).resolves.toBeNull()
  })

  it('reclaims a lock whose live PID belongs to a different process identity', async () => {
    const { appendRunText, createPersistedRun, getPersistedRun } =
      await import('./run-store')
    await createPersistedRun({
      runId: 'reused-pid-lock',
      sessionKey: 'session-a',
    })
    writeFileSync(
      join(
        tempHome!,
        'webui-mvp',
        'runs',
        'session-a',
        'reused-pid-lock.json.lock',
      ),
      `${JSON.stringify({
        token: '00000000-0000-4000-8000-000000000000',
        pid: process.pid,
        processIdentity: 'linux:impossible-reused-process',
        leaseUntil: Date.now() + 60_000,
      })}\n`,
    )

    await appendRunText('session-a', 'reused-pid-lock', 'reclaimed')
    await expect(
      getPersistedRun('session-a', 'reused-pid-lock'),
    ).resolves.toMatchObject({ assistantText: 'reclaimed' })
  })

  it('reclaims an expired lease when a legacy PID cannot prove ownership', async () => {
    const { appendRunText, createPersistedRun, getPersistedRun } =
      await import('./run-store')
    await createPersistedRun({
      runId: 'expired-lease-lock',
      sessionKey: 'session-a',
    })
    writeFileSync(
      join(
        tempHome!,
        'webui-mvp',
        'runs',
        'session-a',
        'expired-lease-lock.json.lock',
      ),
      `${JSON.stringify({
        token: '00000000-0000-4000-8000-000000000000',
        pid: process.pid,
        leaseUntil: Date.now() - 1,
      })}\n`,
    )

    await appendRunText('session-a', 'expired-lease-lock', 'reclaimed')
    await expect(
      getPersistedRun('session-a', 'expired-lease-lock'),
    ).resolves.toMatchObject({ assistantText: 'reclaimed' })
  })

  it('does not evict a confirmed live lock owner when its lease timestamp is stale', async () => {
    const { appendRunText, createPersistedRun } = await import('./run-store')
    await createPersistedRun({
      runId: 'live-owner-lock',
      sessionKey: 'session-a',
    })
    const processStat = readFileSync(`/proc/${process.pid}/stat`, 'utf8')
    const processIdentity = `linux:${
      processStat.slice(processStat.lastIndexOf(') ') + 2).split(' ')[19]
    }`
    const lockPath = join(
      tempHome!,
      'webui-mvp',
      'runs',
      'session-a',
      'live-owner-lock.json.lock',
    )
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        token: '00000000-0000-4000-8000-000000000000',
        pid: process.pid,
        processIdentity,
        leaseUntil: Date.now() - 1,
      })}\n`,
    )

    let settled = false
    const blockedUpdate = appendRunText(
      'session-a',
      'live-owner-lock',
      'write after release',
    ).finally(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(settled).toBe(false)
    expect(existsSync(lockPath)).toBe(true)
    unlinkSync(lockPath)
    await expect(blockedUpdate).resolves.toMatchObject({
      assistantText: 'write after release',
    })
  }, 5_000)

  it('keeps true run-level errors terminal after later updates', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getPersistedRun,
      markRunStatus,
      upsertRunToolCall,
    } = await import('./run-store')
    await createPersistedRun({ runId: 'run-error', sessionKey: 'session-a' })
    await markRunStatus('session-a', 'run-error', 'error', 'stream failed')
    await upsertRunToolCall('session-a', 'run-error', {
      id: 'late-tool',
      name: 'shell',
      phase: 'complete',
      result: 'late result',
    })
    await appendRunText('session-a', 'run-error', 'late text')

    await expect(
      getPersistedRun('session-a', 'run-error'),
    ).resolves.toMatchObject({
      status: 'error',
      errorMessage: 'stream failed',
      assistantText: '',
      toolCalls: [],
    })
  })

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
