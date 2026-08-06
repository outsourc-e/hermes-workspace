import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function bundledRoute(bundle: string, route: string): string {
  const marker = `createFileRoute("${route}")`
  const start = bundle.indexOf(marker)
  expect(start, `missing bundled route ${route}`).toBeGreaterThanOrEqual(0)
  const nextRoute = bundle.indexOf('createFileRoute("', start + marker.length)
  return bundle.slice(start, nextRoute < 0 ? bundle.length : nextRoute)
}

function bundledDirectChatDelivery(bundle: string): string {
  const marker =
    /async function sendPromptToLiveSession\(workerId, prompt, cardBinding\)/u
  const match = marker.exec(bundle)
  expect(
    match?.index,
    'missing bundled Card-bound direct chat delivery',
  ).toBeTypeOf('number')
  const start = match!.index
  const nextFunction = bundle.indexOf('\nfunction messagesAfterBaseline', start)
  expect(
    nextFunction,
    'missing end of bundled direct chat delivery',
  ).toBeGreaterThan(start)
  return bundle.slice(start, nextFunction)
}

function bundledDirectChatRuntimeSetup(bundle: string): string {
  const marker =
    /async function ensureLiveTmuxSession\(workerId, cardBinding\)/u
  const match = marker.exec(bundle)
  expect(
    match?.index,
    'missing bundled Card-bound direct chat runtime setup',
  ).toBeTypeOf('number')
  const start = match!.index
  const nextFunction = bundle.indexOf(
    '\nasync function sendPromptToLiveSession',
    start,
  )
  expect(
    nextFunction,
    'missing end of bundled direct chat runtime setup',
  ).toBeGreaterThan(start)
  return bundle.slice(start, nextFunction)
}

function bundledExactCardBindingResolver(bundle: string): string {
  const marker =
    'async function resolveExactSessionCardOperationBinding(binding)'
  const start = bundle.indexOf(marker)
  expect(
    start,
    'missing bundled exact Card binding resolver',
  ).toBeGreaterThanOrEqual(0)
  const end = bundle.indexOf(
    '\nasync function resolveSessionCardOperationBindingByUpstream',
    start,
  )
  expect(
    end,
    'missing end of bundled exact Card binding resolver',
  ).toBeGreaterThan(start)
  return bundle.slice(start, end)
}

function bundledSwarmDispatcher(bundle: string): string {
  const marker = 'async function dispatchSwarmAssignments('
  const start = bundle.indexOf(marker)
  expect(start, 'missing bundled Swarm dispatcher').toBeGreaterThanOrEqual(0)
  const end = bundle.indexOf('\nfunction validateWorkerId', start)
  expect(end, 'missing end of bundled Swarm dispatcher').toBeGreaterThan(start)
  return bundle.slice(start, end)
}

