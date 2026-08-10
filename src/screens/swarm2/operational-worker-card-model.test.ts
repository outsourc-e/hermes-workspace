import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('OperationalWorkerCard model assignment', () => {
  it('does not expose a cosmetic localStorage-only model selector', () => {
    const source = readFileSync(
      new URL('./operational-worker-card.tsx', import.meta.url),
      'utf8',
    )
    expect(source).not.toContain('const MODEL_OPTIONS')
    expect(source).not.toContain('modelLabel: draftModel')
    expect(source).toContain('Settings → Orchestration')
  })
})
