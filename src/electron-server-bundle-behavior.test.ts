import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

type ArtifactFunction = (...args: Array<unknown>) => unknown

type SessionCardServiceBoundary = {
  resolveCard: ArtifactFunction
  resolveChildCard: ArtifactFunction
  resolveLocalCardByUpstreamSession?: ArtifactFunction
  resolveRemoteCardByUpstreamSession?: ArtifactFunction
  observeCardActivity: ArtifactFunction
  observeChildLifecycle: ArtifactFunction
}

type ElectronArtifactBoundaries = {
  abandonActiveCardRun: ArtifactFunction
  appendLocalMessage: ArtifactFunction
  appendRunText: ArtifactFunction
  appendSwarmMemoryEvent: ArtifactFunction
  createPersistedRun: ArtifactFunction
  dashboardFetch: ArtifactFunction
  dispatchSwarmAssignments: ArtifactFunction
  dispatchPromptToLiveSession: ArtifactFunction
  ensureGatewayProbed: ArtifactFunction
  ensureLocalSession: ArtifactFunction
  execFile: ArtifactFunction
  getLocalMessages: ArtifactFunction
  getSwarmProfilePath: ArtifactFunction
  listAllActiveRuns: ArtifactFunction
  loadWorkspaceCatalog: ArtifactFunction
  markCheckpointResult: ArtifactFunction
  markDispatchResult: ArtifactFunction
  markDispatchStarted: ArtifactFunction
  markRunStatus: ArtifactFunction
  openaiChat: ArtifactFunction
  publishCardActivityEvent: ArtifactFunction
  publishSwarmCheckpointNotification: ArtifactFunction
  readRuntimeCheckpointSnapshot: ArtifactFunction
  readWorkerMessages: ArtifactFunction
  recordMissionCheckpoint: ArtifactFunction
  registerActiveSendRun: ArtifactFunction
  requireLocalOrAuth: ArtifactFunction
  resetSwarmWorkerRuntime: ArtifactFunction
  streamChat: ArtifactFunction
  streamResponses: ArtifactFunction
  touchLocalSession: ArtifactFunction
  unregisterActiveSendRun: ArtifactFunction
}

type ElectronServerArtifact = {
  default: {
    fetch: (request: Request) => Promise<Response>
  }
  __artifactContract: {
    createAtomicMission: ArtifactFunction
    getMission: ArtifactFunction
    getMissionAuthorityBindings: ArtifactFunction
    initializeRoutes: () => void
    runDispatchWorker: (...args: Array<unknown>) => Promise<unknown>
    setMissionStorePath: (path: string) => void
    replaceBoundaries: (boundaries: ElectronArtifactBoundaries) => void
    replaceSessionCardService: (service: SessionCardServiceBoundary) => void
  }
}

