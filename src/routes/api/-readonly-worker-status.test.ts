import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

type FakeStats = {
  isSymbolicLink: () => boolean
  isFile: () => boolean
}

type FakeFs = {
  lstat: ReturnType<typeof vi.fn>
  readFile: ReturnType<typeof vi.fn>
}

function stats({ symlink = false, file = true } = {}): FakeStats {
  return {
    isSymbolicLink: () => symlink,
    isFile: () => file,
  }
}

function fakeFs(raw: string, fakeStats: FakeStats = stats()): FakeFs {
  return {
    lstat: vi.fn().mockResolvedValue(fakeStats),
    readFile: vi.fn().mockResolvedValue(raw),
  }
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

afterEach(() => {
  delete process.env.HERMES_PASSWORD
  delete process.env.CLAUDE_PASSWORD
  vi.restoreAllMocks()
})

describe('/api/readonly-worker-status hardening', () => {
  it('returns 401 for unauthenticated requests', async () => {
    process.env.HERMES_PASSWORD = 'required'
    const { handleReadonlyWorkerStatusGet } = await import('./readonly-worker-status')
    const fs = fakeFs('{"status":"ok"}')

    const response = await handleReadonlyWorkerStatusGet(
      new Request('http://localhost/api/readonly-worker-status'),
      fs,
    )

    expect(response.status).toBe(401)
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      error: 'Unauthorized',
    })
    expect(fs.lstat).not.toHaveBeenCalled()
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('missing status file returns safe unavailable DTO', async () => {
    const { handleReadonlyWorkerStatusGet } = await import('./readonly-worker-status')
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const fs: FakeFs = {
      lstat: vi.fn().mockRejectedValue(missing),
      readFile: vi.fn(),
    }

    const response = await handleReadonlyWorkerStatusGet(
      new Request('http://localhost/api/readonly-worker-status'),
      fs,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(404)
    expect(body).toMatchObject({
      ok: false,
      status: 'unavailable',
      message: 'readonly worker status unavailable',
    })
    expect(JSON.stringify(body)).not.toMatch(/readonly-worker-status\.json|\/root|\.json/i)
  })

  it('rejects symlink before read', async () => {
    const { handleReadonlyWorkerStatusGet } = await import('./readonly-worker-status')
    const fs = fakeFs('{"status":"ok"}', stats({ symlink: true, file: true }))

    const response = await handleReadonlyWorkerStatusGet(
      new Request('http://localhost/api/readonly-worker-status'),
      fs,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(409)
    expect(fs.readFile).not.toHaveBeenCalled()
    expect(body).toMatchObject({
      ok: false,
      status: 'error',
      message: 'readonly worker status error',
    })
  })

  it('rejects non-regular file as unavailable before read', async () => {
    const { handleReadonlyWorkerStatusGet } = await import('./readonly-worker-status')
    const fs = fakeFs('{"status":"ok"}', stats({ symlink: false, file: false }))

    const response = await handleReadonlyWorkerStatusGet(
      new Request('http://localhost/api/readonly-worker-status'),
      fs,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(404)
    expect(fs.readFile).not.toHaveBeenCalled()
    expect(body).toMatchObject({
      ok: false,
      status: 'unavailable',
      message: 'readonly worker status unavailable',
    })
  })

  it('handles invalid JSON safely', async () => {
    const { handleReadonlyWorkerStatusGet } = await import('./readonly-worker-status')
    const fs = fakeFs('{ invalid json')

    const response = await handleReadonlyWorkerStatusGet(
      new Request('http://localhost/api/readonly-worker-status'),
      fs,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      ok: false,
      status: 'error',
      message: 'readonly worker status error',
    })
    expect(JSON.stringify(body)).not.toMatch(/invalid json|SyntaxError|readonly-worker-status\.json|\/root/i)
  })

  it('valid JSON returns only whitelisted DTO fields', async () => {
    const { handleReadonlyWorkerStatusGet } = await import('./readonly-worker-status')
    const fs = fakeFs(
      JSON.stringify({
        status: 'ok',
        generatedAt: new Date().toISOString(),
        workerDecision: 'refused',
        reportComplete: true,
        mountReadOnly: true,
        targetInspected: false,
        contentsRead: false,
        filesWritten: 0,
        queueMetadataUpdated: false,
        externalMessagesSent: false,
        dispatcherStarted: false,
        swarmStarted: false,
        lockClean: true,
        redactionApplied: true,
        journal: ['raw journal'],
        path: '/root/private/path',
        filename: 'readonly-worker-status.json',
      }),
    )

    const response = await handleReadonlyWorkerStatusGet(
      new Request('http://localhost/api/readonly-worker-status'),
      fs,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(
      [
        'contentsRead',
        'dispatcherStarted',
        'externalMessagesSent',
        'filesWritten',
        'generatedAt',
        'isStale',
        'lockClean',
        'message',
        'mountReadOnly',
        'ok',
        'queueMetadataUpdated',
        'redactionApplied',
        'reportComplete',
        'stalenessSeconds',
        'status',
        'swarmStarted',
        'targetInspected',
        'workerDecision',
      ].sort(),
    )
    expect(body).not.toHaveProperty('journal')
    expect(body).not.toHaveProperty('path')
    expect(body).not.toHaveProperty('filename')
  })

  it('does not return raw source.message or source.summary', async () => {
    const { handleReadonlyWorkerStatusGet } = await import('./readonly-worker-status')
    const fs = fakeFs(
      JSON.stringify({
        status: 'ok',
        generatedAt: new Date().toISOString(),
        message: 'raw /root/.hermes/runtime/readonly-worker-status.json stack Trace: boom',
        summary: 'raw journal child.md queue authority contents',
      }),
    )

    const response = await handleReadonlyWorkerStatusGet(
      new Request('http://localhost/api/readonly-worker-status'),
      fs,
    )
    const body = await responseJson(response)
    const serialized = JSON.stringify(body)

    expect(body.message).toBe('readonly worker status ok')
    expect(serialized).not.toMatch(/\/root|\.json|\.md|journal|Trace|stack|queue authority|readonly-worker-status/i)
  })

  it('does not accept query or path override for the fixed status path', async () => {
    const { READONLY_WORKER_STATUS_FILE, handleReadonlyWorkerStatusGet } = await import(
      './readonly-worker-status'
    )
    const fs = fakeFs('{"status":"ok"}')

    await handleReadonlyWorkerStatusGet(
      new Request(
        'http://localhost/api/readonly-worker-status?path=/tmp/evil.json&file=/tmp/other.json',
      ),
      fs,
    )

    expect(fs.lstat).toHaveBeenCalledWith(READONLY_WORKER_STATUS_FILE)
    expect(fs.readFile).toHaveBeenCalledWith(READONLY_WORKER_STATUS_FILE, 'utf8')
    expect(READONLY_WORKER_STATUS_FILE).toBe(
      '/root/.hermes/runtime/readonly-worker-status.json',
    )
  })

  it('handler source does not trigger worker, extractor, Kanban, Obsidian, queue, or authority mutation modules', async () => {
    const source = await readFile('src/routes/api/readonly-worker-status.ts', 'utf8')

    expect(source).not.toMatch(/worker\.(run|start)|extractor\.(run|start)|dispatcher\.(run|start)/i)
    expect(source).not.toMatch(/from ['"].*(kanban|obsidian|queue|authority|worker|extractor)/i)
    expect(source).not.toMatch(/writeFile|appendFile|unlink|rm\(|rename\(|mkdir/i)
  })
})
