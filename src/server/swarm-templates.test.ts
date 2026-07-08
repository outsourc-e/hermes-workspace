import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listTemplates, renderTemplate } from './swarm-templates'

let dir: string
const prev = process.env.HERMES_SWARM_TEMPLATES_PATH

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarm-templates-'))
  process.env.HERMES_SWARM_TEMPLATES_PATH = join(dir, 'templates.json')
})

afterAll(() => {
  if (prev === undefined) delete process.env.HERMES_SWARM_TEMPLATES_PATH
  else process.env.HERMES_SWARM_TEMPLATES_PATH = prev
  rmSync(dir, { recursive: true, force: true })
})

describe('templates', () => {
  it('seeds a starter set on first read', () => {
    const ids = listTemplates().map((t) => t.id)
    expect(ids).toContain('ship-feature')
    expect(ids).toContain('deep-research')
  })
  it('substitutes {{input}} into every stage task', () => {
    const rendered = renderTemplate('ship-feature', 'dark mode toggle')
    expect(rendered).not.toBeNull()
    for (const stage of rendered!.stages) {
      for (const a of stage.assignments) {
        expect(a.task).toContain('dark mode toggle')
        expect(a.task).not.toContain('{{input}}')
      }
    }
  })
  it('returns null for unknown ids', () => {
    expect(renderTemplate('nope', 'x')).toBeNull()
  })
})