describe('checked-in Electron production server bundle', () => {
  const bundle = readFileSync(
    resolve(process.cwd(), 'electron/server-bundle.cjs'),
    'utf8',
  )

  it('ships only the Card-owned active-run abandonment route', () => {
    expect(
      /createFileRoute\(\s*"\/api\/session-cards\/\$cardId\/active-run\/abandon"\s*\)/u.test(
        bundle,
      ),
    ).toBe(true)
    expect(bundle.includes('const result = await abandonActiveCardRun({')).toBe(
      true,
    )
    expect(bundle.includes('Active Card run is already terminal')).toBe(true)
    expect(bundle.includes('/api/runs/$sessionKey/$runId/abandon')).toBe(false)
    expect(
      /`\/api\/runs\/\$\{encodeURIComponent\([^)]*\.sessionKey\)\}\/\$\{encodeURIComponent\([^)]*\.runId\)\}\/abandon`/u.test(
        bundle,
      ),
    ).toBe(false)
  })

  it('ships the Card-owned pause route with mutation-edge binding validation', () => {
    const route = bundledRoute(bundle, '/api/session-cards/$cardId/pause')

    expect(route).toMatch(
      /resolveSessionCardOperationBindingByCardOwner\(\{\s*cardId:\s*params\.cardId,\s*parentCardId,/u,
    )
    expect(route).toContain('Session Card ownership is unavailable')
    expect(route).toMatch(
      /await resolveExactSessionCardOperationBinding\(binding\)/u,
    )
    expect(route).toContain('Session Card ownership changed before pause')
    expect(route).toMatch(/dashboardFetch(?:\$\d+)?\(\s*"\/api\/agent-pause"/u)
    expect(route).toMatch(
      /session_key:\s*binding\.canonicalSegmentKey,\s*pause:\s*body\d*\.pause/u,
    )
  })

  it('authenticates the bundled pause route before body validation or Card resolution', () => {
    const route = bundledRoute(bundle, '/api/session-cards/$cardId/pause')
    const authCheck = route.indexOf('if (!isAuthenticated(request))')
    const contentTypeCheck = route.indexOf('requireJsonContentType(request)')
    const bodyParse = route.indexOf('request.json()')
    const cardResolution = route.indexOf(
      'resolveSessionCardOperationBindingByCardOwner({',
    )

    expect(authCheck).toBeGreaterThanOrEqual(0)
    expect(route.slice(authCheck, contentTypeCheck)).toContain('Unauthorized')
    expect(authCheck).toBeLessThan(contentTypeCheck)
    expect(authCheck).toBeLessThan(bodyParse)
    expect(authCheck).toBeLessThan(cardResolution)
  })

  it('revalidates the exact Card binding at every bundled send-stream mutation edge', () => {
    const route = bundledRoute(bundle, '/api/send-stream')

    const edgeRevalidations = [
      ...route.matchAll(
        /resolveExactSessionCardOperationBinding\(binding\d*\)/gu,
      ),
    ]
    expect(edgeRevalidations).toHaveLength(4)
    for (const mutationPattern of [
      /const responsesStream(?:\$\d+)? = streamResponses\(/u,
      /const streamPending(?:\$\d+)? = openaiChat\(/u,
      /const upstreamStream(?:\$\d+)? = streamChat\(/u,
    ]) {
      const mutationEdge = mutationPattern.exec(route)?.index ?? -1
      const revalidation =
        edgeRevalidations.filter((match) => match.index < mutationEdge).at(-1)
          ?.index ?? -1
      const immediatelyBeforeMutation = route.slice(revalidation, mutationEdge)

      expect(mutationEdge).toBeGreaterThanOrEqual(0)
      expect(revalidation).toBeGreaterThanOrEqual(0)
      expect(immediatelyBeforeMutation.length).toBeLessThan(800)
      expect(immediatelyBeforeMutation).toContain(
        'settleCardMutationEdge("stale")',
      )
      expect(immediatelyBeforeMutation).not.toMatch(/\n\s*await\s/u)
    }
    expect(route).toContain('Session Card ownership changed before send')
  })

  it('rejects invalid attachments and non-bootstrap sends without exact bundled Card authority before provider mutation', () => {
    const route = bundledRoute(bundle, '/api/send-stream')
    const authorityFailure = route.indexOf(
      'Session Card authority required for existing session',
    )
    const attachmentFailure = route.indexOf('invalid attachment data')
    const invalidCardFailure = route.indexOf('invalid card id')
    const explicitBootstrap =
      /isExplicitSendStreamBootstrap(?:\$\d+)?\(rawSessionKey, body\d*\.sessionKey\)/u.exec(
        route,
      )?.index ?? -1
    const nonBootstrapRejection =
      /if \(!requestedCardId && !isExplicitBootstrapSend\)/u.exec(route)
        ?.index ?? -1
    const legacyResolution = route.indexOf('resolveSessionKey({')
    const initialExactResolution = route.indexOf(
      'resolveExactSessionCardOperationBinding(mutationBinding)',
    )
    const firstProviderMutation = Math.min(
      ...[
        'const responsesStream = streamResponses(',
        'const streamPending = openaiChat(',
        'const upstreamStream = streamChat(',
      ].map((marker) => route.indexOf(marker)),
    )

    expect(authorityFailure).toBeGreaterThanOrEqual(0)
    expect(attachmentFailure).toBeGreaterThanOrEqual(0)
    expect(invalidCardFailure).toBeGreaterThanOrEqual(0)
    expect(explicitBootstrap).toBeGreaterThanOrEqual(0)
    expect(nonBootstrapRejection).toBeGreaterThan(explicitBootstrap)
    expect(legacyResolution).toBeGreaterThan(authorityFailure)
    expect(initialExactResolution).toBeGreaterThan(authorityFailure)
    expect(initialExactResolution).toBeLessThan(firstProviderMutation)
    expect(attachmentFailure).toBeLessThan(firstProviderMutation)
    expect(invalidCardFailure).toBeLessThan(firstProviderMutation)
  })

  it('revalidates exact bundled Card authority immediately before every direct-chat mutation', () => {
    const setup = bundledDirectChatRuntimeSetup(bundle)
    const delivery = bundledDirectChatDelivery(bundle)

    expect(delivery).toMatch(
      /ensureLiveTmuxSession(?:\$\d+)?\(workerId, cardBinding\)/u,
    )
    for (const [slice, mutationPattern, command] of [
      [
        setup,
        /const started\w* = await execFileAsync(?:\$\d+)?\(/u,
        '"new-session"',
      ],
      [
        delivery,
        /const loaded\w* = await execFileAsync(?:\$\d+)?\(/u,
        '"load-buffer"',
      ],
      [
        delivery,
        /const cleared\w* = await execFileAsync(?:\$\d+)?\(/u,
        '"C-u"',
      ],
      [
        delivery,
        /const pasted\w* = await execFileAsync(?:\$\d+)?\(/u,
        '"paste-buffer"',
      ],
      [
        delivery,
        /const entered\w* = await execFileAsync(?:\$\d+)?\(/u,
        '"Enter"',
      ],
    ] as const) {
      const mutationEdge = mutationPattern.exec(slice)?.index ?? -1
      const revalidation = slice.lastIndexOf(
        'resolveExactSessionCardOperationBinding(cardBinding)',
        mutationEdge,
      )
      const immediatelyBeforeMutation = slice.slice(revalidation, mutationEdge)

      expect(mutationEdge).toBeGreaterThanOrEqual(0)
      expect(revalidation).toBeGreaterThanOrEqual(0)
      expect(immediatelyBeforeMutation.length).toBeLessThan(500)
      expect(immediatelyBeforeMutation).not.toMatch(/\bawait\b/u)
      expect(immediatelyBeforeMutation).toContain('staleBinding: true')
      expect(slice.slice(mutationEdge, mutationEdge + 500)).toContain(command)
    }
  })

  it('ships semantic canonical-rollover checks in the exact Card binding helper', () => {
    const resolver = bundledExactCardBindingResolver(bundle)

    expect(resolver).toContain(
      'card.canonicalSegmentKey !== binding.canonicalSegmentKey',
    )
    expect(resolver).toContain(
      'continuations.at(-1) !== card.canonicalSegmentKey',
    )
    expect(resolver).toContain(
      'continuations.length !== card.continuationCount',
    )
    expect(resolver).toContain(
      'resolved.collection.completeness !== "complete"',
    )
  })

  it('requires exact Card binding and revalidation at every direct chat mutation edge', () => {
    const route = bundledRoute(bundle, '/api/swarm-direct-chat')
    const delivery = bundledDirectChatDelivery(bundle)

    expect(route).toMatch(
      /parseDirectChatCardBinding\(\s*[^,]+\.cardBinding,\s*workerId\s*\)/u,
    )
    expect(route).toContain('Invalid Session Card delivery binding')
    expect(route).toContain('Session Card delivery binding is unavailable')
    expect(route).toMatch(
      /await resolveExactSessionCardOperationBinding\(cardBinding\)/u,
    )
    expect(route).toMatch(
      /sendPromptToLiveSession\(\s*workerId,\s*prompt,\s*cardBinding\s*\)/u,
    )
    expect(route).not.toMatch(
      /sendPromptToLiveSession\(\s*workerId,\s*prompt\s*\)/u,
    )

    const edgeRevalidations = delivery.match(
      /await resolveExactSessionCardOperationBinding\(cardBinding\)/gu,
    )
    expect(edgeRevalidations).toHaveLength(4)
    expect(delivery).toMatch(
      /resolveExactSessionCardOperationBinding\(cardBinding\)[\s\S]*?"load-buffer"[\s\S]*?resolveExactSessionCardOperationBinding\(cardBinding\)[\s\S]*?"send-keys"[\s\S]*?"C-u"[\s\S]*?resolveExactSessionCardOperationBinding\(cardBinding\)[\s\S]*?"paste-buffer"[\s\S]*?resolveExactSessionCardOperationBinding\(cardBinding\)[\s\S]*?"send-keys"[\s\S]*?"Enter"/u,
    )
  })

  it('rejects raw aliases and preserves Card-bound conductor stop failures', () => {
    const route = bundledRoute(bundle, '/api/conductor-stop')

    expect(route).toMatch(
      /Object\.prototype\.hasOwnProperty\.call\(\s*[^,]+,\s*"sessionKeys"\s*\)/u,
    )
    expect(route).toMatch(/parseCardBindings\([^)]*\.cardBindings\)/u)
    expect(route).toContain('Invalid Session Card stop binding')
    expect(route).toMatch(/missionAuthorityBinding\([\s\S]*?cardBindings\s*\)/u)
    expect(route).toMatch(
      /swarmMissionHasExactCardAuthority\(missionId,\s*missionBinding\)/u,
    )
    expect(route).toContain('Session Card is not authorized for this mission')
    expect(route).toMatch(
      /await resolveExactSessionCardOperationBinding\((?:missionBinding|binding)\)/u,
    )
    expect(route).toContain('Session Card stop binding is unavailable')
    expect(route).toMatch(/ok:\s*failures\.length === 0/u)
    expect(route).toMatch(
      /status:\s*failures\.length === 0\s*\?\s*200\s*:\s*staleAuthority\s*\?\s*409\s*:\s*502/u,
    )
    expect(route).not.toMatch(
      /return json\(\{\s*ok:\s*true,\s*deleted,\s*stoppedMissions/u,
    )
  })

  it('retires the ghost raw session-send path without any gateway mutation fallback', () => {
    const route = bundledRoute(bundle, '/api/sessions/send')

    expect(route).toContain(
      'Legacy session send is retired; use a Session Card operation',
    )
    expect(route).toContain(
      'Attachments are not supported by the retired session endpoint',
    )
    expect(route).toContain('Object.prototype.hasOwnProperty.call')
    expect(route).toContain('"attachments"')
    expect(route).not.toMatch(/ensureGatewayProbed\(/u)
    expect(route).not.toMatch(/resolveSessionKey\(/u)
    expect(route).not.toMatch(/sendChat\(/u)
  })

  it.each(['steer', 'kill'] as const)(
    'ships Card-owned %s with rollover rejection immediately before the gateway edge',
    (action) => {
      const route = bundledRoute(bundle, `/api/session-cards/$cardId/${action}`)
      const exactResolutions = [
        ...route.matchAll(
          /resolveExactSessionCardOperationBinding\(binding\d*\)/gu,
        ),
      ]
      const gatewayMutation =
        /dashboardFetch(?:\$\d+)?\(\s*"\/api\/agent-(?:steer|kill)/u.exec(route)
          ?.index ?? -1

      expect(route).toMatch(
        /parseSessionCardOperationBinding\([^,]+,\s*\{\s*source:\s*"remote",\s*transport:\s*"gateway"/u,
      )
      expect(exactResolutions).toHaveLength(2)
      expect(gatewayMutation).toBeGreaterThanOrEqual(0)
      expect(exactResolutions.at(-1)?.index).toBeLessThan(gatewayMutation)
      expect(
        route.slice(exactResolutions.at(-1)!.index, gatewayMutation),
      ).not.toMatch(/\n\s*await\s/u)
      expect(route).toContain(`Session Card ownership changed before ${action}`)
      expect(route).toMatch(/session_key:\s*binding\d*\.canonicalSegmentKey/u)
      expect(route).not.toMatch(/body\d*\.sessionKey/u)
    },
  )

  it('fails closed when enhanced main may already have a Card owner', () => {
    const route = bundledRoute(bundle, '/api/send-stream')
    const listExisting = route.indexOf('listSessions(30, 0)')
    const resolveExisting = route.indexOf(
      'sessionCardService.resolveRemoteCardByUpstreamSession(',
    )
    const createNew = route.indexOf('createSession()')
    const firstProviderMutation = Math.min(
      ...[
        'const responsesStream = streamResponses(',
        'const streamPending = openaiChat(',
        'const upstreamStream = streamChat(',
      ].map((marker) => route.indexOf(marker)),
    )

    expect(route).toContain(
      'Unable to verify existing main Session Card ownership',
    )
    expect(route).toContain(
      'Existing main Session Card ownership is unavailable',
    )
    expect(listExisting).toBeGreaterThanOrEqual(0)
    expect(resolveExisting).toBeGreaterThan(listExisting)
    expect(createNew).toBeGreaterThan(listExisting)
    expect(resolveExisting).toBeLessThan(firstProviderMutation)
    expect(createNew).toBeLessThan(firstProviderMutation)
  })

  it('ships raw Swarm hardening across dispatch, lifecycle, start, and scroll routes', () => {
    const dispatch = bundledSwarmDispatcher(bundle)
    expect(dispatch).toContain('Raw workerIds dispatch is unsupported')
    expect(dispatch).toContain('Session Card dispatch binding is unavailable')
    expect(dispatch).toMatch(
      /resolveExactSessionCardOperationBinding\(assignment\.cardBinding\)/u,
    )
    expect(bundle).toContain('Invalid Session Card dispatch binding')

    const lifecycle = bundledRoute(bundle, '/api/swarm-lifecycle')
    expect(lifecycle).toContain(
      'targets[] with exact Session Card bindings required',
    )
    expect(lifecycle).toContain('Invalid Session Card lifecycle binding')
    expect(lifecycle).toMatch(
      /requestWorkerHandoff\(workerId,\s*cardBinding\)/u,
    )
    expect(lifecycle).toMatch(/renewWorker\(workerId,\s*cardBinding\)/u)
    expect(lifecycle).toMatch(
      /notifyHandoffWritten\(workerId,\s*cardBinding\)/u,
    )

    for (const [path, label, expectedRevalidations] of [
      ['/api/swarm-tmux-start', 'start', 2],
      ['/api/swarm-tmux-scroll', 'scroll', 3],
    ] as const) {
      const route = bundledRoute(bundle, path)
      expect(route).toContain(`Invalid Session Card ${label} binding`)
      expect(route).toContain(`Session Card ${label} binding is unavailable`)
      expect(
        route.match(
          /resolveExactSessionCardOperationBinding\(cardBinding\d*\)/gu,
        ),
      ).toHaveLength(expectedRevalidations)
    }
    expect(bundledRoute(bundle, '/api/swarm-tmux-scroll')).not.toMatch(
      /body\d*\.session\b/u,
    )
  })
})