function loadExecutableElectronArtifact(): ElectronServerArtifact {
  const bundlePath = resolve(process.cwd(), 'electron/server-bundle.cjs')
  const bundle = readFileSync(bundlePath, 'utf8')
  const routerInitializer = /var (init_router_[A-Za-z0-9_]+) = __esm\(/u.exec(
    bundle,
  )?.[1]
  if (!routerInitializer) {
    throw new Error('Generated Electron artifact router initializer not found')
  }
  const dispatchDelivery = [
    ...bundle.matchAll(
      /async function (sendPromptToLiveSession(?:\$\d+)?)\(workerId, prompt, cardBinding\)/gu,
    ),
  ].find((match) => {
    const start = match.index
    const end = bundle.indexOf('\nfunction buildHermesChatQueryArgs', start)
    return bundle.slice(start, end).includes('swarm-dispatch-${workerId}')
  })?.[1]
  if (!dispatchDelivery) {
    throw new Error('Generated Electron artifact Swarm dispatcher not found')
  }
  const instrumented = `${bundle}
;module.exports.__artifactContract = {
  createAtomicMission(input) {
    return createSwarmMissionWithCardAuthorities(input);
  },
  getMission(missionId) {
    return getSwarmMission(missionId);
  },
  getMissionAuthorityBindings(missionId) {
    return getSwarmMissionCardAuthorityBindings(missionId);
  },
  initializeRoutes() {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Electron artifact initialization network disabled');
    };
    try {
      ${routerInitializer}();
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
  replaceSessionCardService(service) {
    sessionCardService = service;
  },
  runDispatchWorker(...args) {
    return runWorker(...args);
  },
  setMissionStorePath(path) {
    SWARM_MISSIONS_PATH = path;
  },
  replaceBoundaries(boundaries) {
    abandonActiveCardRun = boundaries.abandonActiveCardRun;
    appendLocalMessage = boundaries.appendLocalMessage;
    appendRunText = boundaries.appendRunText;
    appendSwarmMemoryEvent = boundaries.appendSwarmMemoryEvent;
    createPersistedRun = boundaries.createPersistedRun;
    dashboardFetch$1 = boundaries.dashboardFetch;
    dispatchSwarmAssignments = boundaries.dispatchSwarmAssignments;
    ${dispatchDelivery} = boundaries.dispatchPromptToLiveSession;
    ensureGatewayProbed = boundaries.ensureGatewayProbed;
    ensureLocalSession = boundaries.ensureLocalSession;
    import_node_child_process = {
      ...import_node_child_process,
      execFile: boundaries.execFile,
    };
    getLocalMessages = boundaries.getLocalMessages;
    getSwarmProfilePath = boundaries.getSwarmProfilePath;
    listAllActiveRuns = boundaries.listAllActiveRuns;
    loadWorkspaceCatalog = boundaries.loadWorkspaceCatalog;
    markCheckpointResult = boundaries.markCheckpointResult;
    markDispatchResult = boundaries.markDispatchResult;
    markDispatchStarted = boundaries.markDispatchStarted;
    markRunStatus = boundaries.markRunStatus;
    openaiChat = boundaries.openaiChat;
    publishCardActivityEvent = boundaries.publishCardActivityEvent;
    publishSwarmCheckpointNotification = boundaries.publishSwarmCheckpointNotification;
    readRuntimeCheckpointSnapshot = boundaries.readRuntimeCheckpointSnapshot;
    readWorkerMessages = boundaries.readWorkerMessages;
    recordMissionCheckpoint = boundaries.recordMissionCheckpoint;
    registerActiveSendRun = boundaries.registerActiveSendRun;
    requireLocalOrAuth = boundaries.requireLocalOrAuth;
    resetSwarmWorkerRuntime = boundaries.resetSwarmWorkerRuntime;
    streamChat = boundaries.streamChat;
    streamResponses = boundaries.streamResponses;
    touchLocalSession = boundaries.touchLocalSession;
    unregisterActiveSendRun = boundaries.unregisterActiveSendRun;
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
const artifactStateDir = mkdtempSync(
  resolve(process.cwd(), '.electron-artifact-state-'),
)
const missionStorePath = resolve(artifactStateDir, 'swarm-missions.json')
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
const remoteCardId = 'remote:mission-card'
const remoteSegmentKey = 'remote:private-upstream-tip'
const remoteCardBinding = {
  kind: 'session-card-owner',
  cardId: remoteCardId,
  parentCardId: null,
  canonicalSource: 'remote',
  canonicalSegmentKey: remoteSegmentKey,
  canonicalTransport: 'gateway',
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

function resolvedLocalWorkerCard(workerId: string) {
  const cardId = `local:${workerId}-card`
  const segmentKey = `local:${workerId}`
  return {
    card: {
      cardId,
      canonicalSource: 'local',
      title: `${workerId} Card`,
      titleSource: 'manual',
      canonicalSegmentKey: segmentKey,
      continuationSegmentKeys: [cardId, segmentKey],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 10,
      archived: false,
      pinned: false,
    },
    aliases: [cardId],
    sourceBySegmentKey: new Map([[segmentKey, 'local']]),
    upstreamKeyBySegmentKey: new Map([[segmentKey, workerId]]),
    pinEligible: false,
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

function resolvedRemoteCard(cardId = remoteCardId) {
  return {
    card: {
      cardId,
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      title: 'Mission Card',
      titleSource: 'manual',
      canonicalSegmentKey: remoteSegmentKey,
      continuationSegmentKeys: [cardId, remoteSegmentKey],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 10,
      archived: false,
      pinned: false,
    },
    aliases: [cardId],
    sourceBySegmentKey: new Map([[remoteSegmentKey, 'remote']]),
    upstreamKeyBySegmentKey: new Map([
      [remoteSegmentKey, 'private-upstream-tip'],
    ]),
    pinEligible: true,
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

function resolvedRemoteChildCard(includeHistoricalSegment = true) {
  const continuationSegmentKeys = includeHistoricalSegment
    ? ['remote:child-card', 'remote:child-old', 'remote:child-tip']
    : ['remote:child-card', 'remote:child-tip']
  return {
    card: {
      cardId: 'remote:child-card',
      parentCardId: 'remote:parent-card',
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      title: 'Child Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:child-tip',
      continuationSegmentKeys,
      continuationCount: continuationSegmentKeys.length,
      relationshipKind: 'child',
      childNodes: [],
      updatedAt: 10,
      archived: false,
      pinned: false,
    },
    aliases: ['remote:child-card'],
    sourceBySegmentKey: new Map([
      ['remote:child-old', 'remote'],
      ['remote:child-tip', 'remote'],
    ]),
    upstreamKeyBySegmentKey: new Map([
      ['remote:child-old', 'child-old'],
      ['remote:child-tip', 'child-tip'],
    ]),
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

function sendStreamRequest(message = 'Do not reach a provider after rollover') {
  return new Request('http://workspace.test/api/send-stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cardId: localCardId,
      sessionKey: localSegmentKey,
      friendlyId: localCardId,
      message,
    }),
  })
}

function sessionCardControlRequest(action: 'steer' | 'kill') {
  return new Request(
    `http://workspace.test/api/session-cards/${encodeURIComponent(remoteCardId)}/${action}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cardBinding: remoteCardBinding,
        ...(action === 'steer' ? { message: 'Continue carefully' } : {}),
      }),
    },
  )
}

