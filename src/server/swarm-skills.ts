/**
 * Skill harvesting for the swarm.
 *
 * When a worker finishes a task with a DONE checkpoint that carries real
 * evidence (files changed / commands run), we distill it into a small
 * markdown "skill" note in the knowledge vault (vault/skills/). On later
 * dispatches, skills whose keywords overlap the new task are injected into
 * the worker prompt, so the swarm reuses what already worked instead of
 * rediscovering it.
 *
 * Deterministic by design — no LLM call in the hot path. The km-agent can
 * rewrite/curate these notes later; this module only guarantees capture
 * and retrieval.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

export function skillsDir(): string {
  const vault =
    process.env.HERMES_KNOWLEDGE_VAULT || join(homedir(), 'workspace', 'vault')
  return join(vault, 'skills')
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'be', 'this', 'that', 'it', 'as', 'at', 'by', 'from',
  'your', 'you', 'we', 'our', 'their', 'then', 'than', 'into', 'about',
  'task', 'please', 'make', 'sure', 'also', 'any', 'all', 'not', 'no',
])

/** Meaningful lowercase keywords from a task string. Exported for tests. */
export function taskKeywords(task: string): Array<string> {
  const words = task
    .toLowerCase()
    .replace(/[^a-z0-9./_-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  return [...new Set(words)]
}

function slugify(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || 'skill'
  )
}

/**
 * Harvest a completed checkpoint into a vault skill note. Only checkpoints
 * with concrete evidence are worth keeping — DONE + (files or commands).
 * Returns the file path when written, null when skipped.
 */
export function harvestSkillFromCheckpoint(input: {
  workerId: string
  task: string
  checkpoint: ParsedSwarmCheckpoint
}): string | null {
  try {
    const cp = input.checkpoint
    if (cp.stateLabel !== 'DONE') return null
    const files = (cp.filesChanged || '').trim()
    const commands = (cp.commandsRun || '').trim()
    const hasEvidence =
      (files && files.toLowerCase() !== 'none') ||
      (commands && commands.toLowerCase() !== 'none')
    if (!hasEvidence) return null

    const dir = skillsDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const slug = slugify(input.task)
    const path = join(dir, `${slug}.md`)
    const keywords = taskKeywords(input.task).slice(0, 12).join(', ')
    const body = [
      `# Skill: ${input.task.slice(0, 120)}`,
      '',
      `- worker: ${input.workerId}`,
      `- harvested: ${new Date().toISOString()}`,
      `- keywords: ${keywords}`,
      '',
      '## Task',
      input.task.slice(0, 600),
      '',
      '## What worked',
      cp.result ? cp.result.slice(0, 1200) : '(no result text)',
      '',
      '## Commands run',
      commands && commands.toLowerCase() !== 'none' ? commands : '(none recorded)',
      '',
      '## Files changed',
      files && files.toLowerCase() !== 'none' ? files : '(none recorded)',
      '',
    ].join('\n')
    writeFileSync(path, body, 'utf8')
    return path
  } catch {
    return null
  }
}

export type SkillMatch = {
  file: string
  title: string
  score: number
  snippet: string
}

/**
 * Find vault skills relevant to a new task by keyword overlap. Cheap: reads
 * only the frontmatter-ish head of each note for scoring, caps candidates.
 */
export function matchSkillsForTask(
  task: string,
  max: number = 2,
): Array<SkillMatch> {
  try {
    const dir = skillsDir()
    if (!existsSync(dir)) return []
    const keywords = new Set(taskKeywords(task))
    if (keywords.size === 0) return []

    const matches: Array<SkillMatch> = []
    const entries = readdirSync(dir).filter((f) => f.endsWith('.md'))
    for (const entry of entries.slice(0, 400)) {
      const path = join(dir, entry)
      let content = ''
      try {
        content = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      const head = content.slice(0, 2000)
      const kwLine = /keywords:\s*(.+)/i.exec(head)?.[1] ?? ''
      const nameTokens = taskKeywords(entry.replace(/\.md$/, '').replace(/-/g, ' '))
      const skillTokens = new Set([
        ...nameTokens,
        ...kwLine.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean),
      ])
      let score = 0
      for (const kw of keywords) if (skillTokens.has(kw)) score += 1
      if (score >= 2) {
        const title = /^#\s*(.+)$/m.exec(head)?.[1]?.trim() || entry
        const worked = /## What worked\n([\s\S]*?)(?:\n## |$)/.exec(content)?.[1]
        matches.push({
          file: entry,
          title,
          score,
          snippet: (worked || head).trim().slice(0, 400),
        })
      }
    }
    matches.sort((a, b) => b.score - a.score)
    return matches.slice(0, max)
  } catch {
    return []
  }
}
