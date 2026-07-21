import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import { Route } from './skills'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
  requireLocalOrAuth: vi.fn(),
}))

type SkillsGetHandler = (context: { request: Request }) => Response | Promise<Response>
type RouteWithHandlers = typeof Route & {
  options: { server: { handlers: { GET: SkillsGetHandler } } }
}

const handler = (Route as RouteWithHandlers).options.server.handlers.GET
let hermesHome = ''
const originalHermesHome = process.env.HERMES_HOME

beforeEach(async () => {
  vi.mocked(isAuthenticated).mockReturnValue(true)
  hermesHome = await mkdtemp(join(tmpdir(), 'workspace-skills-contract-'))
  process.env.HERMES_HOME = hermesHome
  const skillDir = join(hermesHome, 'skills', 'productivity', 'demo-skill')
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: demo-skill',
      'description: Local contract fixture.',
      '---',
      '',
      '# Demo Skill',
      '',
      'Fixture content.',
      '',
    ].join('\n'),
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  if (hermesHome) await rm(hermesHome, { recursive: true, force: true })
})

describe('GET /api/skills local contract', () => {
  it('returns the complete list shape required by SkillsScreen', async () => {
    const response = await handler({
      request: new Request('http://localhost/api/skills?limit=10'),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      ok: boolean
      total: number
      page: number
      categories: Array<string>
      source: string
      skills: Array<Record<string, unknown>>
    }

    expect(body).toMatchObject({
      ok: true,
      total: 1,
      page: 1,
      source: 'local-workspace',
    })
    expect(body.categories).toEqual(['All', 'productivity'])
    expect(body.skills[0]).toMatchObject({
      id: 'productivity/demo-skill',
      slug: 'productivity/demo-skill',
      name: 'demo-skill',
      author: 'Local Hermes',
      installed: true,
      enabled: true,
      origin: 'agent-created',
      sourcePath: join(
        hermesHome,
        'skills',
        'productivity',
        'demo-skill',
        'SKILL.md',
      ),
    })
    expect(body.skills[0].tags).toEqual(['productivity'])
    expect(body.skills[0].triggers).toEqual([])
  })

  it('filters local skills without returning a malformed empty success', async () => {
    const response = await handler({
      request: new Request('http://localhost/api/skills?search=missing'),
    })
    const body = (await response.json()) as {
      ok: boolean
      total: number
      skills: Array<unknown>
    }
    expect(body).toEqual(
      expect.objectContaining({ ok: true, total: 0, skills: [] }),
    )
  })
})