function activeChildAbandonRequest() {
  return new Request(
    'http://workspace.test/api/session-cards/remote%3Achild-card/active-run/abandon',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runId: 'child-run',
        cardBinding: {
          kind: 'session-card-owner',
          cardId: 'remote:child-card',
          parentCardId: 'remote:parent-card',
          canonicalSource: 'remote',
          canonicalSegmentKey: 'remote:child-tip',
          canonicalTransport: 'gateway',
        },
      }),
    },
  )
}

function conductorSpawnRequest(maxParallel = 2) {
  return new Request('http://workspace.test/api/conductor-spawn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Create a focused prototype',
      maxParallel,
    }),
  })
}

function conductorStopRequest(
  missionId: string,
  cardBindings = [localCardBinding],
) {
  return new Request('http://workspace.test/api/conductor-stop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cardBindings,
      missionIds: [missionId],
      missionCardId: localCardId,
    }),
  })
}

function readMissionStore() {
  return JSON.parse(readFileSync(missionStorePath, 'utf8')) as {
    missions: Array<{
      id: string
      state: string
      assignments: Array<{ workerId: string; state: string }>
      events: Array<{ type: string; message: string }>
    }>
    missionCardAuthorities: Array<{
      missionId: string
      anchors: Array<{
        source: string
        key: string
        binding: typeof localCardBinding
      }>
    }>
  }
}

