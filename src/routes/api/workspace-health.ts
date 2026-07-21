import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  evaluateWorkspaceQualityArtifact,
  isWorkspaceQualityArtifact,
} from '../../server/workspace-quality-health'
import { isAuthenticated } from '../../server/auth-middleware'
import type {
  EvaluatedQualityCheck,
  WorkspaceHealthState,
  WorkspaceQualityArtifact,
} from '../../server/workspace-quality-health'

export type WorkspaceHealthCheck = EvaluatedQualityCheck & {
  source: 'git' | 'quality-run'
}

type ExecResult = {
  ok: boolean
  output: string
}

const noStoreHeaders = { 'cache-control': 'no-store' }
const defaultArtifactPath = join(
  homedir(),
  '.hermes',
  'workspace-health',
  'hermes-workspace',
  'latest.json',
)

function safeGit(args: Array<string>): ExecResult {
  try {
    return {
      ok: true,
      output: execFileSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5_000,
      }),
    }
  } catch (error) {
    return {
      ok: false,
      output: error instanceof Error ? error.message : String(error),
    }
  }
}

function countNullSeparated(value: string): number {
  return value ? value.split('\0').filter(Boolean).length : 0
}

function currentRepoState() {
  const status = safeGit([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ])
  const branchStatus = safeGit([
    'status',
    '--short',
    '--branch',
    '--untracked-files=no',
  ])
  const head = safeGit(['rev-parse', 'HEAD'])
  const dirtyPaths = safeGit([
    'ls-files',
    '-m',
    '-o',
    '--exclude-standard',
    '-z',
  ])
  const untrackedPaths = safeGit([
    'ls-files',
    '-o',
    '--exclude-standard',
    '-z',
  ])
  const statusLines = status.output.split('\n').filter(Boolean)
  const branchLine = branchStatus.output.split('\n').find(Boolean) ?? '## unknown'
  const behind = Number(branchLine.match(/behind (\d+)/)?.[1] ?? 0)
  const ahead = Number(branchLine.match(/ahead (\d+)/)?.[1] ?? 0)
  const deleted = statusLines.filter((line) => line.slice(0, 2).includes('D')).length
  const dirtyCount = dirtyPaths.ok
    ? countNullSeparated(dirtyPaths.output)
    : statusLines.length
  const untrackedCount = untrackedPaths.ok
    ? countNullSeparated(untrackedPaths.output)
    : statusLines.filter((line) => line.startsWith('??')).length
  const fingerprint = createHash('sha256').update(status.output).digest('hex')

  return {
    ok: status.ok && branchStatus.ok && head.ok,
    branch: branchLine.replace(/^##\s*/, ''),
    head: head.output.trim(),
    ahead,
    behind,
    deleted,
    dirtyCount,
    untrackedCount,
    statusFingerprint: fingerprint,
    error: status.ok ? null : status.output,
  }
}

function gitHealthCheck(repo: ReturnType<typeof currentRepoState>): WorkspaceHealthCheck {
  if (!repo.ok) {
    return {
      id: 'git',
      label: 'Git hygiene',
      state: 'unknown',
      source: 'git',
      detail: `Git readback failed: ${repo.error ?? 'unknown error'}`,
      command: 'git status --porcelain=v1 --untracked-files=all',
      exitCode: null,
      durationMs: 0,
      artifactPath: '',
    }
  }

  const parts = [
    `${repo.dirtyCount} local file changes`,
    `${repo.untrackedCount} untracked files`,
    `${repo.deleted} deleted files`,
  ]
  if (repo.behind) parts.push(`behind ${repo.behind}`)
  if (repo.ahead) parts.push(`ahead ${repo.ahead}`)

  return {
    id: 'git',
    label: 'Git hygiene',
    state:
      repo.dirtyCount === 0 && repo.behind === 0 && repo.deleted === 0
        ? 'pass'
        : 'warn',
    source: 'git',
    detail: `${repo.branch} · ${parts.join(' · ')}. No automatic delete, merge, or reset is performed.`,
    command: 'git status --porcelain=v1 --untracked-files=all',
    exitCode: 0,
    durationMs: 0,
    artifactPath: '',
  }
}

function qualityArtifactPath(): string {
  return process.env.WORKSPACE_QUALITY_ARTIFACT
    ? resolve(process.env.WORKSPACE_QUALITY_ARTIFACT)
    : defaultArtifactPath
}

function readQualityArtifact(path: string): WorkspaceQualityArtifact | null {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return isWorkspaceQualityArtifact(parsed) ? parsed : null
  } catch {
    return null
  }
}

function maxArtifactAgeMs(): number {
  const configured = Number(process.env.WORKSPACE_QUALITY_MAX_AGE_MS)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 24 * 60 * 60 * 1000
}

function healthCounts(checks: Array<WorkspaceHealthCheck>) {
  return checks.reduce<Record<WorkspaceHealthState, number>>(
    (counts, check) => {
      counts[check.state] += 1
      return counts
    },
    { pass: 0, warn: 0, fail: 0, blocked: 0, unknown: 0 },
  )
}

export const Route = createFileRoute('/api/workspace-health')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json(
            { ok: false, error: 'Unauthorized' },
            { status: 401, headers: noStoreHeaders },
          )
        }

        const observedAt = Date.now()
        const repo = currentRepoState()
        const artifactPath = qualityArtifactPath()
        const quality = evaluateWorkspaceQualityArtifact(
          readQualityArtifact(artifactPath),
          repo.statusFingerprint,
          observedAt,
          maxArtifactAgeMs(),
        )
        const checks: Array<WorkspaceHealthCheck> = [
          gitHealthCheck(repo),
          ...quality.checks.map((check) => ({
            ...check,
            source: 'quality-run' as const,
          })),
        ]
        const counts = healthCounts(checks)
        const overall: WorkspaceHealthState =
          counts.fail > 0
            ? 'fail'
            : counts.warn > 0 ||
                counts.blocked > 0 ||
                counts.unknown > 0
              ? 'warn'
              : 'pass'

        return json(
          {
            ok: true,
            observedAt,
            overall,
            counts,
            checks,
            repo: {
              branch: repo.branch,
              head: repo.head,
              dirtyCount: repo.dirtyCount,
              untrackedCount: repo.untrackedCount,
              statusFingerprint: repo.statusFingerprint,
            },
            quality: {
              ...quality,
              artifactPath,
            },
            latestGateDir: quality.runDir,
          },
          { headers: noStoreHeaders },
        )
      },
    },
  },
})
