import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type WorkflowStep = {
  uses?: string
  run?: string
  with?: { version?: string | number }
}

type Workflow = {
  on: {
    push: { branches: Array<string> }
    pull_request: { branches: Array<string> }
  }
  jobs: Record<string, { steps?: Array<WorkflowStep> }>
}

describe('CI pnpm reproducibility', () => {
  it('pins every pnpm setup and freezes every CI install', () => {
    const workflow = parse(
      readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
    ) as Workflow
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

  it('runs Electron parity CI for the picknik-fixes integration branch', () => {
    const workflow = parse(
      readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
    ) as Workflow

    expect(workflow.on.push.branches).toContain('picknik-fixes')
    expect(workflow.on.pull_request.branches).toContain('picknik-fixes')
  })
})
