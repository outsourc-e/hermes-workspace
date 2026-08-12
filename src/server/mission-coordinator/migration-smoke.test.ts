import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateLegacyMissions } from './migration'

describe('migration smoke', () => {
  it('dry-runs a legacy mission without mutation', () => {
    const dir = mkdtempSync('/tmp/hermes-migration-smoke-')
    const source = join(dir, 'legacy.json')
    writeFileSync(source, JSON.stringify({ missions: [{ id: 'legacy-smoke', title: 'Legacy', assignments: [{ id: 'a1', workerId: 'builder', task: 'Build' }] }] }))
    expect(migrateLegacyMissions(source)).toMatchObject({ dryRun: true, discovered: 1, imported: 1, errors: [] })
    rmSync(dir, { recursive: true, force: true })
  })
})
