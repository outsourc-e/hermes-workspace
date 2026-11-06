/**
 * Guards the shipped preset catalog against entries that cannot start.
 *
 * Every stdio preset is spawned as a child process of the workspace server, so
 * a wrong package name only shows up as a dead server in the UI — nothing in
 * the build or the API validates it. The Fetch entry used to launch
 * `npx -y @modelcontextprotocol/server-fetch`, a package that is not published
 * on npm (the Fetch server is Python-only, as `mcp-server-fetch`), so adding
 * the preset always produced a server that exited immediately.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface SeedTemplate {
  name: string
  transportType: 'http' | 'stdio'
  command?: string
  args?: Array<string>
  url?: string
}

interface SeedPreset {
  id: string
  template: SeedTemplate
}

const seed = JSON.parse(
  readFileSync(
    new URL('../../assets/mcp-presets.seed.json', import.meta.url),
    'utf8',
  ),
) as { version: number; presets: Array<SeedPreset> }

const byId = new Map(seed.presets.map((preset) => [preset.id, preset]))

describe('mcp preset seed', () => {
  it('launches the fetch preset from the published Python package', () => {
    const template = byId.get('fetch')?.template
    expect(template?.command).toBe('uvx')
    expect(template?.args).toEqual(['mcp-server-fetch'])
  })

  it('never points a preset at an npm package that is not published', () => {
    // `@modelcontextprotocol/server-fetch` returns 404 from the npm registry.
    // A name check keeps the guard meaningful without network access in tests.
    const unpublished = '@modelcontextprotocol/server-fetch'
    for (const preset of seed.presets) {
      expect(preset.template.args ?? []).not.toContain(unpublished)
    }
  })

  it('only uses stdio launchers that exist in the runtime image', () => {
    // `npx` comes from the Node base image, `uvx` from the uv layer added to
    // the Dockerfile. Anything else would need the same treatment.
    const launchers = new Set(['npx', 'uvx'])
    for (const preset of seed.presets) {
      if (preset.template.transportType !== 'stdio') continue
      expect(launchers).toContain(preset.template.command)
    }
  })
})
