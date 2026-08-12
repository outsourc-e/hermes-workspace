/**
 * Structured agent handoffs.
 *
 * Builds a machine-readable handoff payload from a worker checkpoint and writes
 * it to the shared swarm handoff directory. The payload is richer than the raw
 * checkpoint text: it includes a git diff of changed files and recent terminal
 * output so the next agent can start warm instead of cold.
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { SWARM_MEMORY_HANDOFFS } from './swarm-environment'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

export type SwarmHandoff = {
  workerId: string
  missionId: string | null
  assignmentId: string | null
  generatedAt: string
  state: string
  result: string
  blocker: string
  nextAction: string
  filesChanged: Array<string>
  commandsRun: Array<string>
  gitDiff: string
  recentTerminalOutput: string
  sourceCheckpoint: ParsedSwarmCheckpoint
}

const HANDOFF_DIR = join(SWARM_MEMORY_HANDOFFS, 'handoffs', 'swarm')
const MAX_GIT_DIFF_CHARS = 20_000
const MAX_TERMINAL_CHARS = 10_000
const TMUX_CAPTURE_LINES = 50

function ensureHandoffDir(): void {
  mkdirSync(HANDOFF_DIR, { recursive: true })
}

function handoffJsonPath(workerId: string): string {
  return join(HANDOFF_DIR, `${workerId}-latest.json`)
}

function handoffMarkdownPath(workerId: string): string {
  return join(HANDOFF_DIR, `${workerId}-latest.md`)
}

/**
 * Extract absolute file paths from the free-text FILES_CHANGED checkpoint field.
 * Handles markdown bullet lines with backticks and trailing descriptions.
 */
function extractFilePaths(filesChangedText: string): Array<string> {
  const paths: Array<string> = []
  for (const line of filesChangedText.split('\n')) {
    // Match paths inside backticks, or any absolute path-like string.
    const matches = line.match(/`(\/[^`]+)`|(\/[^\s`,]+)/g)
    if (!matches) continue
    for (const match of matches) {
      const cleaned = match.replace(/^`|`$/g, '').trim()
      if (cleaned.startsWith('/') && !cleaned.includes('`')) {
        paths.push(cleaned)
      }
    }
  }
  return [...new Set(paths)]
}

function findGitRepoRoot(filePath: string): string | null {
  let dir = resolve(dirname(filePath))
  while (dir !== '/') {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

async function runGitDiff(filePaths: Array<string>): Promise<string> {
  if (filePaths.length === 0) return ''

  // Group files by git repo root so we can run one diff per repo.
  const byRepo = new Map<string, Array<string>>()
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue
    const repoRoot = findGitRepoRoot(filePath)
    if (!repoRoot) continue
    const relative = filePath.slice(repoRoot.length + 1)
    const list = byRepo.get(repoRoot) ?? []
    list.push(relative)
    byRepo.set(repoRoot, list)
  }

  const parts: Array<string> = []
  for (const [repoRoot, relatives] of byRepo) {
    try {
      const diff = await new Promise<string>((fulfill, reject) => {
        execFile(
          'git',
          ['-C', repoRoot, 'diff', 'HEAD', '--', ...relatives],
          { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 10_000 },
          (error, stdout) => {
            if (error) {
              // git diff returns non-zero when there is no diff in some setups;
              // trust stdout if present.
              if (stdout) return fulfill(stdout)
              return reject(error)
            }
            fulfill(stdout)
          },
        )
      })
      if (diff.trim()) {
        parts.push(`# repo: ${repoRoot}\n${diff}`)
      }
    } catch {
      /* ignore git errors */
    }
  }

  const combined = parts.join('\n\n---\n\n')
  if (combined.length > MAX_GIT_DIFF_CHARS) {
    return combined.slice(0, MAX_GIT_DIFF_CHARS) + '\n\n... (truncated)'
  }
  return combined
}

async function captureTerminalOutput(workerId: string): Promise<string> {
  const sessionName = `swarm-${workerId}`
  try {
    const output = await new Promise<string>((fulfill, reject) => {
      execFile(
        'tmux',
        ['capture-pane', '-t', sessionName, '-p', '-S', `-${TMUX_CAPTURE_LINES}`],
        { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 10_000 },
        (error, stdout) => {
          if (error) return reject(error)
          fulfill(stdout)
        },
      )
    })
    const trimmed = output.trim()
    if (trimmed.length > MAX_TERMINAL_CHARS) {
      return trimmed.slice(-MAX_TERMINAL_CHARS) + '\n\n... (truncated)'
    }
    return trimmed
  } catch {
    return ''
  }
}

function splitCommands(commandsText: string): Array<string> {
  return commandsText
    .split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^`|`$/g, '').trim())
    .filter(Boolean)
}

