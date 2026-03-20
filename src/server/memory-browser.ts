import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type MemoryFileMeta = {
  path: string
  name: string
  size: number
  modified: string
}

export type MemorySearchMatch = {
  path: string
  line: number
  text: string
}

function isBrowserMemoryPath(relativePath: string): boolean {
  return (
    relativePath === 'MEMORY.md' ||
    relativePath.startsWith('memory/') ||
    relativePath.startsWith('memories/')
  )
}

function normalizeWorkspaceRoot(): string {
  return path.join(os.homedir(), '.hermes')
}

export function getMemoryWorkspaceRoot(): string {
  return path.resolve(normalizeWorkspaceRoot())
}

function normalizeRelativeMemoryPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim()
  if (!normalized) throw new Error('Path is required')
  if (normalized.startsWith('/')) throw new Error('Absolute paths are not allowed')
  if (normalized.includes('..')) throw new Error('Path traversal is not allowed')
  if (!normalized.toLowerCase().endsWith('.md')) throw new Error('Only Markdown files are allowed')
  return normalized
}

export function resolveMemoryFilePath(relativePath: string): { fullPath: string; relativePath: string } {
  const safeRelativePath = normalizeRelativeMemoryPath(relativePath)
  const workspaceRoot = getMemoryWorkspaceRoot()
  const fullPath = path.resolve(workspaceRoot, safeRelativePath)
  if (!fullPath.startsWith(workspaceRoot)) {
    throw new Error('Resolved path is outside workspace')
  }
  return { fullPath, relativePath: safeRelativePath }
}

function pushIfMarkdownFile(entries: Array<MemoryFileMeta>, workspaceRoot: string, fullPath: string) {
  if (!fullPath.toLowerCase().endsWith('.md')) return
  let stats: fs.Stats
  try {
    stats = fs.statSync(fullPath)
  } catch {
    return
  }
  if (!stats.isFile()) return

  const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/')
  if (!isBrowserMemoryPath(relativePath)) return

  entries.push({
    path: relativePath,
    name: path.basename(fullPath),
    size: stats.size,
    modified: stats.mtime.toISOString(),
  })
}

function shouldSkipDirectory(name: string): boolean {
  return name === '.git' || name === 'node_modules'
}

function walkWorkspaceDir(entries: Array<MemoryFileMeta>, workspaceRoot: string, dirPath: string) {
  let dirEntries: Array<string>
  try {
    dirEntries = fs.readdirSync(dirPath)
  } catch {
    return
  }

  for (const name of dirEntries) {
    const fullPath = path.join(dirPath, name)
    let stats: fs.Stats
    try {
      stats = fs.statSync(fullPath)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      if (shouldSkipDirectory(name)) continue
      walkWorkspaceDir(entries, workspaceRoot, fullPath)
      continue
    }
    pushIfMarkdownFile(entries, workspaceRoot, fullPath)
  }
}

function compareMemoryFiles(a: MemoryFileMeta, b: MemoryFileMeta): number {
  if (a.path === 'MEMORY.md' && b.path !== 'MEMORY.md') return -1
  if (b.path === 'MEMORY.md' && a.path !== 'MEMORY.md') return 1

  const aIsDaily = /^memories?\/\d{4}-\d{2}-\d{2}\.md$/.test(a.path)
  const bIsDaily = /^memories?\/\d{4}-\d{2}-\d{2}\.md$/.test(b.path)
  if (aIsDaily && bIsDaily) return b.path.localeCompare(a.path)

  const modifiedDiff = Date.parse(b.modified) - Date.parse(a.modified)
  if (modifiedDiff !== 0) return modifiedDiff
  return a.path.localeCompare(b.path)
}

export function listMemoryFiles(): Array<MemoryFileMeta> {
  const workspaceRoot = getMemoryWorkspaceRoot()
  const results: Array<MemoryFileMeta> = []

  walkWorkspaceDir(results, workspaceRoot, workspaceRoot)

  results.sort(compareMemoryFiles)
  return results
}

export function readMemoryFile(relativePath: string): string {
  const { fullPath } = resolveMemoryFilePath(relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

export function searchMemoryFiles(query: string): Array<MemorySearchMatch> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const matches: Array<MemorySearchMatch> = []
  const files = listMemoryFiles()

  for (const file of files) {
    let content = ''
    try {
      content = readMemoryFile(file.path)
    } catch {
      continue
    }
    const lines = content.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index] || ''
      if (!text.toLowerCase().includes(needle)) continue
      matches.push({
        path: file.path,
        line: index + 1,
        text,
      })
      if (matches.length >= 200) return matches
    }
  }

  return matches
}
