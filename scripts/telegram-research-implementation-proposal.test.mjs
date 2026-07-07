import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runResearchImplementationProposal } from './telegram-research-implementation-proposal.mjs'

const APPROVAL_ID = 'tg4_d3fd7da71ae557f3'

async function exists(pathname) {
  try {
    await stat(pathname)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const resultRow = (overrides = {}) => ({
  approval_id: APPROVAL_ID,
  status: 'completed',
  executed_at: '2026-07-05T07:58:50.925Z',
  action: 'learn_from',
  selected_repo: 'CoWork-OS/CoWork-OS',
  report_path: '',
  report_hash: 'abc',
  github_read_only_calls: true,
  github_writes: false,
  clone: false,
  fork: false,
  dependency_install: false,
  code_execution: false,
  durable_mutation: false,
  audit_append: false,
  obsidian_kanban_writes: false,
  sanitized: true,
  repo: {
    full_name: 'CoWork-OS/CoWork-OS',
    html_url: 'https://github.com/CoWork-OS/CoWork-OS',
    license: 'MIT',
    languages: ['TypeScript', 'CSS', 'JavaScript'],
    manifests: [
      { name: 'package.json', size: 123 },
      { name: 'Dockerfile', size: 45 },
    ],
    setup_complexity_estimate: 'medium',
  },
  ...overrides,
})

const researchMarkdown = `# Approved GitHub discovery research: CoWork-OS/CoWork-OS

Approval ID: ${APPROVAL_ID}
Action: learn_from
Read-only: true

## Repo
- Name: CoWork-OS/CoWork-OS
- License: MIT

## Useful architecture/features
- Language mix suggests implementation split: TypeScript, CSS, JavaScript.
- Has Node/package manifest; inspect scripts/dependency shape later before any adoption.
- Container/deployment files may provide useful setup/deployment patterns.

## Risks/concerns
- Setup likely depends on external credentials or environment variables; token=SHOULD_NOT_SURVIVE chat_id=123456789

## Recommended next step for Hermes
Create a narrow follow-up design note extracting only the useful workflow/UI/architecture patterns from this repo. Keep implementation local and do not import code until a separate license/code review package is approved.
`

async function fixture({
  existingProposal = false,
  missingResearch = false,
  unsafeResult = {},
  markdown = researchMarkdown,
} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-impl-proposal-'))
  const resultsPath = path.join(dir, 'telegram-execution-results.jsonl')
  const proposalsPath = path.join(
    dir,
    'telegram-implementation-proposals.jsonl',
  )
  const proposalReportDir = path.join(dir, 'proposals')
  const researchReportPath = path.join(dir, 'research.md')
  await writeFile(
    resultsPath,
    `${JSON.stringify(resultRow({ report_path: researchReportPath, ...unsafeResult }))}\n`,
    'utf8',
  )
  if (!missingResearch) await writeFile(researchReportPath, markdown, 'utf8')
  if (existingProposal)
    await writeFile(
      proposalsPath,
      `${JSON.stringify({ parent_approval_id: APPROVAL_ID, proposal_id: 'existing' })}\n`,
      'utf8',
    )
  return {
    dir,
    resultsPath,
    proposalsPath,
    proposalReportDir,
    researchReportPath,
  }
}

async function readRows(pathname) {
  return (await readFile(pathname, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

describe('telegram research implementation proposal', () => {
  it('creates a proposal from research in dry-run without writes', async () => {
    const f = await fixture()
    const result = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
      dryRun: true,
    })
    expect(result.ok).toBe(true)
    expect(result.proposal.recommended_build_type).toBe('adapt_pattern')
    expect(result.proposal.approval_command).toBe(
      `/approve ${result.proposal_id}`,
    )
    expect(result.proposal.reject_command).toBe(`/reject ${result.proposal_id}`)
    expect(result.githubCalls).toBe(false)
    expect(result.githubWrites).toBe(false)
    expect(result.executor).toBe(false)
    expect(result.proposalWritten).toBe(false)
    expect(result.reportWritten).toBe(false)
    expect(await exists(f.proposalsPath)).toBe(false)
    expect(await exists(f.proposalReportDir)).toBe(false)
  })

  it('write mode writes exactly one proposal row and one proposal report', async () => {
    const f = await fixture()
    const result = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
      now: new Date('2026-07-05T11:00:00Z'),
    })
    expect(result.ok).toBe(true)
    expect(result.proposalWritten).toBe(true)
    expect(result.reportWritten).toBe(true)
    const rows = await readRows(f.proposalsPath)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      parent_approval_id: APPROVAL_ID,
      source_repo: 'CoWork-OS/CoWork-OS',
      recommended_build_type: 'adapt_pattern',
    })
    expect(rows[0].githubWrites).toBe(false)
    const report = await readFile(result.proposal_report_path, 'utf8')
    expect(report).toContain(result.proposal_id)
    expect(report).toContain('/approve')
    expect(report).not.toContain('SHOULD_NOT_SURVIVE')
    expect(report).not.toContain('123456789')
  })

  it('duplicate proposal blocks unless forced', async () => {
    const f = await fixture({ existingProposal: true })
    const blocked = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toBe('PROPOSAL_EXISTS_DUPLICATE_BLOCKED')
    const forced = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
      force: true,
    })
    expect(forced.ok).toBe(true)
    expect(await readRows(f.proposalsPath)).toHaveLength(2)
  })

  it('missing research blocks', async () => {
    const f = await fixture({ missingResearch: true })
    const result = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('RESEARCH_REPORT_MISSING')
    expect(await exists(f.proposalsPath)).toBe(false)
  })

  it('unsafe execution result blocks before proposal writes', async () => {
    const f = await fixture({ unsafeResult: { code_execution: true } })
    const result = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('UNSAFE_EXECUTION_RESULT_FLAGS')
    expect(await exists(f.proposalsPath)).toBe(false)
  })

  it('unsafe proposal scope blocks before writes', async () => {
    const unsafeMarkdown = researchMarkdown.replace(
      'Create a narrow follow-up design note extracting only the useful workflow/UI/architecture patterns from this repo. Keep implementation local and do not import code until a separate license/code review package is approved.',
      'Clone the repository, install dependencies, execute it locally, and open a PR.',
    )
    const f = await fixture({ markdown: unsafeMarkdown })
    const result = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('UNSAFE_PROPOSAL_SCOPE')
    expect(await exists(f.proposalsPath)).toBe(false)
  })

  it('token chat and secrets are redacted', async () => {
    const f = await fixture()
    const result = await runResearchImplementationProposal({
      approvalId: APPROVAL_ID,
      resultsPath: f.resultsPath,
      proposalsPath: f.proposalsPath,
      proposalReportDir: f.proposalReportDir,
    })
    const raw =
      JSON.stringify(result) +
      (await readFile(result.proposal_report_path, 'utf8')) +
      (await readFile(f.proposalsPath, 'utf8'))
    expect(raw).not.toContain('SHOULD_NOT_SURVIVE')
    expect(raw).not.toContain('123456789')
    expect(raw).not.toMatch(/gh[pousr]_/)
    expect(raw).not.toMatch(/github_pat_/)
    expect(raw).not.toMatch(/bot\d+:/)
  })
})
