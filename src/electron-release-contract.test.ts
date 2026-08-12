import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type BuilderTargetOptions = {
  artifactName?: string
}

type BuilderConfig = {
  artifactName?: string
  dmg?: BuilderTargetOptions
  nsis?: BuilderTargetOptions
  portable?: BuilderTargetOptions
}

type PackageJson = {
  packageManager?: string
  scripts?: Record<string, string>
}

type WorkflowStep = {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
}

type WorkflowJob = {
  name?: string
  'runs-on'?: string
  steps?: Array<WorkflowStep>
}

type Workflow = {
  jobs: Record<string, WorkflowJob>
}

const workspaceRequire = createRequire(import.meta.url)

function readPackageJson(): PackageJson {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
  ) as PackageJson
}

describe('Electron release contracts', () => {
  it('gives every release target and architecture a collision-free artifact name', () => {
    const configPath = resolve(process.cwd(), 'electron-builder.config.cjs')
    delete workspaceRequire.cache[configPath]
    const config = workspaceRequire(configPath) as BuilderConfig
    const names = [
      config.dmg?.artifactName,
      config.nsis?.artifactName,
      config.portable?.artifactName,
    ]

    expect(config.artifactName).toBeUndefined()
    expect(names).toEqual([
      'hermes-workspace-${version}-mac-${arch}.${ext}',
      'hermes-workspace-${version}-windows-${arch}-setup.${ext}',
      'hermes-workspace-${version}-windows-${arch}-portable.${ext}',
    ])
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name).toContain('${arch}')
    }
  })

  it('builds and boots the Windows portable package in CI', () => {
    const packageJson = readPackageJson()
    const workflow = parse(
      readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
    ) as Workflow
    const portableJob = workflow.jobs['package-portable']
    const runs = (portableJob?.steps ?? [])
      .map((step) => step.run)
      .filter((run): run is string => Boolean(run))
    const smoke = readFileSync(
      resolve(process.cwd(), 'scripts/smoke-portable-package.ps1'),
      'utf8',
    )

    expect(packageJson.scripts?.['electron:package:portable']).toContain(
      'electron-builder --win portable --x64',
    )
    expect(packageJson.scripts?.['electron:smoke:portable']).toBe(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-portable-package.ps1',
    )
    expect(portableJob?.['runs-on']).toBe('windows-latest')
    expect(runs).toContain('pnpm install --frozen-lockfile')
    expect(runs).toContain('pnpm electron:package:portable')
    expect(runs).toContain('pnpm electron:smoke:portable')

    expect(smoke).toContain('hermes-workspace-*-windows-x64-portable.exe')
    expect(smoke).toContain('Start-Process')
    expect(smoke).toContain('http://127.0.0.1:3847/?desktop=1')
    expect(smoke).toContain('Hermes Workspace')
    expect(smoke).toContain('taskkill.exe')
  })
})
