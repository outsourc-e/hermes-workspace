/**
 * Test runner wrapper: adapt NODE_OPTIONS across Node LTS generations.
 *
 * Node 26 ships an experimental global `localStorage`. Inside vitest's jsdom
 * environment that global shadows jsdom's working `window.localStorage` —
 * yielding `undefined (reading 'clear')` in every beforeEach that resets
 * storage — unless the global is provisioned with a backing file via
 * `--localstorage-file`. Node < 26 does not know that flag at all, so the
 * option is attached ONLY on 26+; on older runtimes this is a plain
 * passthrough. `hermes verify` found this: the agent launcher puts its own
 * Node 26 first on PATH, so the same `pnpm test` that was green in a user
 * shell (Node 22) failed 4 jsdom storage tests under verify.
 *
 * Usage from npm scripts: `node scripts/run-tests.mjs run` (any vitest args
 * are forwarded verbatim).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vitestEntry = resolve(REPO_ROOT, 'node_modules/vitest/vitest.mjs')

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor >= 26) {
  const backing = join(mkdtempSync(join(tmpdir(), 'vitest-localstorage-')), 'ls.json')
  const existing = process.env.NODE_OPTIONS ?? ''
  process.env.NODE_OPTIONS = existing
    ? `${existing} --localstorage-file=${backing}`
    : `--localstorage-file=${backing}`
}

const result = spawnSync(process.execPath, [vitestEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  cwd: REPO_ROOT,
})
process.exit(result.status ?? 1)