function seedNativeMission(missionId: string) {
  return artifact.__artifactContract.createAtomicMission({
    missionId,
    title: 'Executable native mission',
    assignments: [{ workerId: 'builder', task: 'Execute the mission' }],
    authorities: [
      {
        anchorSource: 'local',
        anchorKey: 'builder',
        binding: localCardBinding,
      },
    ],
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
    getLocalMessages: vi.fn(),
    touchLocalSession: vi.fn(),
  }
  const runStoreActions = {
    appendRunText: vi.fn(),
    createPersistedRun: vi.fn(),
    markRunStatus: vi.fn(),
    registerActiveSendRun: vi.fn(),
    unregisterActiveSendRun: vi.fn(),
  }
  const eventActions = {
    publishCardActivityEvent: vi.fn(),
  }
  const gatewayActions = {
    dashboardFetch: vi.fn(),
    ensureGatewayProbed: vi.fn(),
  }
  const swarmActions = {
    abandonActiveCardRun: vi.fn(),
    appendSwarmMemoryEvent: vi.fn(),
    dispatchSwarmAssignments: vi.fn(),
    dispatchPromptToLiveSession: vi.fn(),
    getSwarmProfilePath: vi.fn(),
    listAllActiveRuns: vi.fn(),
    markCheckpointResult: vi.fn(),
    markDispatchResult: vi.fn(),
    markDispatchStarted: vi.fn(),
    publishSwarmCheckpointNotification: vi.fn(),
    readRuntimeCheckpointSnapshot: vi.fn(),
    readWorkerMessages: vi.fn(),
    recordMissionCheckpoint: vi.fn(),
    resetSwarmWorkerRuntime: vi.fn(),
  }
  const execFile = vi.fn(successfulExecFile)

  afterAll(() => {
    rmSync(artifactStateDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    rmSync(missionStorePath, { force: true })
    artifact.__artifactContract.setMissionStorePath(missionStorePath)
    swarmActions.dispatchSwarmAssignments.mockResolvedValue({})
    swarmActions.dispatchPromptToLiveSession.mockResolvedValue({
      workerId: 'builder',
      ok: true,
      output: 'Delivered to generated worker',
      error: null,
      durationMs: 1,
      exitCode: 0,
      delivery: 'tmux',
    })
    swarmActions.getSwarmProfilePath.mockImplementation((workerId) =>
      resolve(artifactStateDir, String(workerId)),
    )
    swarmActions.readRuntimeCheckpointSnapshot.mockReturnValue({
      checkpointRaw: null,
    })
    swarmActions.readWorkerMessages.mockImplementation(
      workerMessagesWithImmediateReply(),
    )
    swarmActions.resetSwarmWorkerRuntime.mockReturnValue({
      workerId: 'builder',
      ok: true,
    })
    localStoreActions.getLocalMessages.mockReturnValue([])
    runStoreActions.appendRunText.mockResolvedValue(null)
    runStoreActions.createPersistedRun.mockImplementation((input) =>
      Promise.resolve(input),
    )
    runStoreActions.markRunStatus.mockResolvedValue(null)
    artifact.__artifactContract.replaceBoundaries({
      abandonActiveCardRun: swarmActions.abandonActiveCardRun,
      appendLocalMessage: localStoreActions.appendLocalMessage,
      appendRunText: runStoreActions.appendRunText,
      appendSwarmMemoryEvent: swarmActions.appendSwarmMemoryEvent,
      createPersistedRun: runStoreActions.createPersistedRun,
      dashboardFetch: gatewayActions.dashboardFetch,
      dispatchSwarmAssignments: swarmActions.dispatchSwarmAssignments,
      dispatchPromptToLiveSession: swarmActions.dispatchPromptToLiveSession,
      ensureGatewayProbed: gatewayActions.ensureGatewayProbed.mockResolvedValue(
        {
          dashboard: { available: true },
          enhancedChat: false,
        },
      ),
      ensureLocalSession: localStoreActions.ensureLocalSession,
      execFile,
      getLocalMessages: localStoreActions.getLocalMessages,
      getSwarmProfilePath: swarmActions.getSwarmProfilePath,
      listAllActiveRuns: swarmActions.listAllActiveRuns,
      loadWorkspaceCatalog: vi.fn().mockResolvedValue(null),
      markCheckpointResult: swarmActions.markCheckpointResult,
      markDispatchResult: swarmActions.markDispatchResult,
      markDispatchStarted: swarmActions.markDispatchStarted,
      markRunStatus: runStoreActions.markRunStatus,
      openaiChat: providerActions.openaiChat,
      publishCardActivityEvent: eventActions.publishCardActivityEvent,
      publishSwarmCheckpointNotification:
        swarmActions.publishSwarmCheckpointNotification,
      readRuntimeCheckpointSnapshot: swarmActions.readRuntimeCheckpointSnapshot,
      readWorkerMessages: swarmActions.readWorkerMessages,
      recordMissionCheckpoint: swarmActions.recordMissionCheckpoint,
      registerActiveSendRun: runStoreActions.registerActiveSendRun,
      requireLocalOrAuth: vi.fn().mockReturnValue(true),
      resetSwarmWorkerRuntime: swarmActions.resetSwarmWorkerRuntime,
      streamChat: providerActions.streamChat,
      streamResponses: providerActions.streamResponses,
      touchLocalSession: localStoreActions.touchLocalSession,
      unregisterActiveSendRun: runStoreActions.unregisterActiveSendRun,
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
    expect(localStoreActions.ensureLocalSession).not.toHaveBeenCalled()
    expect(localStoreActions.appendLocalMessage).not.toHaveBeenCalled()
    expect(providerActions.openaiChat).not.toHaveBeenCalled()
    expect(providerActions.streamResponses).not.toHaveBeenCalled()
    expect(providerActions.streamChat).not.toHaveBeenCalled()
  })

  it('rejects rollover after local session admission and before later send mutations', async () => {
    const resolveCard = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          localStoreActions.ensureLocalSession.mock.calls.length > 0
            ? resolvedLocalCard('local:rolled-over-card')
            : resolvedLocalCard(),
        ),
      )
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard,
      resolveChildCard: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })

    const response = await artifact.default.fetch(sendStreamRequest())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Session Card ownership changed before send',
    })
    expect(localStoreActions.ensureLocalSession).toHaveBeenCalledTimes(1)
    expect(localStoreActions.appendLocalMessage).not.toHaveBeenCalled()
    expect(providerActions.openaiChat).not.toHaveBeenCalled()
    expect(providerActions.streamResponses).not.toHaveBeenCalled()
    expect(providerActions.streamChat).not.toHaveBeenCalled()
  })

  it('executes a Card-authoritative send stream and persists its accepted state effects', async () => {
    const resolveCard = vi.fn().mockResolvedValue(resolvedLocalCard())
    const observeCardActivity = vi.fn().mockImplementation((input) =>
      Promise.resolve({
        ...(input as Record<string, unknown>),
        sessionKey: localSegmentKey,
        updatedAt: Date.now(),
      }),
    )
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard,
      resolveChildCard: vi.fn(),
      observeCardActivity,
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })
    providerActions.openaiChat.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        await Promise.resolve()
        yield { type: 'text', text: 'Accepted assistant output' }
      },
    })

    const response = await artifact.default.fetch(
      sendStreamRequest('Accepted user turn'),
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(stream).toContain('event: chunk')
    expect(stream).toContain('Accepted assistant output')
    expect(stream).toContain('event: done')
    expect(localStoreActions.ensureLocalSession).toHaveBeenCalledWith(
      'builder',
      undefined,
    )
    expect(localStoreActions.appendLocalMessage).toHaveBeenNthCalledWith(
      1,
      'builder',
      expect.objectContaining({ role: 'user', content: 'Accepted user turn' }),
    )
    expect(localStoreActions.appendLocalMessage).toHaveBeenNthCalledWith(
      2,
      'builder',
      expect.objectContaining({
        role: 'assistant',
        content: 'Accepted assistant output',
      }),
    )
    expect(localStoreActions.touchLocalSession).toHaveBeenCalledWith('builder')
    expect(providerActions.openaiChat).toHaveBeenCalledTimes(1)
    expect(runStoreActions.createPersistedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: localSegmentKey,
        friendlyId: localCardId,
        cardId: localCardId,
        canonicalSegmentKey: localSegmentKey,
      }),
    )
    expect(runStoreActions.appendRunText).toHaveBeenCalledWith(
      localSegmentKey,
      expect.any(String),
      'Accepted assistant output',
      { replace: true },
    )
    expect(runStoreActions.markRunStatus).toHaveBeenCalledWith(
      localSegmentKey,
      expect.any(String),
      'complete',
      undefined,
    )
    expect(observeCardActivity).toHaveBeenCalledTimes(2)
    expect(eventActions.publishCardActivityEvent).toHaveBeenCalledTimes(2)
  })

  it('executes retirement of raw session sends without touching gateway or provider mutations', async () => {
    const response = await artifact.default.fetch(
      new Request('http://workspace.test/api/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'remote:ghost-runtime',
          message: 'Do not deliver this raw mutation',
        }),
      }),
    )

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Legacy session send is retired; use a Session Card operation',
    })
    expect(gatewayActions.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(gatewayActions.dashboardFetch).not.toHaveBeenCalled()
    expect(providerActions.openaiChat).not.toHaveBeenCalled()
    expect(providerActions.streamResponses).not.toHaveBeenCalled()
    expect(providerActions.streamChat).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('rejects raw Swarm checkpoint, reset, and loop identities before state mutation', async () => {
    const checkpoint = await artifact.default.fetch(
      new Request('http://workspace.test/api/swarm-checkpoint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workerId: 'builder', state: 'executing' }),
      }),
    )
    const reset = await artifact.default.fetch(
      new Request('http://workspace.test/api/swarm-runtime/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workerIds: ['builder'] }),
      }),
    )
    const loop = await artifact.default.fetch(
      new Request('http://workspace.test/api/swarm-orchestrator-loop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workerIds: ['builder'], dryRun: true }),
      }),
    )

    expect([checkpoint.status, reset.status, loop.status]).toEqual([
      400, 400, 400,
    ])
    await expect(checkpoint.json()).resolves.toMatchObject({
      ok: false,
      error: 'Valid Session Card checkpoint binding required',
    })
    await expect(reset.json()).resolves.toEqual({
      ok: false,
      error: 'Raw workerIds reset is unsupported',
    })
    await expect(loop.json()).resolves.toEqual({
      ok: false,
      error: 'Raw workerIds orchestration is unsupported',
    })
    expect(swarmActions.appendSwarmMemoryEvent).not.toHaveBeenCalled()
    expect(swarmActions.resetSwarmWorkerRuntime).not.toHaveBeenCalled()
    expect(swarmActions.markCheckpointResult).not.toHaveBeenCalled()
    expect(
      swarmActions.publishSwarmCheckpointNotification,
    ).not.toHaveBeenCalled()
  })

  it('atomically persists an executable multiworker mission and its complete Card authority set', () => {
    const reviewerBinding = {
      ...localCardBinding,
      cardId: 'local:reviewer-card',
      canonicalSegmentKey: 'local:reviewer',
    }

    const mission = artifact.__artifactContract.createAtomicMission({
      missionId: 'artifact-atomic-mission',
      title: 'Artifact atomic mission',
      assignments: [
        { workerId: 'builder', task: 'Implement the artifact patch' },
        { workerId: 'reviewer', task: 'Review the artifact patch' },
      ],
      authorities: [
        {
          anchorSource: 'local',
          anchorKey: 'builder',
          binding: localCardBinding,
        },
        {
          anchorSource: 'local',
          anchorKey: 'reviewer',
          binding: reviewerBinding,
        },
      ],
    })

    expect(mission).toMatchObject({
      id: 'artifact-atomic-mission',
      _created: true,
    })
    expect(
      artifact.__artifactContract.getMissionAuthorityBindings(
        'artifact-atomic-mission',
      ),
    ).toEqual([localCardBinding, reviewerBinding])
    const persisted = readMissionStore()
    expect(
      persisted.missions.map((entry) => ({
        id: entry.id,
        workers: entry.assignments.map((assignment) => assignment.workerId),
      })),
    ).toEqual([
      {
        id: 'artifact-atomic-mission',
        workers: ['builder', 'reviewer'],
      },
    ])
    expect(
      persisted.missionCardAuthorities.map((authority) => ({
        missionId: authority.missionId,
        anchors: authority.anchors.map((anchor) => ({
          source: anchor.source,
          key: anchor.key,
          cardId: anchor.binding.cardId,
        })),
      })),
    ).toEqual([
      {
        missionId: 'artifact-atomic-mission',
        anchors: [
          { source: 'local', key: 'builder', cardId: localCardId },
          {
            source: 'local',
            key: 'reviewer',
            cardId: 'local:reviewer-card',
          },
        ],
      },
    ])
  })

  it('durably compensates native Conductor admission when a later worker Card is unavailable', async () => {
    const resolveLocalCardByUpstreamSession = vi
      .fn()
      .mockImplementation((workerId) =>
        workerId === 'reviewer'
          ? Promise.reject(new Error('reviewer Card unavailable'))
          : Promise.resolve(resolvedLocalWorkerCard(String(workerId))),
      )
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard: vi
        .fn()
        .mockImplementation((cardId) =>
          Promise.resolve(
            resolvedLocalWorkerCard(
              String(cardId).replace(/^local:|-card$/gu, ''),
            ),
          ),
        ),
      resolveChildCard: vi.fn(),
      resolveLocalCardByUpstreamSession,
      resolveRemoteCardByUpstreamSession: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })
    gatewayActions.ensureGatewayProbed.mockResolvedValue({
      conductor: false,
      dashboard: { available: false },
    })

    const response = await artifact.default.fetch(conductorSpawnRequest())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'Session Card ownership unavailable for native dispatch',
    })
    expect(swarmActions.dispatchSwarmAssignments).not.toHaveBeenCalled()
    const persisted = readMissionStore()
    expect(persisted.missions).toHaveLength(1)
    expect(persisted.missions[0]).toMatchObject({
      state: 'cancelled',
      assignments: [
        { workerId: 'builder', state: 'cancelled' },
        { workerId: 'reviewer', state: 'cancelled' },
      ],
    })
    expect(persisted.missions[0]?.events.at(-1)).toMatchObject({
      type: 'mission_cancelled',
      message: expect.stringContaining(
        'Native Conductor worker Session Card binding unavailable',
      ),
    })
  })

  it('deletes a dashboard Conductor mission when exact Card admission fails', async () => {
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard: vi
        .fn()
        .mockResolvedValue(resolvedRemoteCard('remote:rolled-over-card')),
      resolveChildCard: vi.fn(),
      resolveLocalCardByUpstreamSession: vi.fn(),
      resolveRemoteCardByUpstreamSession: vi
        .fn()
        .mockResolvedValue(resolvedRemoteCard()),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })
    gatewayActions.ensureGatewayProbed.mockResolvedValue({
      conductor: true,
      dashboard: { available: true },
    })
    gatewayActions.dashboardFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'dashboard-artifact-mission',
            name: 'Dashboard artifact mission',
            session_id: 'private-upstream-tip',
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const response = await artifact.default.fetch(conductorSpawnRequest())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      missionId: 'dashboard-artifact-mission',
      error: 'Dashboard Conductor mission Session Card binding is unavailable',
      compensated: true,
      compensationError: null,
    })
    expect(gatewayActions.dashboardFetch).toHaveBeenNthCalledWith(
      2,
      '/api/conductor/missions/dashboard-artifact-mission',
      { method: 'DELETE' },
    )
    expect(
      artifact.__artifactContract.getMission('dashboard-artifact-mission'),
    ).toBeNull()
  })

  it('keeps native cancellation persisted when a worker Card becomes stale before reset', async () => {
    const missionId = 'artifact-stale-stop'
    expect(seedNativeMission(missionId)).not.toBeNull()
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard: vi
        .fn()
        .mockResolvedValueOnce(resolvedLocalCard())
        .mockResolvedValueOnce(resolvedLocalCard('local:rolled-over-card')),
      resolveChildCard: vi.fn(),
      resolveLocalCardByUpstreamSession: vi.fn(),
      resolveRemoteCardByUpstreamSession: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })

    const response = await artifact.default.fetch(
      conductorStopRequest(missionId),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      cancelledNativeMissions: 1,
      failures: [
        {
          operation: 'reset-worker',
          id: 'builder',
          error: 'Session Card worker binding is unavailable',
        },
      ],
    })
    expect(swarmActions.resetSwarmWorkerRuntime).not.toHaveBeenCalled()
    expect(readMissionStore().missions[0]).toMatchObject({
      id: missionId,
      state: 'cancelled',
      assignments: [{ workerId: 'builder', state: 'cancelled' }],
    })
  })

  it('reports reset failure without rolling back the persisted native stop', async () => {
    const missionId = 'artifact-reset-failure-stop'
    expect(seedNativeMission(missionId)).not.toBeNull()
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard: vi.fn().mockResolvedValue(resolvedLocalCard()),
      resolveChildCard: vi.fn(),
      resolveLocalCardByUpstreamSession: vi.fn(),
      resolveRemoteCardByUpstreamSession: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })
    swarmActions.resetSwarmWorkerRuntime.mockReturnValue({
      workerId: 'builder',
      ok: false,
      error: 'simulated reset failure',
    })

    const response = await artifact.default.fetch(
      conductorStopRequest(missionId),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      cancelledNativeMissions: 1,
      failures: [
        {
          operation: 'reset-worker',
          id: 'builder',
          error: 'Unable to reset worker runtime: simulated reset failure',
        },
      ],
    })
    expect(swarmActions.resetSwarmWorkerRuntime).toHaveBeenCalledWith(
      'builder',
      {
        actor: 'conductor-stop',
        reason: `Cancelled native Conductor mission ${missionId}`,
      },
    )
    expect(readMissionStore().missions[0]).toMatchObject({
      id: missionId,
      state: 'cancelled',
      assignments: [{ workerId: 'builder', state: 'cancelled' }],
    })
  })

  it.each(['steer', 'kill'] as const)(
    'rejects generated Card %s rollover at the final gateway mutation edge',
    async (action) => {
      const resolveCard = vi
        .fn()
        .mockResolvedValueOnce(resolvedRemoteCard())
        .mockResolvedValueOnce(resolvedRemoteCard('remote:rolled-over-card'))
      artifact.__artifactContract.replaceSessionCardService({
        resolveCard,
        resolveChildCard: vi.fn(),
        observeCardActivity: vi.fn().mockResolvedValue(null),
        observeChildLifecycle: vi.fn().mockResolvedValue(null),
      })

      const response = await artifact.default.fetch(
        sessionCardControlRequest(action),
      )

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: `Session Card ownership changed before ${action}`,
      })
      expect(resolveCard).toHaveBeenCalledTimes(2)
      expect(gatewayActions.ensureGatewayProbed).toHaveBeenCalledTimes(1)
      expect(gatewayActions.dashboardFetch).not.toHaveBeenCalled()
    },
  )

  it.each(['steer', 'kill'] as const)(
    'executes generated Card-authoritative %s against the canonical gateway owner',
    async (action) => {
      const resolveCard = vi.fn().mockResolvedValue(resolvedRemoteCard())
      artifact.__artifactContract.replaceSessionCardService({
        resolveCard,
        resolveChildCard: vi.fn(),
        observeCardActivity: vi.fn().mockResolvedValue(null),
        observeChildLifecycle: vi.fn().mockResolvedValue(null),
      })
      gatewayActions.dashboardFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )

      const response = await artifact.default.fetch(
        sessionCardControlRequest(action),
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        ok: true,
        cardId: remoteCardId,
        parentCardId: null,
      })
      expect(resolveCard).toHaveBeenCalledTimes(2)
      expect(gatewayActions.dashboardFetch).toHaveBeenCalledWith(
        `/api/agent-${action}`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            session_key: remoteSegmentKey,
            ...(action === 'steer' ? { message: 'Continue carefully' } : {}),
          }),
        }),
      )
    },
  )

  it('executes a generated Card-authoritative dispatch and records its durable state edges', async () => {
    const resolveCard = vi.fn().mockResolvedValue(resolvedLocalCard())
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard,
      resolveChildCard: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })

    const result = await artifact.__artifactContract.runDispatchWorker(
      {
        workerId: 'builder',
        task: 'Execute the generated Card-authoritative dispatch',
        cardBinding: localCardBinding,
      },
      1_000,
      undefined,
      { waitForCheckpoint: false },
    )

    expect(result).toMatchObject({
      workerId: 'builder',
      ok: true,
      delivery: 'tmux',
      checkpointStatus: 'not-requested',
    })
    expect(swarmActions.markDispatchStarted).toHaveBeenCalledWith(
      'builder',
      'Execute the generated Card-authoritative dispatch',
      null,
      null,
      'main',
    )
    expect(swarmActions.appendSwarmMemoryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: 'builder',
        type: 'dispatch',
      }),
    )
    expect(swarmActions.dispatchPromptToLiveSession).toHaveBeenCalledWith(
      'builder',
      expect.stringContaining(
        'Execute the generated Card-authoritative dispatch',
      ),
      localCardBinding,
    )
    expect(swarmActions.markDispatchResult).toHaveBeenCalledWith(
      'builder',
      expect.objectContaining({ ok: true, delivery: 'tmux' }),
    )
  })

  it('rejects a post-wait dispatch rollover before checkpoint state changes', async () => {
    let checkpointObserved = false
    swarmActions.readWorkerMessages.mockImplementation(() => {
      checkpointObserved = true
      return {
        ok: true,
        sessionId: 'builder-session',
        sessionTitle: 'Builder session',
        messages: [
          {
            id: 'checkpoint',
            role: 'assistant',
            content:
              'STATE: DONE\nFILES_CHANGED: none\nCOMMANDS_RUN: pnpm test\nRESULT: complete\nBLOCKER: none\nNEXT_ACTION: hold',
            timestamp: Date.now(),
          },
        ],
      }
    })
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            checkpointObserved
              ? resolvedLocalCard('local:rolled-over-card')
              : resolvedLocalCard(),
          ),
        ),
      resolveChildCard: vi.fn(),
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })

    const result = await artifact.__artifactContract.runDispatchWorker(
      {
        workerId: 'builder',
        task: 'Wait for an authoritative checkpoint',
        cardBinding: localCardBinding,
      },
      1_000,
      undefined,
      { waitForCheckpoint: true, checkpointPollMs: 10 },
    )

    expect(result).toMatchObject({
      workerId: 'builder',
      ok: false,
      error: 'Session Card dispatch binding is unavailable',
    })
    expect(swarmActions.markDispatchStarted).toHaveBeenCalledTimes(1)
    expect(swarmActions.markDispatchResult).toHaveBeenCalledTimes(1)
    expect(swarmActions.markCheckpointResult).not.toHaveBeenCalled()
    expect(swarmActions.recordMissionCheckpoint).not.toHaveBeenCalled()
    expect(
      swarmActions.publishSwarmCheckpointNotification,
    ).not.toHaveBeenCalled()
  })

  it('rejects child active-run rollover beneath the locked abandonment edge', async () => {
    const resolveChildCard = vi
      .fn()
      .mockResolvedValueOnce(resolvedRemoteChildCard())
      .mockResolvedValueOnce(resolvedRemoteChildCard())
      .mockResolvedValueOnce(resolvedRemoteChildCard(false))
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard: vi.fn().mockResolvedValue(resolvedRemoteChildCard()),
      resolveChildCard,
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })
    swarmActions.listAllActiveRuns.mockResolvedValue([
      {
        runId: 'child-run',
        sessionKey: 'remote:child-old',
        friendlyId: 'internal-child-run',
        cardId: 'remote:child-card',
        canonicalSegmentKey: 'remote:child-old',
        status: 'active',
      },
    ])
    swarmActions.abandonActiveCardRun.mockImplementation(async (input) => {
      const candidate = input as {
        revalidateCardOwner?: () => Promise<boolean>
      }
      if (!candidate.revalidateCardOwner) {
        return { outcome: 'abandoned', run: { status: 'error' } }
      }
      return (await candidate.revalidateCardOwner())
        ? { outcome: 'abandoned', run: { status: 'error' } }
        : { outcome: 'not-found' }
    })

    const response = await artifact.default.fetch(activeChildAbandonRequest())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Active Card run not found',
    })
    expect(resolveChildCard).toHaveBeenCalledTimes(3)
    expect(swarmActions.abandonActiveCardRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 'remote:child-card',
        runId: 'child-run',
        sessionKey: 'remote:child-old',
        revalidateCardOwner: expect.any(Function),
      }),
    )
  })

  it('executes generated active-run abandonment for the exact child Card continuation', async () => {
    const resolveChildCard = vi
      .fn()
      .mockResolvedValue(resolvedRemoteChildCard())
    artifact.__artifactContract.replaceSessionCardService({
      resolveCard: vi.fn().mockResolvedValue(resolvedRemoteChildCard()),
      resolveChildCard,
      observeCardActivity: vi.fn().mockResolvedValue(null),
      observeChildLifecycle: vi.fn().mockResolvedValue(null),
    })
    swarmActions.listAllActiveRuns.mockResolvedValue([
      {
        runId: 'child-run',
        sessionKey: 'remote:child-old',
        friendlyId: 'internal-child-run',
        cardId: 'remote:child-card',
        canonicalSegmentKey: 'remote:child-old',
        status: 'active',
      },
    ])
    swarmActions.abandonActiveCardRun.mockImplementation(async (input) => {
      const candidate = input as {
        revalidateCardOwner?: () => Promise<boolean>
      }
      expect(await candidate.revalidateCardOwner?.()).toBe(true)
      return { outcome: 'abandoned', run: { status: 'error' } }
    })

    const response = await artifact.default.fetch(activeChildAbandonRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      cardId: 'remote:child-card',
      status: 'error',
    })
    expect(resolveChildCard).toHaveBeenCalledTimes(3)
    expect(swarmActions.abandonActiveCardRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 'remote:child-card',
        runId: 'child-run',
        sessionKey: 'remote:child-old',
        ownedSegmentKeys: [
          'remote:child-card',
          'remote:child-old',
          'remote:child-tip',
        ],
        revalidateCardOwner: expect.any(Function),
      }),
    )
  })

  it('rejects raw Swarm tmux start and scroll before executing any command', async () => {
    const [start, scroll] = await Promise.all([
      artifact.default.fetch(
        new Request('http://workspace.test/api/swarm-tmux-start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workerId: 'builder' }),
        }),
      ),
      artifact.default.fetch(
        new Request('http://localhost/api/swarm-tmux-scroll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workerId: 'builder', direction: 'up' }),
        }),
      ),
    ])

    expect([start.status, scroll.status]).toEqual([400, 400])
    await expect(start.json()).resolves.toMatchObject({
      error: 'Invalid Session Card start binding',
    })
    await expect(scroll.json()).resolves.toMatchObject({
      error: 'Invalid Session Card scroll binding',
    })
    expect(execFile).not.toHaveBeenCalled()
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
