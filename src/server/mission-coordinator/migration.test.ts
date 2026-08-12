import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateLegacyMissions } from './migration'

describe('legacy mission migration', () => {
  it('is dry-run by default and does not create coordination state', () => {
    const dir = mkdtempSync('/tmp/hermes-migration-')
    const source = join(dir, 'missions.json')
    writeFileSync(source, JSON.stringify({ missions: [{ id: 'legacy-1', title: 'Legacy', assignments: [{ id: 'a', workerId: 'builder', task: 'Build' }] }] }))
    const report = migrateLegacyMissions(source)
    expect(report).toMatchObject({ dryRun: true, discovered: 1, imported: 1 })
    expect(readFileSync(source, 'utf8')).toContain('legacy-1')
    rmSync(dir, { recursive: true, force: true })
  })
})
