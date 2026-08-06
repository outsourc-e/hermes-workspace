import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

type ArtifactFunction = (...args: Array<unknown>) => unknown

type SessionCardServiceBoundary = {
  resolveCard: ArtifactFunction
  resolveChildCard: ArtifactFunction
  observeCardActivity: ArtifactFunction
  observeChildLifecycle: ArtifactFunction
}

type ElectronArtifactBoundaries = {
  appendLocalMessage: ArtifactFunction
  ensureGatewayProbed: ArtifactFunction
  ensureLocalSession: ArtifactFunction
  execFile: ArtifactFunction
  loadWorkspaceCatalog: ArtifactFunction
  openaiChat: ArtifactFunction
  readWorkerMessages: ArtifactFunction
  streamChat: ArtifactFunction
  streamResponses: ArtifactFunction
}

type ElectronServerArtifact = {
  default: {
    fetch: (request: Request) => Promise<Response>
  }
  __artifactContract: {
    initializeRoutes: () => void
    replaceBoundaries: (boundaries: ElectronArtifactBoundaries) => void
    replaceSessionCardService: (service: SessionCardServiceBoundary) => void
  }
}

function loadExecutableElectronArtifact(): ElectronServerArtifact {
  const bundlePath = resolve(process.cwd(), 'electron/server-bundle.cjs')
  const bundle = readFileSync(bundlePath, 'utf8')
  const instrumented = `${bundle}
;module.exports.__artifactContract = {
  initializeRoutes() {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Electron artifact initialization network disabled');
    };
    try {
      init_router_g_zt8Hls();
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
  replaceSessionCardService(service) {
    sessionCardService = service;
  },
  replaceBoundaries(boundaries) {
    appendLocalMessage = boundaries.appendLocalMessage;
    ensureGatewayProbed = boundaries.ensureGatewayProbed;
    ensureLocalSession = boundaries.ensureLocalSession;
    import_node_child_process = {
      ...import_node_child_process,
      execFile: boundaries.execFile,
    };
    loadWorkspaceCatalog = boundaries.loadWorkspaceCatalog;
    openaiChat = boundaries.openaiChat;
    readWorkerMessages = boundaries.readWorkerMessages;
    streamChat = boundaries.streamChat;
    streamResponses = boundaries.streamResponses;
  },
};
`
  const runtimeDir = mkdtempSync(
    resolve(process.cwd(), '.electron-artifact-contract-'),
  )
  const runtimePath = resolve(runtimeDir, 'server-bundle.cjs')
  writeFileSync(runtimePath, instrumented)
  try {
    const loaded = createRequire(import.meta.url)(
      runtimePath,
    ) as ElectronServerArtifact
    // Materialize route-level singletons directly through the generated router
    // initializer. This keeps the harness deterministic without issuing a warm-up
    // HTTP request or touching a provider boundary.
    loaded.__artifactContract.initializeRoutes()
    return loaded
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true })
  }
}

const artifact = loadExecutableElectronArtifact()
const localCardId = 'local:builder-card'
const localSegmentKey = 'local:builder'
const localCardBinding = {
  kind: 'session-card-owner',
  cardId: localCardId,
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: localSegmentKey,
  canonicalTransport: 'tmux',
}

function resolvedLocalCard(cardId = localCardId) {
  return {
    card: {
      cardId,
      canonicalSource: 'local',
      title: 'Builder Card',
      titleSource: 'manual',
      canonicalSegmentKey: localSegmentKey,
      continuationSegmentKeys: [cardId, localSegmentKey],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 10,
      archived: false,
      pinned: false,
    },
    aliases: [cardId],
    sourceBySegmentKey: new Map([[localSegmentKey, 'local']]),
    upstreamKeyBySegmentKey: new Map([[localSegmentKey, 'builder']]),
    pinEligible: false,
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

function directChatRequest() {
  return new Request('http://workspace.test/api/swarm-direct-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workerId: 'builder',
      prompt: 'Run the generated artifact check',
      cardBinding: localCardBinding,
      limit: 30,
      timeoutMs: 1_000,
    }),
  })
}

function sendStreamRequest() {
  return new Request('http://workspace.test/api/send-stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cardId: localCardId,
      sessionKey: localSegmentKey,
      friendlyId: localCardId,
      message: 'Do not reach a provider after rollover',
    }),
  })
}

function successfulExecFile(
  _command: unknown,
  _args: unknown,
  optionsOrCallback: unknown,
  maybeCallback?: unknown,
) {
  const callback =
    typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
  queueMicrotask(() => {
    if (typeof callback === 'function') callback(null, '', '')
  })
  return { stdin: { end: vi.fn() } }
}

