import { describe, it, expect } from 'vitest'

// Manifest shape check (moved from tests/e2e/extension-smoke.test.ts so the
// vitest suite is not double-picked-up under playwright's testDir.)
describe('extension manifest shape', () => {
  it('is MV3 with required permissions and hosts', async () => {
    const fs = await import('node:fs/promises')
    const raw = await fs.readFile('apps/extension/manifest.json', 'utf-8')
    const m = JSON.parse(raw)
    expect(m.manifest_version).toBe(3)
    expect(m.permissions).toContain('storage')
    expect(m.host_permissions.some((h: string) => h.includes('chatgpt.com'))).toBe(true)
  })
})
