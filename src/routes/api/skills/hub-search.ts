import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'

const execFileAsync = promisify(execFile)

type SkillSearchResult = {
  id: string
  name: string
  description: string
  author: string
  category: string
  tags: Array<string>
  source: string
  trust: string
  installCommand: string
  installed: boolean
}

type SkillSearchPayload = {
  ok?: boolean
  results: Array<SkillSearchResult>
  source: string
  total?: number
  warning?: string
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end === -1) return {}
  const frontmatter = content.slice(3, end).trim()
  const result: Record<string, unknown> = {}

  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value
        .slice(1, -1)
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      result[key] = value.replace(/^['"]|['"]$/g, '')
    }
  }

  return result
}

async function walkSkillFiles(dir: string): Promise<Array<string>> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: Array<string> = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkSkillFiles(fullPath)))
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      files.push(fullPath)
    }
  }

  return files
}

async function searchBundledSkills(
  query: string,
  limit: number,
): Promise<SkillSearchPayload> {
  const skillsRoot = path.join(process.cwd(), 'skills')
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const files = await walkSkillFiles(skillsRoot)
  const results: Array<SkillSearchResult & { score: number }> = []

  for (const file of files) {
    const content = await readFile(file, 'utf-8').catch(() => '')
    if (!content) continue
    const metadata = parseFrontmatter(content)
    const name = normalizeText(metadata.name) || path.basename(path.dirname(file))
    const description = normalizeText(metadata.description)
    const category = path.relative(skillsRoot, path.dirname(file)).split(path.sep)[0] || ''
    const tags = Array.isArray(metadata.tags)
      ? metadata.tags.map(String)
      : normalizeText(metadata.tags)
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
    const haystack = [name, description, category, tags.join(' '), content]
      .join('\n')
      .toLowerCase()
    const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0)
    if (score === 0) continue

    results.push({
      id: name,
      name,
      description,
      author: normalizeText(metadata.author) || 'bundled',
      category,
      tags,
      source: 'Bundled Skills',
      trust: 'bundled',
      installCommand: `hermes skills install ${name}`,
      installed: true,
      score,
    })
  }

  const sorted = results
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result)

  return {
    ok: true,
    results: sorted,
    source: 'bundled-skills-fallback',
    total: sorted.length,
    warning:
      'Skills Hub search is unavailable in this runtime; showing bundled skills fallback.',
  }
}

async function searchPythonSkillsHub(
  query: string,
  limit: number,
  source: string,
): Promise<SkillSearchPayload> {
  const scriptPath = path.join(process.cwd(), 'scripts/skills-search.py')
  const { stdout } = await execFileAsync(
    'python3',
    [scriptPath, query, String(limit), source],
    {
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 2,
    },
  )

  return JSON.parse(stdout.trim()) as SkillSearchPayload
}

export const Route = createFileRoute('/api/skills/hub-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const query = (url.searchParams.get('q') || '').trim()
          const limit = Math.min(
            50,
            Math.max(1, Number(url.searchParams.get('limit') || '20')),
          )
          const source = (
            url.searchParams.get('source') || 'all'
          ).trim()

          if (!query) {
            return json({ results: [], source: 'idle' })
          }

          try {
            return json(await searchPythonSkillsHub(query, limit, source))
          } catch {
            return json(await searchBundledSkills(query, limit))
          }
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search skills hub',
              results: [],
              source: 'error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