function workerMessagesWithImmediateReply() {
  const baseline = {
    id: 'baseline',
    role: 'assistant',
    content: 'Earlier output',
    timestamp: 1,
  }
  let reads = 0
  return () => {
    reads += 1
    return {
      sessionId: 'private-worker-session',
      sessionTitle: 'Private worker session',
      messages:
        reads === 1
          ? [baseline]
          : [
              baseline,
              {
                id: 'user-echo',
                role: 'user',
                content: 'Run the generated artifact check',
                timestamp: 2,
              },
              {
                id: 'assistant-reply',
                role: 'assistant',
                content: 'Done',
                timestamp: 3,
              },
            ],
      ok: true,
    }
  }
}

describe('checked-in Electron server bundle behavior', () => {
  const providerActions = {
    openaiChat: vi.fn(),
    streamChat: vi.fn(),
    streamResponses: vi.fn(),
  }
  const localStoreActions = {
    appendLocalMessage: vi.fn(),
    ensureLocalSession: vi.fn(),
  }
  const execFile = vi.fn(successfulExecFile)

  beforeEach(() => {
    vi.clearAllMocks()
    artifact.__artifactContract.replaceBoundaries({
      appendLocalMessage: localStoreActions.appendLocalMessage,
      ensureGatewayProbed: vi.fn().mockResolvedValue(undefined),
      ensureLocalSession: localStoreActions.ensureLocalSession,
      execFile,
      loadWorkspaceCatalog: vi.fn().mockResolvedValue(null),
      openaiChat: providerActions.openaiChat,
      readWorkerMessages: workerMessagesWithImmediateReply(),
      streamChat: providerActions.streamChat,
      streamResponses: providerActions.streamResponses,
    })
  })

  it('rejects local Card rollover at the send mutation edge before provider dispatch', async () => {
    const resolveCard = vi
      .fn()
      .mockResolvedValueOnce(resolvedLocalCard())
      .mockResolvedValueOnce(resolvedLocalCard())
      .mockResolvedValueOnce(resolvedLocalCard('local:rolled-over-card'))
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard,
      resolveChildCard: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })

    const response = await artifact.default.fetch(sendStreamRequest())
    const responsePayload = await response.json()

    expect(resolveCard).toHaveBeenCalledTimes(3)
    expect({ status: response.status, payload: responsePayload }).toEqual({
      status: 409,
      payload: {
        ok: false,
        error: 'Session Card ownership changed before send',
      },
    })
    expect(localStoreActions.ensureLocalSession).toHaveBeenCalledOnce()
    expect(localStoreActions.appendLocalMessage).toHaveBeenCalledOnce()
    expect(providerActions.openaiChat).not.toHaveBeenCalled()
    expect(providerActions.streamResponses).not.toHaveBeenCalled()
    expect(providerActions.streamChat).not.toHaveBeenCalled()
  })

  it('rejects direct-chat rollover before any tmux mutation in the generated route', async () => {
    const resolveCard = vi
      .fn()
      .mockResolvedValueOnce(resolvedLocalCard())
      .mockResolvedValueOnce(resolvedLocalCard('local:rolled-over-card'))
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard,
      resolveChildCard: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })

    const response = await artifact.default.fetch(directChatRequest())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      cardOwner: {
        kind: 'session-card-owner',
        cardId: localCardId,
        parentCardId: null,
      },
      delivered: false,
      error: 'Unable to deliver the worker message',
    })
    expect(resolveCard).toHaveBeenCalledTimes(2)
    const tmuxArgs = execFile.mock.calls.map((call) => call[1])
    expect(tmuxArgs).toEqual([['has-session', '-t', 'swarm-builder']])
    expect(
      tmuxArgs.some(
        (args) =>
          Array.isArray(args) &&
          (args[0] === 'new-session' ||
            args[0] === 'load-buffer' ||
            args[0] === 'paste-buffer' ||
            args.includes('C-u') ||
            args.includes('Enter')),
      ),
    ).toBe(false)
  })

  it('executes the generated positive direct-chat path when Card ownership stays exact', async () => {
    const resolveCard = vi.fn().mockResolvedValue(resolvedLocalCard())
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard,
      resolveChildCard: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })

    const response = await artifact.default.fetch(directChatRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      cardOwner: {
        kind: 'session-card-owner',
        cardId: localCardId,
        parentCardId: null,
      },
      delivered: true,
      delivery: 'tmux',
    })
    const tmuxArgs = execFile.mock.calls.map((call) => call[1])
    expect(tmuxArgs).toEqual([
      ['has-session', '-t', 'swarm-builder'],
      ['load-buffer', '-b', 'swarm-direct-chat-builder', '-'],
      ['send-keys', '-t', 'swarm-builder', 'C-u'],
      [
        'paste-buffer',
        '-d',
        '-b',
        'swarm-direct-chat-builder',
        '-t',
        'swarm-builder',
      ],
      ['send-keys', '-t', 'swarm-builder', 'Enter'],
    ])
  })
})
