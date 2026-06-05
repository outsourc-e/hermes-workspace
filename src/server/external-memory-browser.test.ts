import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let tempRoot = ''

function makeProviderConfig() {
  fs.writeFileSync(
    path.join(tempRoot, 'external_memory_providers.json'),
    JSON.stringify({
      providers: [
        {
          id: 'custom_provider',
          label: 'Custom Provider',
          db_path: 'custom_provider/knowledge.sqlite',
          config_path: 'custom_provider.json',
        },
      ],
    }),
  )
  fs.mkdirSync(path.join(tempRoot, 'custom_provider'), { recursive: true })
  fs.writeFileSync(
    path.join(tempRoot, 'custom_provider.json'),
    JSON.stringify({ vector_collection: 'external_memory_collection' }),
  )
}

function seedCandidateDb() {
  const dbPath = path.join(tempRoot, 'custom_provider/knowledge.sqlite')
  execFileSync('python3', [
    '-c',
    `import sqlite3, sys, json
con = sqlite3.connect(sys.argv[1])
con.execute('create table candidates(id text primary key, text text not null, source text not null default "agent", metadata_json text not null default "{}", state text not null default "candidate", content_sha256 text not null, created_at real not null, updated_at real not null)')
con.execute('insert into candidates values(?,?,?,?,?,?,?,?)', ('mem-1', 'External providers should expose reviewable memory', 'agent', json.dumps({'domain':'ops'}), 'candidate', 'abc', 1000.0, 1001.0))
con.execute('insert into candidates values(?,?,?,?,?,?,?,?)', ('mem-2', 'Approved strategic note', 'manual', '{}', 'approved', 'def', 900.0, 950.0))
con.execute('insert into candidates values(?,?,?,?,?,?,?,?)', ('mem-3', 'Rejected transient note', 'manual', '{}', 'rejected', 'ghi', 800.0, 850.0))
con.commit()
con.close()
`,
    dbPath,
  ])
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-external-memory-'))
  process.env.HERMES_HOME = tempRoot
})

afterEach(() => {
  delete process.env.HERMES_HOME
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('external-memory-browser', () => {
  it('discovers registered external memory providers from HERMES_HOME', async () => {
    makeProviderConfig()
    const mod = await import('./external-memory-browser')

    const result = mod.listExternalMemoryProviders()

    expect(result.active).toBe('custom_provider')
    expect(result.providers).toEqual([
      expect.objectContaining({
        id: 'custom_provider',
        label: 'Custom Provider',
        kind: 'custom',
        available: true,
      }),
    ])
  })

  it('lists provider candidates from the review queue sqlite database', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = mod.listExternalMemoryCandidates({
      provider: 'custom_provider',
      state: 'candidate',
    })

    expect(result).toMatchObject({
      ok: true,
      provider: 'custom_provider',
      state: 'candidate',
      count: 1,
      total: 1,
    })
    expect(result.candidates[0]).toMatchObject({
      id: 'mem-1',
      text: 'External providers should expose reviewable memory',
      source: 'agent',
      state: 'candidate',
      metadata: { domain: 'ops' },
    })
  })

  it('returns per-state totals with candidate lists for filter badges', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = mod.listExternalMemoryCandidates({
      provider: 'custom_provider',
      state: 'all',
    })

    expect(result.counts).toEqual({
      candidate: 1,
      approved: 1,
      rejected: 1,
      all: 3,
    })
  })

  it('searches candidate text and metadata for a registered provider', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = mod.searchExternalMemoryCandidates({
      provider: 'custom_provider',
      query: 'strategic',
    })

    expect(result.count).toBe(1)
    expect(result.results[0]).toMatchObject({ id: 'mem-2', state: 'approved' })
  })

  it('edits candidate text and refreshes its content hash', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const result = mod.editExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-1',
      text: 'External providers should expose curated memory.',
    })

    expect(result.candidate).toMatchObject({
      id: 'mem-1',
      text: 'External providers should expose curated memory.',
      state: 'candidate',
    })
    expect(result.candidate.contentSha256).toHaveLength(64)
    expect(result.candidate.contentSha256).not.toBe('abc')
    expect(result.candidate.metadata.edited_at).toEqual(expect.any(Number))
  })

  it('approves, rejects, and deletes candidates from the review queue', async () => {
    makeProviderConfig()
    seedCandidateDb()
    const mod = await import('./external-memory-browser')

    const approved = mod.approveExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-1',
    })
    const rejected = mod.rejectExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-2',
      reason: 'not durable',
    })
    const deleted = mod.deleteExternalMemoryCandidate({
      provider: 'custom_provider',
      id: 'mem-3',
    })

    expect(approved.candidate).toMatchObject({ id: 'mem-1', state: 'approved' })
    expect(approved.candidate.metadata.approved_at).toEqual(expect.any(Number))
    expect(rejected.candidate).toMatchObject({ id: 'mem-2', state: 'rejected' })
    expect(rejected.candidate.metadata.review_reason).toBe('not durable')
    expect(deleted).toEqual({
      ok: true,
      provider: 'custom_provider',
      deleted: 'mem-3',
    })
    expect(
      mod.listExternalMemoryCandidates({
        provider: 'custom_provider',
        state: 'all',
      }).total,
    ).toBe(2)
  })
})
