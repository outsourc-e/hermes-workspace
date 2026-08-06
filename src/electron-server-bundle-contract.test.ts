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

describe('checked-in Electron production server bundle', () => {
  const bundle = readFileSync(
    resolve(process.cwd(), 'electron/server-bundle.cjs'),
    'utf8',
  )
  const pauseRouteSource = readFileSync(
    resolve(process.cwd(), 'src/routes/api/session-cards.$cardId.pause.ts'),
    'utf8',
  )
  const routeTreeSource = readFileSync(
    resolve(process.cwd(), 'src/routeTree.gen.ts'),
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

  it('keeps the Electron server source Card-bound without regenerating the checked-in bundle', () => {
    expect(routeTreeSource).toContain(
      "from './routes/api/session-cards.$cardId.pause'",
    )
    expect(pauseRouteSource).toContain(
      "createFileRoute('/api/session-cards/$cardId/pause')",
    )
    expect(pauseRouteSource).toContain(
      'resolveSessionCardOperationBindingByCardOwner',
    )
    expect(pauseRouteSource).toContain(
      'resolveExactSessionCardOperationBinding',
    )
    expect(pauseRouteSource).toContain("dashboardFetch('/api/agent-pause'")
    expect(pauseRouteSource).not.toMatch(/[^A-Za-z]sessionKey\s*:/u)
  })

  it('requires an exact Card binding for bundled swarm direct chat delivery', () => {
    const route = bundledRoute(bundle, '/api/swarm-direct-chat')

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
  })

  it('rejects raw aliases and preserves Card-bound conductor stop failures', () => {
    const route = bundledRoute(bundle, '/api/conductor-stop')

    expect(route).toMatch(
      /Object\.prototype\.hasOwnProperty\.call\(\s*[^,]+,\s*"sessionKeys"\s*\)/u,
    )
    expect(route).toMatch(/parseCardBindings\([^)]*\.cardBindings\)/u)
    expect(route).toContain('Invalid Session Card stop binding')
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
