import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadWorkspaceCatalog, saveWorkspaceSelection } from './workspace'

const originalEnv = { ...process.env }
let tempRoot = ''

async function makeDir(...parts: Array<string>) {
  const dir = path.join(...parts)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hermes-workspace-route-'))
  process.env = { ...originalEnv }
  process.env.HERMES_HOME = path.join(tempRoot, '.hermes')
  delete process.env.HERMES_WORKSPACE_DIR
  delete process.env.CLAUDE_WORKSPACE_DIR
  delete process.env.HERMES_WEBUI_DEFAULT_WORKSPACE
  await fs.mkdir(process.env.HERMES_HOME, { recursive: true })
})

afterEach(async () => {
  process.env = { ...originalEnv }
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('workspace API catalog semantics', () => {
  it('uses the Hermes profile default workspace instead of ~/.hermes state', async () => {
    const project = await makeDir(tempRoot, 'workspace')
    await fs.writeFile(
      path.join(process.env.HERMES_HOME!, 'config.yaml'),
      `default_workspace: ${JSON.stringify(project)}\n`,
      'utf-8',
    )

    const catalog = await loadWorkspaceCatalog()

    expect(catalog).toMatchObject({
      path: project,
      folderName: 'Home',
      source: 'config.default_workspace',
      isValid: true,
      last: project,
    })
    expect(catalog.workspaces).toEqual([{ name: 'Home', path: project }])
    expect(catalog.path).not.toBe(process.env.HERMES_HOME)
  })

  it('ignores legacy persisted Hermes state paths as workspaces', async () => {
    const project = await makeDir(tempRoot, 'workspace')
    await fs.writeFile(
      path.join(process.env.HERMES_HOME!, 'config.yaml'),
      `default_workspace: ${JSON.stringify(project)}
`,
      'utf-8',
    )
    await fs.mkdir(path.join(process.env.HERMES_HOME!, 'webui_state'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(process.env.HERMES_HOME!, 'webui_state', 'workspaces.json'),
      JSON.stringify({
        workspaces: [
          { name: 'Bad Hermes Home', path: process.env.HERMES_HOME },
          { name: 'Home', path: project },
        ],
        last: process.env.HERMES_HOME,
      }),
      'utf-8',
    )
    await fs.writeFile(
      path.join(process.env.HERMES_HOME!, 'webui_state', 'last_workspace.txt'),
      `${process.env.HERMES_HOME}
`,
      'utf-8',
    )

    const catalog = await loadWorkspaceCatalog()

    expect(catalog.path).toBe(project)
    expect(catalog.workspaces).toEqual([{ name: 'Home', path: project }])
  })

  it('rejects manual selection of Hermes state directories', async () => {
    await expect(
      saveWorkspaceSelection({ path: process.env.HERMES_HOME!, name: 'State' }),
    ).rejects.toThrow('cannot be used as workspaces')
  })

  it('rejects manual selection of system directories', async () => {
    await expect(
      saveWorkspaceSelection({ path: '/', name: 'Root' }),
    ).rejects.toThrow('System directories cannot be used as workspaces')
  })

  it('honors CLAUDE_HOME as the profile root when HERMES_HOME is unset', async () => {
    const claudeHome = path.join(tempRoot, '.claude-home')
    const project = await makeDir(tempRoot, 'claude-workspace')
    delete process.env.HERMES_HOME
    process.env.CLAUDE_HOME = claudeHome
    await fs.mkdir(claudeHome, { recursive: true })
    await fs.writeFile(
      path.join(claudeHome, 'config.yaml'),
      `default_workspace: ${JSON.stringify(project)}
`,
      'utf-8',
    )

    const catalog = await loadWorkspaceCatalog()

    expect(catalog.path).toBe(project)
    await saveWorkspaceSelection({ path: project, name: 'Claude Workspace' })
    await expect(
      fs.readFile(
        path.join(claudeHome, 'webui_state', 'last_workspace.txt'),
        'utf-8',
      ),
    ).resolves.toBe(`${project}
`)
  })

  it('persists the selected workspace in profile-local Web UI state', async () => {
    const homeProject = await makeDir(tempRoot, 'workspace')
    const selectedProject = await makeDir(tempRoot, 'client-app')
    process.env.HERMES_WEBUI_DEFAULT_WORKSPACE = homeProject

    const saved = await saveWorkspaceSelection({
      path: selectedProject,
      name: 'Client App',
    })

    expect(saved.path).toBe(selectedProject)
    expect(saved.folderName).toBe('Client App')
    expect(saved.workspaces).toContainEqual({
      name: 'Client App',
      path: selectedProject,
    })
    await expect(
      fs.readFile(
        path.join(
          process.env.HERMES_HOME!,
          'webui_state',
          'last_workspace.txt',
        ),
        'utf-8',
      ),
    ).resolves.toBe(`${selectedProject}\n`)
  })
})
