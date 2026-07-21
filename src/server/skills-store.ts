import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export type WorkspaceSkillSummary = {
  id: string
  name: string
  title: string
  description: string
  category: string
  path: string
  size: number
  modifiedAt: string
  editable: boolean
}

export type WorkspaceSkillDetail = WorkspaceSkillSummary & {
  content: string
}

const SKILL_FILE = 'SKILL.md'

function hermesHome() {
  return process.env.HERMES_HOME?.trim() || process.env.CLAUDE_HOME?.trim() || path.join(os.homedir(), '.hermes')
}

function skillsRoot() {
  return path.join(hermesHome(), 'skills')
}

function skillsTrashRoot() {
  return path.join(hermesHome(), 'skills-trash')
}

function assertSafeSkillId(id: string) {
  const clean = id.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!clean || clean.includes('..') || path.isAbsolute(clean) || clean.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid skill id')
  }
  return clean
}

function skillFileForId(id: string) {
  const clean = assertSafeSkillId(id)
  const root = skillsRoot()
  const file = path.resolve(root, clean, SKILL_FILE)
  const relative = path.relative(root, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Skill path escapes skills root')
  return file
}

function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {}
  const raw = content.slice(3, end).split('\n')
  const out: Record<string, string> = {}
  for (const line of raw) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    out[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim()
  }
  return out
}

function headingTitle(content: string) {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || ''
}

function firstParagraph(content: string) {
  const withoutFrontmatter = content.startsWith('---') ? content.slice(content.indexOf('\n---', 3) + 4) : content
  const paragraph = withoutFrontmatter
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .find((line) => !line.startsWith('```'))
  return paragraph || ''
}

async function walkSkillFiles(dir: string, root = dir, depth = 0): Promise<Array<string>> {
  if (depth > 5) return []
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: Array<string> = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'references' || entry.name === 'assets' || entry.name === 'scripts' || entry.name === 'templates') continue
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === SKILL_FILE) {
      files.push(full)
    } else if (entry.isDirectory()) {
      files.push(...await walkSkillFiles(full, root, depth + 1))
    }
  }
  return files
}

export async function listWorkspaceSkills(): Promise<Array<WorkspaceSkillSummary>> {
  const root = skillsRoot()
  const files = await walkSkillFiles(root)
  const skills = await Promise.all(files.map(async (file) => {
    const content = await fs.readFile(file, 'utf8').catch(() => '')
    const stat = await fs.stat(file)
    const id = path.dirname(path.relative(root, file)).replace(/\\/g, '/')
    const fm = parseFrontmatter(content)
    const category = id.includes('/') ? id.split('/').slice(0, -1).join('/') : 'local'
    return {
      id,
      name: fm.name || path.basename(path.dirname(file)),
      title: fm.name || headingTitle(content) || path.basename(path.dirname(file)),
      description: fm.description || firstParagraph(content).slice(0, 220),
      category,
      path: file,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      editable: true,
    }
  }))
  return skills.sort((a, b) => a.id.localeCompare(b.id))
}

export async function readWorkspaceSkill(id: string): Promise<WorkspaceSkillDetail> {
  const file = skillFileForId(id)
  const content = await fs.readFile(file, 'utf8')
  const stat = await fs.stat(file)
  const fm = parseFrontmatter(content)
  const clean = assertSafeSkillId(id)
  const category = clean.includes('/') ? clean.split('/').slice(0, -1).join('/') : 'local'
  return {
    id: clean,
    name: fm.name || path.basename(path.dirname(file)),
    title: fm.name || headingTitle(content) || path.basename(path.dirname(file)),
    description: fm.description || firstParagraph(content).slice(0, 220),
    category,
    path: file,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    editable: true,
    content,
  }
}

function validateSkillContent(content: string) {
  const text = content.trim()
  if (!text) throw new Error('Skill content cannot be empty')
  if (!text.includes('name:') && !/^#\s+/m.test(text)) throw new Error('Skill content must include frontmatter name or a markdown title')
  if (text.length > 250_000) throw new Error('Skill content is too large')
}

function backupName(id: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${id.replace(/[^a-zA-Z0-9_-]+/g, '__')}__${stamp}.SKILL.md`
}

export async function updateWorkspaceSkill(id: string, content: string): Promise<WorkspaceSkillDetail & { backupPath: string }> {
  validateSkillContent(content)
  const file = skillFileForId(id)
  const current = await fs.readFile(file, 'utf8')
  const backupDir = path.join(hermesHome(), 'skill-backups')
  await fs.mkdir(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, backupName(assertSafeSkillId(id)))
  await fs.writeFile(backupPath, current)
  await fs.writeFile(file, content.endsWith('\n') ? content : `${content}\n`)
  return { ...await readWorkspaceSkill(id), backupPath }
}

export async function deleteWorkspaceSkill(id: string): Promise<{ ok: true; id: string; trashedPath: string }> {
  const clean = assertSafeSkillId(id)
  const file = skillFileForId(clean)
  await fs.stat(file)
  const sourceDir = path.dirname(file)
  const trashDir = path.join(skillsTrashRoot(), `${clean.replace(/[^a-zA-Z0-9_-]+/g, '__')}__${new Date().toISOString().replace(/[:.]/g, '-')}`)
  await fs.mkdir(path.dirname(trashDir), { recursive: true })
  await fs.rename(sourceDir, trashDir)
  return { ok: true, id: clean, trashedPath: trashDir }
}
