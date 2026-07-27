import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { exportProjectsToObsidian } from './projects-obsidian-export'
import type { WorkspaceProjectsState } from './projects-store'

const originalEnv = { ...process.env }
let stateDir = ''
let vaultDir = ''

const baseState: WorkspaceProjectsState = {
  projects: [
    {
      id: 'seo-aeo-business',
      name: 'SEO/AEO Business',
      goal: 'Launch the business',
      instructions: 'Stay revenue-first',
      color: '#b98a44',
      icon: 'folder',
      createdAt: 10,
      updatedAt: 20,
    },
  ],
  sessionProjectMap: {
    sessionA: 'seo-aeo-business',
  },
  activeProjectId: 'seo-aeo-business',
}

beforeEach(async () => {
  process.env = { ...originalEnv, NODE_ENV: 'test' }
  stateDir = await mkdtemp(join(tmpdir(), 'workspace-project-export-state-'))
  vaultDir = await mkdtemp(join(tmpdir(), 'workspace-project-export-vault-'))
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})

afterEach(async () => {
  process.env = { ...originalEnv }
  await rm(stateDir, { recursive: true, force: true })
  await rm(vaultDir, { recursive: true, force: true })
})

describe('projects Obsidian export', () => {
  it('exports one markdown file per project and a full JSON snapshot', async () => {
    const result = await exportProjectsToObsidian(baseState, {
      vaultPath: vaultDir,
      timestamp: new Date('2026-07-22T21:30:00Z'),
    })

    expect(result.ok).toBe(true)
    const projectPath = join(vaultDir, 'Hermes', 'Projects', 'seo-aeo-business.md')
    const rawProject = await readFile(projectPath, 'utf-8')
    expect(rawProject).toContain('# SEO/AEO Business')
    expect(rawProject).toContain('## Goal\n\nLaunch the business')
    expect(rawProject).toContain('## Instructions\n\nStay revenue-first')

    const frontmatter = rawProject.slice(4, rawProject.indexOf('\n---\n', 4))
    expect(YAML.parse(frontmatter)).toMatchObject({
      id: 'seo-aeo-business',
      name: 'SEO/AEO Business',
      color: '#b98a44',
      icon: 'folder',
      createdAt: 10,
      updatedAt: 20,
    })

    const snapshotPath = join(
      vaultDir,
      'Hermes',
      'Projects',
      '_snapshots',
      'projects-20260722T213000Z.json',
    )
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8'))
    expect(snapshot).toEqual(baseState)
  })

  it('keeps only the latest 30 snapshots', async () => {
    const snapshotDir = join(vaultDir, 'Hermes', 'Projects', '_snapshots')
    await mkdir(snapshotDir, { recursive: true })
    for (let index = 0; index < 35; index += 1) {
      await writeFile(
        join(snapshotDir, `projects-20260722T2100${String(index).padStart(2, '0')}Z.json`),
        '{}\n',
        'utf-8',
      )
    }

    await exportProjectsToObsidian(baseState, {
      vaultPath: vaultDir,
      timestamp: new Date('2026-07-22T22:00:00Z'),
    })

    const snapshots = (await readdir(snapshotDir)).filter((name) => name.endsWith('.json')).sort()
    expect(snapshots).toHaveLength(30)
    expect(snapshots[0]).toBe('projects-20260722T210006Z.json')
    expect(snapshots.at(-1)).toBe('projects-20260722T220000Z.json')
  })

  it('logs export failures without throwing', async () => {
    const result = await exportProjectsToObsidian(baseState, {
      vaultPath: join(vaultDir, 'missing-vault'),
    })

    expect(result.ok).toBe(false)
    const log = await readFile(join(stateDir, 'projects-obsidian-export-errors.log'), 'utf-8')
    expect(log).toContain('Obsidian vault path is not readable')
  })
})
