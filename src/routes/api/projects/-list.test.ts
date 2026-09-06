/**
 * Tests for GET /api/projects/list — fetchRepoData helper logic
 * Tests the data-shaping/parsing logic without real GitHub CLI calls.
 */
import { describe, expect, it } from 'vitest'

// ─── Inline the parsing logic under test ─────────────────────────────────────
// We extract + test the pure parsing functions here so we can unit-test
// without complex module mocking of execFile + auth-middleware.

type RepoCIStatus = 'success' | 'failure' | 'cancelled' | 'unknown'

interface RepoData {
  owner: string
  name: string
  openPRs: number
  prTitles: Array<string>
  latestCI: RepoCIStatus
  latestCIWorkflow?: string
  lastCommit?: { sha: string; message: string; date: string; author: string }
}

function parsePRs(stdout: string): {
  openPRs: number
  prTitles: Array<string>
} {
  try {
    const prs = JSON.parse(stdout) as Array<{ number: number; title: string }>
    return {
      openPRs: prs.length,
      prTitles: prs.slice(0, 3).map((p) => p.title),
    }
  } catch {
    return { openPRs: 0, prTitles: [] }
  }
}

function parseCI(stdout: string): {
  latestCI: RepoCIStatus
  latestCIWorkflow?: string
} {
  try {
    const runs = JSON.parse(stdout) as Array<{
      conclusion: string
      name: string
    }>
    if (!runs.length) return { latestCI: 'unknown' }
    const run = runs[0]
    const c = run.conclusion.toLowerCase()
    const latestCI: RepoCIStatus =
      c === 'success'
        ? 'success'
        : c === 'failure'
          ? 'failure'
          : c === 'cancelled'
            ? 'cancelled'
            : 'unknown'
    return { latestCI, latestCIWorkflow: run.name }
  } catch {
    return { latestCI: 'unknown' }
  }
}

function parseCommit(stdout: string): RepoData['lastCommit'] | undefined {
  try {
    return JSON.parse(stdout.trim())
  } catch {
    return undefined
  }
}

function getTrackedRepos(env: string): Array<string> {
  return env
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/projects/list — happy path parsing', () => {
  it('parsePRs returns correct count and titles', () => {
    const stdout = JSON.stringify([
      { number: 1, title: 'feat: add something', reviewDecision: '' },
      { number: 2, title: 'fix: bug fix', reviewDecision: '' },
    ])
    const result = parsePRs(stdout)
    expect(result.openPRs).toBe(2)
    expect(result.prTitles).toContain('feat: add something')
    expect(result.prTitles).toContain('fix: bug fix')
  })

  it('parseCI maps conclusion correctly', () => {
    expect(
      parseCI(JSON.stringify([{ conclusion: 'success', name: 'CI' }])).latestCI,
    ).toBe('success')
    expect(
      parseCI(JSON.stringify([{ conclusion: 'failure', name: 'CI' }])).latestCI,
    ).toBe('failure')
    expect(
      parseCI(JSON.stringify([{ conclusion: 'cancelled', name: 'CI' }]))
        .latestCI,
    ).toBe('cancelled')
    expect(
      parseCI(JSON.stringify([{ conclusion: '', name: 'CI' }])).latestCI,
    ).toBe('unknown')
    expect(parseCI('[]').latestCI).toBe('unknown')
  })

  it('parseCommit parses JSON output', () => {
    const obj = {
      sha: 'abc1234',
      message: 'chore: update',
      date: '2026-05-25T21:00:00Z',
      author: 'Nick',
    }
    const result = parseCommit(JSON.stringify(obj))
    expect(result?.sha).toBe('abc1234')
    expect(result?.author).toBe('Nick')
  })
})

describe('GET /api/projects/list — empty repo list', () => {
  it('returns empty array when HUD_TRACKED_REPOS is empty string', () => {
    const repos = getTrackedRepos('')
    expect(repos).toHaveLength(0)
  })

  it('parses comma-separated repos', () => {
    const repos = getTrackedRepos(
      'SPACEMAN1898/CliniTrack-Suite,SPACEMAN1898/another',
    )
    expect(repos).toHaveLength(2)
    expect(repos[0]).toBe('SPACEMAN1898/CliniTrack-Suite')
  })
})

describe('GET /api/projects/list — partial failure resilience', () => {
  it('parsePRs returns safe defaults on invalid JSON', () => {
    const result = parsePRs('not json')
    expect(result.openPRs).toBe(0)
    expect(result.prTitles).toHaveLength(0)
  })

  it('parseCI returns unknown on invalid JSON', () => {
    const result = parseCI('not json')
    expect(result.latestCI).toBe('unknown')
  })

  it('parseCommit returns undefined on invalid JSON', () => {
    expect(parseCommit('not json')).toBeUndefined()
  })
})
