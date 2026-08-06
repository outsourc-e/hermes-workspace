import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type WorkflowStep = {
  uses?: string
  run?: string
  with?: { version?: string | number }
}

describe('CI pnpm reproducibility', () => {
  it('pins every pnpm setup and freezes every CI install', () => {
    const workflow = parse(
      readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
    ) as { jobs: Record<string, { steps?: Array<WorkflowStep> }> }
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? [])
    const pnpmSetups = steps.filter((step) =>
      step.uses?.startsWith('pnpm/action-setup@'),
    )
    const pnpmInstalls = steps.filter((step) =>
      step.run?.includes('pnpm install'),
    )

    expect(pnpmSetups.length).toBeGreaterThan(0)
    expect(pnpmSetups.map((step) => String(step.with?.version))).toEqual(
      pnpmSetups.map(() => '10.15.0'),
    )
    expect(pnpmInstalls.length).toBeGreaterThan(0)
    for (const step of pnpmInstalls) {
      expect(step.run).toContain('pnpm install --frozen-lockfile')
      expect(step.run).not.toContain('--no-frozen-lockfile')
    }
  })
})
