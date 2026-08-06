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
    /async function sendPromptToLiveSession(?:\$\d+)?\(workerId, prompt, cardBinding\)/u
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

function sourceRoute(fileName: string): string {
  return readFileSync(
    resolve(process.cwd(), 'src/routes/api', fileName),
    'utf8',
  )
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
    expect(edgeRevalidations).toHaveLength(3)
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

  it('keeps existing-session authority and attachment rejection ahead of send-stream source mutations', () => {
    const route = sourceRoute('send-stream.ts')
    const authorityFailure = route.indexOf(
      'Session Card authority required for existing session',
    )
    const attachmentFailure = route.indexOf('invalid attachment data')
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
    expect(legacyResolution).toBeGreaterThan(authorityFailure)
    expect(initialExactResolution).toBeGreaterThan(authorityFailure)
    expect(initialExactResolution).toBeLessThan(firstProviderMutation)
    expect(attachmentFailure).toBeLessThan(firstProviderMutation)
    expect(route).toContain(
      'isExplicitSendStreamBootstrap(rawSessionKey, body.sessionKey)',
    )
  })

  it('revalidates the direct-chat source binding immediately before runtime setup and input mutations', () => {
    const route = sourceRoute('swarm-direct-chat.ts')

    expect(route).toContain('ensureLiveTmuxSession(workerId, cardBinding)')
    for (const mutation of [
      'const started = await execFileAsync(',
      'const loaded = await execFileAsync(',
      'const cleared = await execFileAsync(',
      'const pasted = await execFileAsync(',
      'const entered = await execFileAsync(',
    ]) {
      const mutationEdge = route.indexOf(mutation)
      const revalidation = route.lastIndexOf(
        'resolveExactSessionCardOperationBinding(cardBinding)',
        mutationEdge,
      )
      const immediatelyBeforeMutation = route.slice(revalidation, mutationEdge)

      expect(mutationEdge).toBeGreaterThanOrEqual(0)
      expect(revalidation).toBeGreaterThanOrEqual(0)
      expect(immediatelyBeforeMutation.length).toBeLessThan(350)
      expect(immediatelyBeforeMutation).not.toMatch(/\bawait\b/u)
      expect(immediatelyBeforeMutation).toContain('staleBinding: true')
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
    expect(edgeRevalidations).toHaveLength(3)
    expect(delivery).toMatch(
      /resolveExactSessionCardOperationBinding\(cardBinding\)[\s\S]*?"send-keys"[\s\S]*?"C-u"[\s\S]*?resolveExactSessionCardOperationBinding\(cardBinding\)[\s\S]*?"paste-buffer"[\s\S]*?resolveExactSessionCardOperationBinding\(cardBinding\)[\s\S]*?"send-keys"[\s\S]*?"Enter"/u,
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
})
