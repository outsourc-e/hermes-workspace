import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  normalizeProjectsState,
  readProjectsState,
  writeProjectsState,
} from './projects-store'

const originalEnv = { ...process.env }
let stateDir = ''

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), 'workspace-projects-'))
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})

afterEach(async () => {
  process.env = { ...originalEnv }
  if (stateDir) await rm(stateDir, { recursive: true, force: true })
})

describe('projects store', () => {
  it('reports uninitialized empty state before the server file exists', async () => {
    await expect(readProjectsState()).resolves.toEqual({
      projects: [],
      sessionProjectMap: {},
      activeProjectId: null,
      initialized: false,
    })
  })

  it('persists normalized project state for cross-device reads', async () => {
    const saved = await writeProjectsState({
      projects: [
        {
          id: 'seo-aeo',
          name: 'SEO/AEO',
          goal: 'Launch',
          instructions: 'Revenue-first',
          color: '#22c55e',
          icon: 'folder',
          createdAt: 10,
          updatedAt: 20,
        },
      ],
      sessionProjectMap: {
        abc: 'seo-aeo',
        orphan: 'missing-project',
      },
      activeProjectId: 'seo-aeo',
    })

    expect(saved.sessionProjectMap).toEqual({ abc: 'seo-aeo' })
    await expect(readProjectsState()).resolves.toMatchObject({
      initialized: true,
      projects: [{ id: 'seo-aeo', name: 'SEO/AEO' }],
      sessionProjectMap: { abc: 'seo-aeo' },
      activeProjectId: 'seo-aeo',
    })
  })

  it('accepts old browser-storage sessionProjects shape during migration', () => {
    expect(
      normalizeProjectsState({
        projects: [{ id: 'one', name: 'One' }],
        sessionProjects: { sessionA: 'one' },
      }),
    ).toMatchObject({
      projects: [{ id: 'one', name: 'One', icon: 'folder' }],
      sessionProjectMap: { sessionA: 'one' },
    })
  })
})
