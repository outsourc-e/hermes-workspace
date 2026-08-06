import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: Array<string> = []

function createServerFixture(manifestHash: string): string {
  const root = mkdtempSync(resolve(tmpdir(), 'hermes-electron-bundle-'))
  temporaryRoots.push(root)
  const assets = resolve(root, 'dist/server/assets')
  mkdirSync(assets, { recursive: true })
  writeFileSync(
    resolve(root, 'dist/server/server.js'),
    `export async function loadManifest() {
  return import('./assets/_tanstack-start-manifest_v-${manifestHash}.js')
}
`,
  )
  writeFileSync(
    resolve(assets, `_tanstack-start-manifest_v-${manifestHash}.js`),
    `export const tsrStartManifest = () => ({
  routes: {
    __root__: { filePath: ${JSON.stringify(resolve(root, 'src/routes/__root.tsx'))} },
  },
})
`,
  )
  return root
}

describe('Electron server bundle generation', () => {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('is byte-identical across clean checkout paths and manifest hashes', () => {
    const firstRoot = createServerFixture('FIRST_HASH')
    const secondRoot = createServerFixture('SECOND_HASH')
    const script = resolve(process.cwd(), 'scripts/bundle-electron-server.mjs')

    for (const root of [firstRoot, secondRoot]) {
      const output = resolve(root, 'electron/server-bundle.cjs')
      mkdirSync(dirname(output), { recursive: true })
      execFileSync(process.execPath, [script], { cwd: root })
    }

    const first = readFileSync(
      resolve(firstRoot, 'electron/server-bundle.cjs'),
      'utf8',
    )
    const second = readFileSync(
      resolve(secondRoot, 'electron/server-bundle.cjs'),
      'utf8',
    )

    expect(first).toBe(second)
    expect(first).not.toContain(firstRoot)
    expect(second).not.toContain(secondRoot)
    expect(first).not.toContain('FIRST_HASH')
    expect(second).not.toContain('SECOND_HASH')
    expect(first).toContain('src/routes/__root.tsx')
  })
})
