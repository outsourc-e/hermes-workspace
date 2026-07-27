import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import YAML from 'yaml'
import { getStateDir } from './workspace-state-dir'
import type { WorkspaceProject, WorkspaceProjectsState } from './projects-store'

const DEFAULT_VAULT_PATH = join(
  homedir(),
  'Documents/Obsidian Vault/Bethanys Second Brain',
)
const SNAPSHOT_KEEP_COUNT = 30
const EXPORT_DEBOUNCE_MS = 350

let exportTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: WorkspaceProjectsState | null = null

export type ProjectExportResult = {
  ok: boolean
  vaultPath: string
  projectFiles: string[]
  snapshotFile: string | null
  error?: string
}

type ExportOptions = {
  vaultPath?: string
  timestamp?: Date
}

function projectExportEnabled(): boolean {
  const value = process.env.HERMES_WORKSPACE_PROJECT_EXPORT?.trim().toLowerCase()
  if (value === '0' || value === 'false' || value === 'off') return false
  // Vitest sets NODE_ENV=test. Avoid tests writing into Ryan's real vault unless
  // a test calls exportProjectsToObsidian directly with an explicit temp vault.
  return process.env.NODE_ENV !== 'test'
}

function resolveVaultPath(explicit?: string): string {
  return (
    explicit?.trim() ||
    process.env.OBSIDIAN_VAULT_PATH?.trim() ||
    DEFAULT_VAULT_PATH
  )
}

function projectsDir(vaultPath: string): string {
  return join(vaultPath, 'Hermes', 'Projects')
}

function snapshotsDir(vaultPath: string): string {
  return join(projectsDir(vaultPath), '_snapshots')
}

function exportLogPath(): string {
  return join(getStateDir(), 'projects-obsidian-export-errors.log')
}

function safeProjectFileName(id: string): string {
  const safe = id.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${safe || 'project'}.md`
}

function isoNoPunctuation(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function yamlFrontmatter(project: WorkspaceProject): string {
  return YAML.stringify({
    id: project.id,
    name: project.name,
    color: project.color,
    icon: project.icon,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ...(project.archivedAt ? { archivedAt: project.archivedAt } : {}),
  }).trimEnd()
}

function projectMarkdown(project: WorkspaceProject): string {
  const goal = project.goal.trim() || '_No goal set._'
  const instructions = project.instructions.trim() || '_No instructions set._'
  return `---\n${yamlFrontmatter(project)}\n---\n\n# ${project.name}\n\n## Goal\n\n${goal}\n\n## Instructions\n\n${instructions}\n`
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmpPath, content, 'utf-8')
  await rename(tmpPath, filePath)
}

async function verifyMarkdownFrontmatter(filePath: string): Promise<void> {
  const raw = await readFile(filePath, 'utf-8')
  if (!raw.startsWith('---\n')) throw new Error(`Missing frontmatter: ${filePath}`)
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) throw new Error(`Unclosed frontmatter: ${filePath}`)
  const parsed = YAML.parse(raw.slice(4, end))
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid frontmatter object: ${filePath}`)
  }
}

async function verifyJsonSnapshot(filePath: string): Promise<void> {
  const raw = await readFile(filePath, 'utf-8')
  const parsed = JSON.parse(raw) as Partial<WorkspaceProjectsState>
  if (!Array.isArray(parsed.projects) || typeof parsed.sessionProjectMap !== 'object') {
    throw new Error(`Invalid projects snapshot shape: ${filePath}`)
  }
}

async function pruneOldSnapshots(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [])
  const snapshots = names
    .filter((name) => /^projects-\d{8}T\d{6}Z\.json$/.test(name))
    .sort()
  const remove = snapshots.slice(0, Math.max(0, snapshots.length - SNAPSHOT_KEEP_COUNT))
  await Promise.all(remove.map((name) => unlink(join(dir, name)).catch(() => undefined)))
}

async function logProjectExportFailure(error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const line = `${new Date().toISOString()} ${message}\n`
  try {
    await mkdir(getStateDir(), { recursive: true })
    const existing = await readFile(exportLogPath(), 'utf-8').catch(() => '')
    await writeFile(exportLogPath(), `${existing}${line}`, 'utf-8')
  } catch {
    // Last-resort logging only; project writes must not fail because logging fails.
  }
}

export async function exportProjectsToObsidian(
  state: WorkspaceProjectsState,
  options: ExportOptions = {},
): Promise<ProjectExportResult> {
  const vaultPath = resolveVaultPath(options.vaultPath)
  const projectDir = projectsDir(vaultPath)
  const snapshotDir = snapshotsDir(vaultPath)
  const writtenProjectFiles: string[] = []
  let snapshotFile: string | null = null

  try {
    if (!existsSync(vaultPath)) {
      throw new Error(`Obsidian vault path is not readable: ${vaultPath}`)
    }

    await mkdir(projectDir, { recursive: true })
    await mkdir(snapshotDir, { recursive: true })

    for (const project of state.projects) {
      const filePath = join(projectDir, safeProjectFileName(project.id))
      await writeAtomic(filePath, projectMarkdown(project))
      await verifyMarkdownFrontmatter(filePath)
      writtenProjectFiles.push(filePath)
    }

    snapshotFile = join(
      snapshotDir,
      `projects-${isoNoPunctuation(options.timestamp ?? new Date())}.json`,
    )
    await writeAtomic(snapshotFile, `${JSON.stringify(state, null, 2)}\n`)
    await verifyJsonSnapshot(snapshotFile)
    await pruneOldSnapshots(snapshotDir)

    return { ok: true, vaultPath, projectFiles: writtenProjectFiles, snapshotFile }
  } catch (error) {
    await logProjectExportFailure(error)
    return {
      ok: false,
      vaultPath,
      projectFiles: writtenProjectFiles,
      snapshotFile,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function scheduleProjectsObsidianExport(state: WorkspaceProjectsState): void {
  if (!projectExportEnabled()) return
  pendingState = JSON.parse(JSON.stringify(state)) as WorkspaceProjectsState
  if (exportTimer) clearTimeout(exportTimer)
  exportTimer = setTimeout(() => {
    const stateToExport = pendingState
    pendingState = null
    exportTimer = null
    if (stateToExport) void exportProjectsToObsidian(stateToExport)
  }, EXPORT_DEBOUNCE_MS)
}
