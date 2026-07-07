import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runApprovedImplementationBuildPlan } from './telegram-approved-implementation-build-plan.mjs'

const PROPOSAL_ID = 'impl_tg4_d3fd7da71ae557f3_8f61483465'
const PARENT_APPROVAL_ID = 'tg4_d3fd7da71ae557f3'

async function exists(pathname) {
  try {
    await stat(pathname)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const proposalRow = (overrides = {}) => ({
  proposal_id: PROPOSAL_ID,
  parent_approval_id: PARENT_APPROVAL_ID,
  idea_title: 'Adapt CoWork-OS workflow/product patterns into a local Hermes implementation design',
  source_repo: 'CoWork-OS/CoWork-OS',
  recommended_build_type: 'adapt_pattern',
  proposed_scope: 'Draft a local Hermes/LifeOS design note and thin prototype plan that adapts CoWork-OS product/workflow patterns without importing code.',
  files_or_modules_expected_to_touch: ['docs or reports/proposals design note only at approval stage', 'exact files TBD after approval'],
  risks: ['token=SHOULD_NOT_SURVIVE chat_id=123456789'],
  sanitized: true,
  ...overrides,
})

const decisionRow = (approvalId, overrides = {}) => ({
  approval_id: approvalId,
  decision: 'approved',
  status: 'approved',
  selected_repo: 'CoWork-OS/CoWork-OS',
  sanitized: true,
  ...overrides,
})

async function fixture({ proposal, decisions, existingPlan } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-build-plan-'))
  const targetWorkspace = path.join(dir, 'workspace')
  await writeFile(path.join(dir, 'workspace-marker'), 'ok', 'utf8')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(targetWorkspace))
  const proposalsPath = path.join(dir, 'telegram-implementation-proposals.jsonl')
  const decisionsPath = path.join(dir, 'telegram-approval-decisions.jsonl')
  const buildPlansPath = path.join(dir, 'telegram-build-plans.jsonl')
  const reportDir = path.join(dir, 'build-plans')
  if (proposal !== null) {
    await writeFile(proposalsPath, `${JSON.stringify(proposal || proposalRow())}\n`, 'utf8')
  }
  await writeFile(
    decisionsPath,
    `${(decisions || [decisionRow(PARENT_APPROVAL_ID), decisionRow(PROPOSAL_ID)]).map((row) => JSON.stringify(row)).join('\n')}\n`,
    'utf8',
  )
  if (existingPlan) {
    await writeFile(
      buildPlansPath,
      `${JSON.stringify({ proposal_id: PROPOSAL_ID, build_plan_id: 'existing' })}\n`,
      'utf8',
    )
  }
  return { dir, targetWorkspace, proposalsPath, decisionsPath, buildPlansPath, reportDir }
}

async function readRows(pathname) {
  return (await readFile(pathname, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

describe('telegram approved implementation build plan', () => {
  it('approved proposal creates a build plan in dry-run without writes', async () => {
    const f = await fixture()
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      targetWorkspace: f.targetWorkspace,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
      dryRun: true,
      now: new Date('2026-07-05T12:00:00Z'),
    })
    expect(result.ok).toBe(true)
    expect(result.build_plan.proposal_id).toBe(PROPOSAL_ID)
    expect(result.build_plan.parent_approval_id).toBe(PARENT_APPROVAL_ID)
    expect(result.build_plan.requires_final_code_edit_approval).toBe(true)
    expect(result.build_plan.approval_command).toBe(`/approve ${result.build_plan_id}`)
    expect(result.build_plan.reject_command).toBe(`/reject ${result.build_plan_id}`)
    expect(result.githubWrites).toBe(false)
    expect(result.auditAppend).toBe(false)
    expect(result.durableMutation).toBe(false)
    expect(result.buildPlanWritten).toBe(false)
    expect(result.reportWritten).toBe(false)
    expect(await exists(f.buildPlansPath)).toBe(false)
    expect(await exists(f.reportDir)).toBe(false)
  })

  it('unapproved proposal blocks', async () => {
    const f = await fixture({ decisions: [decisionRow(PARENT_APPROVAL_ID)] })
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      targetWorkspace: f.targetWorkspace,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('PROPOSAL_NOT_APPROVED')
  })

  it('missing proposal blocks', async () => {
    const f = await fixture({ proposal: null })
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      targetWorkspace: f.targetWorkspace,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('PROPOSAL_NOT_FOUND')
  })

  it('duplicate plan blocks', async () => {
    const f = await fixture({ existingPlan: true })
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      targetWorkspace: f.targetWorkspace,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('BUILD_PLAN_EXISTS_DUPLICATE_BLOCKED')
  })

  it('unknown target workspace blocks with required field and likely candidates', async () => {
    const f = await fixture()
    const previousWorkspaceParent = process.env.HERMES_WORKSPACE_PARENT
    process.env.HERMES_WORKSPACE_PARENT = f.dir
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
      dryRun: true,
    })
    if (previousWorkspaceParent === undefined) delete process.env.HERMES_WORKSPACE_PARENT
    else process.env.HERMES_WORKSPACE_PARENT = previousWorkspaceParent
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('BLOCKED_TARGET_WORKSPACE_REQUIRED')
    expect(result.required_field).toBe('--target-workspace <absolute repo/workspace path>')
    expect(result.likely_candidates).toContain(f.targetWorkspace)
    expect(await exists(f.buildPlansPath)).toBe(false)
  })

  it('write mode writes exactly one plan row and report', async () => {
    const f = await fixture()
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      targetWorkspace: f.targetWorkspace,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
    })
    expect(result.ok).toBe(true)
    expect(result.buildPlanWritten).toBe(true)
    expect(result.reportWritten).toBe(true)
    const rows = await readRows(f.buildPlansPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].proposal_id).toBe(PROPOSAL_ID)
    const report = await readFile(result.build_plan_report_path, 'utf8')
    expect(report).toContain(result.build_plan_id)
    expect(report).toContain('/approve')
    expect(report).not.toContain('SHOULD_NOT_SURVIVE')
    expect(report).not.toContain('123456789')
  })

  it('unsafe file scope blocks', async () => {
    const f = await fixture({
      proposal: proposalRow({ files_or_modules_expected_to_touch: ['.env', 'src/secrets.ts'] }),
    })
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      targetWorkspace: f.targetWorkspace,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('UNSAFE_FILE_SCOPE_BLOCKED')
    expect(await exists(f.buildPlansPath)).toBe(false)
  })

  it('secrets are redacted from JSON and markdown outputs', async () => {
    const f = await fixture({ proposal: proposalRow({ source_repo: 'token=SHOULD_NOT_SURVIVE chat_id=123456789' }) })
    const result = await runApprovedImplementationBuildPlan({
      proposalId: PROPOSAL_ID,
      targetWorkspace: f.targetWorkspace,
      proposalsPath: f.proposalsPath,
      approvalDecisionsPath: f.decisionsPath,
      buildPlansPath: f.buildPlansPath,
      buildPlanReportDir: f.reportDir,
    })
    expect(result.ok).toBe(true)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('SHOULD_NOT_SURVIVE')
    expect(serialized).not.toContain('123456789')
    const report = await readFile(result.build_plan_report_path, 'utf8')
    expect(report).not.toContain('SHOULD_NOT_SURVIVE')
    expect(report).not.toContain('123456789')
  })
})
