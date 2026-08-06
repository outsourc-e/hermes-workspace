import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type WorkflowStep = {
  name?: string
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

type PackageJson = {
  packageManager?: string
  scripts?: Record<string, string>
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

  it('pins the public installer to the package pnpm version and a frozen lockfile', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageJson
    const installer = readFileSync(resolve(process.cwd(), 'install.sh'), 'utf8')

    expect(packageJson.packageManager).toBe('pnpm@10.15.0')
    expect(installer).toContain('readonly PNPM_VERSION="10.15.0"')
    expect(installer).toContain('corepack "pnpm@${PNPM_VERSION}" "$@"')
    expect(installer).toContain('npx --yes "pnpm@${PNPM_VERSION}" "$@"')
    expect(installer).toContain(
      'corepack enable --install-directory "$pnpm_bin_dir" pnpm',
    )
    expect(installer).toContain('chmod 0755 "$pnpm_bin"')
    expect(installer).toContain('command -v pnpm')
    expect(installer).toContain('pnpm --version')
    expect(installer).toContain('pnpm_cmd install --frozen-lockfile --silent')
    expect(installer).not.toMatch(/pnpm@latest|npm install -g pnpm(?:\s|$)/u)
    expect(installer).not.toContain('pnpm_cmd install --silent')
  })

  it('uses the checkout-independent Electron bundler and checks repeatability in CI', () => {
    const workflow = parse(
      readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
    ) as Workflow
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageJson
    const buildSteps = workflow.jobs.build?.steps ?? []

    expect(packageJson.scripts?.['electron:bundle-server']).toBe(
      'node scripts/bundle-electron-server.mjs',
    )
    expect(
      buildSteps.some(
        (step) =>
          step.name === 'Verify Electron server bundle is deterministic' &&
          step.run?.includes('cmp --silent') &&
          step.run.includes('pnpm electron:bundle-server'),
      ),
    ).toBe(true)
  })

  it('pins the Windows setup guide to the package pnpm version and a frozen lockfile', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { packageManager?: string }
    const windowsGuide = readFileSync(
      resolve(process.cwd(), 'docs/windows-setup-guide.md'),
      'utf8',
    )
    const packageManager = packageJson.packageManager

    expect(packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/u)
    expect(windowsGuide).toContain(`npm install -g ${packageManager}`)
    expect(windowsGuide).toContain('pnpm install --frozen-lockfile')
    expect(windowsGuide).not.toMatch(/^npm install -g pnpm\s*$/mu)
    expect(windowsGuide).not.toMatch(/^pnpm install\s*$/mu)
  })
})