function sanitize(text: string | null | undefined): string {
  return (text ?? '').trim()
}

/**
 * Build a structured handoff from a worker checkpoint.
 */
export async function buildHandoff(
  workerId: string,
  checkpoint: ParsedSwarmCheckpoint,
  runtime: Record<string, unknown> = {},
): Promise<SwarmHandoff> {
  const filePaths = extractFilePaths(checkpoint.filesChanged ?? '')
  const [gitDiff, recentTerminalOutput] = await Promise.all([
    runGitDiff(filePaths),
    captureTerminalOutput(workerId),
  ])

  return {
    workerId,
    missionId: typeof runtime.currentMissionId === 'string' ? runtime.currentMissionId : null,
    assignmentId: typeof runtime.currentAssignmentId === 'string' ? runtime.currentAssignmentId : null,
    generatedAt: new Date().toISOString(),
    state: checkpoint.stateLabel,
    result: sanitize(checkpoint.result),
    blocker: sanitize(checkpoint.blocker),
    nextAction: sanitize(checkpoint.nextAction),
    filesChanged: filePaths,
    commandsRun: splitCommands(checkpoint.commandsRun ?? ''),
    gitDiff,
    recentTerminalOutput,
    sourceCheckpoint: checkpoint,
  }
}

function handoffToMarkdown(handoff: SwarmHandoff): string {
  const lines = [
    `# Handoff — ${handoff.workerId}`,
    '',
    `Generated: ${handoff.generatedAt}`,
    `Mission: ${handoff.missionId ?? 'unknown'}`,
    `Assignment: ${handoff.assignmentId ?? 'unknown'}`,
    `State: ${handoff.state}`,
    '',
    '## Result',
    handoff.result || '_no result_',
    '',
    '## Files changed',
    handoff.filesChanged.length ? handoff.filesChanged.map((p) => `- \`${p}\``).join('\n') : '- none',
    '',
    '## Commands run',
    handoff.commandsRun.length ? handoff.commandsRun.map((c) => `- \`${c}\``).join('\n') : '- none',
    '',
    '## Git diff',
    handoff.gitDiff ? ['```diff', handoff.gitDiff, '```'].join('\n') : '- no git diff available',
    '',
    '## Recent terminal output',
    handoff.recentTerminalOutput ? ['```', handoff.recentTerminalOutput, '```'].join('\n') : '- no terminal output captured',
    '',
    '## Blockers',
    handoff.blocker || 'none',
    '',
    '## Next action',
    handoff.nextAction || 'Awaiting next mission.',
    '',
  ]
  return lines.join('\n')
}

/**
 * Persist a handoff to the shared swarm handoff directory.
 */
export async function writeHandoff(handoff: SwarmHandoff): Promise<{ jsonPath: string; markdownPath: string }> {
  ensureHandoffDir()
  const jsonPath = handoffJsonPath(handoff.workerId)
  const markdownPath = handoffMarkdownPath(handoff.workerId)

  const fs = await import('node:fs/promises')
  await Promise.all([
    fs.writeFile(jsonPath, JSON.stringify(handoff, null, 2) + '\n', 'utf8'),
    fs.writeFile(markdownPath, handoffToMarkdown(handoff), 'utf8'),
  ])

  console.log(`[handoff] wrote ${jsonPath} and ${markdownPath}`)
  return { jsonPath, markdownPath }
}

/**
 * Read a previously written handoff.
 */
export function readHandoff(workerId: string): SwarmHandoff | null {
  const path = handoffJsonPath(workerId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SwarmHandoff
  } catch {
    return null
  }
}

/**
 * Return the absolute path to a worker's latest handoff JSON file.
 */
export function handoffPath(workerId: string): string {
  return handoffJsonPath(workerId)
}

export function handoffDirectory(): string {
  return HANDOFF_DIR
}
