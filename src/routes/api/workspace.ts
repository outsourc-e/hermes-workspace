/**
 * Hermes workspace API.
 *
 * Important distinction: HERMES_HOME / ~/.hermes is Hermes state/config, not the
 * user's project workspace. Workspace resolution intentionally mirrors the
 * Hermes Web UI semantics: active profile config first, then user workspace
 * defaults such as ~/workspace. Never fall back to ~/.hermes as a workspace.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import YAML from 'yaml'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  getActiveProfileName,
  readProfile,
} from '../../server/profiles-browser'

type WorkspaceEntry = {
  name: string
  path: string
}

type WorkspaceDetectionResponse = {
  path: string
  folderName: string
  source: string
  isValid: boolean
  workspaces: Array<WorkspaceEntry>
  last: string
}

type WorkspaceState = {
  workspaces?: Array<WorkspaceEntry>
  last?: string
}

function extractFolderName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.at(-1) || 'workspace'
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
  return input
}

function normalizeCandidate(input: string): string {
  return path.resolve(expandHome(input.trim()))
}

function pathContains(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return (
    Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  )
}

function isPathOrChild(parent: string, candidate: string): boolean {
  const normalizedParent = normalizeCandidate(parent)
  const normalizedCandidate = normalizeCandidate(candidate)
  return (
    normalizedCandidate === normalizedParent ||
    pathContains(normalizedParent, normalizedCandidate)
  )
}

function exactBlockedSystemRoots(): Array<string> {
  return ['/', 'C:/']
}

function blockedSystemSubtrees(): Array<string> {
  return [
    '/bin',
    '/sbin',
    '/etc',
    '/usr',
    '/boot',
    '/proc',
    '/sys',
    '/dev',
    '/root',
    '/private/etc',
    '/private/var/db',
    '/private/var/log',
    'C:/Windows',
    'C:/Program Files',
    'C:/Program Files (x86)',
  ]
}

function isBlockedSystemPath(candidatePath: string): boolean {
  const normalized = normalizeCandidate(candidatePath)
  return (
    exactBlockedSystemRoots().some(
      (root) => normalizeCandidate(root) === normalized,
    ) || blockedSystemSubtrees().some((root) => isPathOrChild(root, normalized))
  )
}

function isHermesStatePath(candidatePath: string): boolean {
  const normalized = normalizeCandidate(candidatePath)
  const stateRoots = Array.from(
    new Set(
      [
        process.env.HERMES_HOME,
        process.env.CLAUDE_HOME,
        path.join(os.homedir(), '.hermes'),
        activeProfileHome(),
      ]
        .map((value) => readString(value))
        .filter(Boolean)
        .map(normalizeCandidate),
    ),
  )

  return stateRoots.some(
    (root) => normalized === root || pathContains(root, normalized),
  )
}

function assertWorkspaceAllowed(candidatePath: string): void {
  if (isHermesStatePath(candidatePath)) {
    throw new Error(
      'Hermes profile/state directories cannot be used as workspaces',
    )
  }
  if (isBlockedSystemPath(candidatePath)) {
    throw new Error(
      `System directories cannot be used as workspaces: ${candidatePath}`,
    )
  }
}

async function isValidDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function readYamlConfig(
  configPath: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    const parsed = YAML.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function firstValidDirectory(
  candidates: Array<{ path: string; source: string; create?: boolean }>,
): Promise<{ path: string; source: string } | null> {
  for (const candidate of candidates) {
    const raw = candidate.path.trim()
    if (!raw || raw === '.') continue
    const resolved = normalizeCandidate(raw)
    if (candidate.create) {
      try {
        await fs.mkdir(resolved, { recursive: true })
      } catch {
        // Continue to next candidate.
      }
    }
    if (isHermesStatePath(resolved) || isBlockedSystemPath(resolved)) continue
    if (await isValidDirectory(resolved)) {
      return { path: resolved, source: candidate.source }
    }
  }
  return null
}

function activeProfileHome(): string {
  try {
    const active = getActiveProfileName()
    return readProfile(active).path
  } catch {
    return (
      process.env.HERMES_HOME ??
      process.env.CLAUDE_HOME ??
      path.join(os.homedir(), '.hermes')
    )
  }
}

function workspaceStateDir(): string {
  return path.join(activeProfileHome(), 'webui_state')
}

function workspaceStateFile(): string {
  return path.join(workspaceStateDir(), 'workspaces.json')
}

function lastWorkspaceFile(): string {
  return path.join(workspaceStateDir(), 'last_workspace.txt')
}

async function readWorkspaceState(): Promise<WorkspaceState> {
  try {
    const raw = await fs.readFile(workspaceStateFile(), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed))
      return { workspaces: parsed as Array<WorkspaceEntry> }
    if (parsed && typeof parsed === 'object') return parsed as WorkspaceState
  } catch {
    // No persisted state yet.
  }
  return {}
}

async function writeWorkspaceState(state: WorkspaceState): Promise<void> {
  const stateDir = workspaceStateDir()
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(
    workspaceStateFile(),
    JSON.stringify(
      {
        workspaces: state.workspaces ?? [],
        last: state.last ?? '',
      },
      null,
      2,
    ),
    'utf-8',
  )
  if (state.last) {
    await fs.writeFile(lastWorkspaceFile(), `${state.last}\n`, 'utf-8')
  }
}

async function configuredDefaultWorkspace(): Promise<{
  path: string
  source: string
} | null> {
  const profileHome = activeProfileHome()
  const cfg = await readYamlConfig(path.join(profileHome, 'config.yaml'))
  const terminal = cfg.terminal
  const terminalCwd =
    terminal && typeof terminal === 'object' && !Array.isArray(terminal)
      ? readString((terminal as Record<string, unknown>).cwd)
      : ''

  return firstValidDirectory([
    { path: process.env.HERMES_WORKSPACE_DIR ?? '', source: 'env' },
    { path: process.env.CLAUDE_WORKSPACE_DIR ?? '', source: 'env' },
    { path: process.env.HERMES_WEBUI_DEFAULT_WORKSPACE ?? '', source: 'env' },
    { path: readString(cfg.workspace), source: 'config.workspace' },
    {
      path: readString(cfg.default_workspace),
      source: 'config.default_workspace',
    },
    { path: terminalCwd, source: 'config.terminal.cwd' },
    { path: path.join(os.homedir(), 'workspace'), source: 'home.workspace' },
    { path: path.join(os.homedir(), 'work'), source: 'home.work' },
    {
      path: path.join(os.homedir(), 'workspace'),
      source: 'home.workspace.created',
      create: true,
    },
  ])
}

function dedupeWorkspaces(
  workspaces: Array<WorkspaceEntry>,
): Array<WorkspaceEntry> {
  const seen = new Set<string>()
  const cleaned: Array<WorkspaceEntry> = []
  for (const workspace of workspaces) {
    const rawPath = readString(workspace.path)
    if (!rawPath) continue
    const normalized = normalizeCandidate(rawPath)
    if (isHermesStatePath(normalized) || isBlockedSystemPath(normalized))
      continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    const name = readString(workspace.name) || extractFolderName(normalized)
    cleaned.push({ name: name === 'default' ? 'Home' : name, path: normalized })
  }
  return cleaned
}

async function cleanExistingWorkspaces(
  workspaces: Array<WorkspaceEntry>,
): Promise<Array<WorkspaceEntry>> {
  const cleaned = dedupeWorkspaces(workspaces)
  const existing: Array<WorkspaceEntry> = []
  for (const workspace of cleaned) {
    if (await isValidDirectory(workspace.path)) existing.push(workspace)
  }
  return existing
}

export async function loadWorkspaceCatalog(): Promise<WorkspaceDetectionResponse> {
  const state = await readWorkspaceState()
  const configured = await configuredDefaultWorkspace()
  const fallback = configured ?? { path: '', source: 'none' }
  let workspaces = await cleanExistingWorkspaces(state.workspaces ?? [])

  if (workspaces.length === 0 && fallback.path) {
    workspaces = [{ name: 'Home', path: fallback.path }]
  }

  // Priority 2: Environment variable
  const envWorkspace =
    process.env.HERMES_WORKSPACE_DIR?.trim() ||
    process.env.CLAUDE_WORKSPACE_DIR?.trim()
  if (envWorkspace) {
    const isValid = await isValidDirectory(envWorkspace)
    if (isValid) {
      return {
        path: envWorkspace,
        folderName: extractFolderName(envWorkspace),
        source: 'env',
        isValid: true,
        workspaces,
        last: envWorkspace,
      }
    }
  }

  const savedLast = readString(state.last)
  const lastFromFile = await (async () => {
    try {
      return (await fs.readFile(lastWorkspaceFile(), 'utf-8')).trim()
    } catch {
      return ''
    }
  })()
  const lastCandidate =
    [savedLast, lastFromFile, fallback.path].find(Boolean) ?? ''
  const normalizedLast = lastCandidate ? normalizeCandidate(lastCandidate) : ''
  const activeWorkspace =
    workspaces.find((workspace) => workspace.path === normalizedLast) ??
    workspaces.at(0)
  const active =
    activeWorkspace ??
    (fallback.path ? { name: 'Home', path: fallback.path } : undefined)
  const activePath = active ? active.path : ''

  return {
    path: activePath,
    folderName: active ? active.name || extractFolderName(active.path) : '',
    source:
      activePath && activePath === fallback.path
        ? fallback.source
        : 'workspace-state',
    isValid: Boolean(activePath),
    workspaces,
    last: activePath,
  }
}

export async function saveWorkspaceSelection(input: {
  path?: string
  name?: string
}): Promise<WorkspaceDetectionResponse> {
  const rawPath = readString(input.path)
  if (!rawPath) throw new Error('path is required')
  const target = normalizeCandidate(rawPath)
  assertWorkspaceAllowed(target)
  if (!(await isValidDirectory(target))) {
    throw new Error(`Path is not an existing directory: ${target}`)
  }

  const current = await loadWorkspaceCatalog()
  const next = dedupeWorkspaces([
    ...current.workspaces,
    {
      path: target,
      name:
        readString(input.name) ||
        (current.workspaces.length === 0 ? 'Home' : extractFolderName(target)),
    },
  ])
  await writeWorkspaceState({ workspaces: next, last: target })
  return loadWorkspaceCatalog()
}

export const Route = createFileRoute('/api/workspace')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          return json(await loadWorkspaceCatalog())
        } catch (err) {
          return json(
            {
              path: '',
              folderName: '',
              source: 'error',
              isValid: false,
              workspaces: [],
              last: '',
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireJsonContentType(request)
        if (contentTypeError) return contentTypeError
        try {
          const body = (await request.json()) as {
            path?: string
            name?: string
          }
          return json(await saveWorkspaceSelection(body))
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
