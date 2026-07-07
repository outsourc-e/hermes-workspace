import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runTelegramCodeEditApprovalPacket } from './telegram-code-edit-approval-packet.mjs'

const BUILD_PLAN_ID = 'build_impl_tg4_d3fd7da71ae557f3_8f61483465_d7420c166e'

async function exists(pathname) {
  try {
    await stat(pathname)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const buildPlanRow = (targetWorkspace, overrides = {}) => ({
  build_plan_id: BUILD_PLAN_ID,
  proposal_id: 'impl_tg4_d3fd7da71ae557f3_8f61483465',
  parent_approval_id: 'tg4_d3fd7da71ae557f3',
  recommended_build_type: 'adapt_pattern',
  target_repo_or_workspace: targetWorkspace,
  expected_files_to_touch: [
    'docs/github-discovery/cowork-os-pattern-adaptation.md',
    'docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
  ],
  forbidden_files_or_paths: [
    '.env',
    '.env.*',
    '.git/**',
    'node_modules/**',
    'package.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'src/**',
    'electron/**',
    'server-entry.js',
    'swarm.yaml',
    '/root/.hermes/audit/**',
    '/root/.hermes/github-connector-durable-store/**',
    '/mnt/lachlan-pc-obsidian/**',
  ],
  implementation_steps: ['Create docs only after final approval.'],
  tests_to_run: [
    'git diff --check -- docs/github-discovery/cowork-os-pattern-adaptation.md docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
    'static scan: no token/chat_id/API key/password strings in the two generated docs',
  ],
  rollback_plan: [
    'Delete docs/github-discovery/cowork-os-pattern-adaptation.md if created by the approved edit package.',
    'Delete docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md if created by the approved edit package.',
  ],
  requires_final_code_edit_approval: true,
  sanitized: true,
  ...overrides,
})

async function fixture({ buildPlan, existingPacket } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-code-edit-approval-'))
  const targetWorkspace = path.join(dir, 'workspace')
  await mkdir(targetWorkspace)
  const buildPlansPath = path.join(dir, 'telegram-build-plans.jsonl')
  const approvalPacketsPath = path.join(dir, 'telegram-code-edit-approval-packets.jsonl')
  const reportDir = path.join(dir, 'code-edit-approval-packets')
  if (buildPlan !== null) {
    await writeFile(
      buildPlansPath,
      `${JSON.stringify(buildPlan || buildPlanRow(targetWorkspace))}\n`,
      'utf8',
    )
  }
  if (existingPacket) {
    await writeFile(
      approvalPacketsPath,
      `${JSON.stringify({ build_plan_id: BUILD_PLAN_ID, code_edit_approval_id: 'existing' })}\n`,
      'utf8',
    )
  }
  return { dir, targetWorkspace, buildPlansPath, approvalPacketsPath, reportDir }
}

async function readRows(pathname) {
  return (await readFile(pathname, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

describe('telegram code edit approval packet', () => {
  it('creates packet from build plan in dry-run without writes', async () => {
    const f = await fixture()
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
      targetWorkspace: f.targetWorkspace,
      dryRun: true,
      now: new Date('2026-07-05T12:00:00Z'),
    })
    expect(result.ok).toBe(true)
    expect(result.approval_packet.build_plan_id).toBe(BUILD_PLAN_ID)
    expect(result.approval_packet.target_workspace).toBe(f.targetWorkspace)
    expect(result.approval_packet.exact_files_allowed_to_edit).toEqual([
      'docs/github-discovery/cowork-os-pattern-adaptation.md',
      'docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
    ])
    expect(result.approval_packet.short_alias).toMatch(/^[a-f0-9]{8}$/)
    expect(result.approval_packet.approval_id).toBe(result.code_edit_approval_id)
    expect(result.approval_packet.approval_command).toBe(
      `/approve ${result.approval_packet.short_alias}`,
    )
    expect(result.approval_packet.reject_command).toBe(
      `/reject ${result.approval_packet.short_alias}`,
    )
    expect(result.commandsRun).toBe(false)
    expect(result.githubWrites).toBe(false)
    expect(result.githubCalls).toBe(false)
    expect(result.auditAppend).toBe(false)
    expect(result.durableMutation).toBe(false)
    expect(result.approvalPacketWritten).toBe(false)
    expect(result.reportWritten).toBe(false)
    expect(await exists(f.approvalPacketsPath)).toBe(false)
    expect(await exists(f.reportDir)).toBe(false)
  })

  it('blocks missing build plan', async () => {
    const f = await fixture({ buildPlan: null })
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('BUILD_PLAN_NOT_FOUND')
    expect(await exists(f.approvalPacketsPath)).toBe(false)
  })

  it('blocks when target workspace is not explicit', async () => {
    const f = await fixture()
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('BLOCKED_TARGET_WORKSPACE_REQUIRED')
    expect(result.required_field).toBe('--target-workspace <absolute repo/workspace path>')
    expect(await exists(f.approvalPacketsPath)).toBe(false)
  })

  it('blocks if target workspace mismatches', async () => {
    const otherWorkspace = path.join(tmpdir(), 'tg-code-edit-other-workspace')
    const f = await fixture({ buildPlan: buildPlanRow(otherWorkspace) })
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
      targetWorkspace: f.targetWorkspace,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('TARGET_WORKSPACE_MISMATCH')
    expect(await exists(f.approvalPacketsPath)).toBe(false)
  })

  it('blocks if exact edit files cannot be determined', async () => {
    const f = await fixture()
    const exactScopeBuildPlan = buildPlanRow(f.targetWorkspace, {
      expected_files_to_touch: ['docs/github-discovery/**'],
    })
    await writeFile(f.buildPlansPath, `${JSON.stringify(exactScopeBuildPlan)}\n`, 'utf8')
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
      targetWorkspace: f.targetWorkspace,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('BLOCKED_EXACT_EDIT_SCOPE_REQUIRED')
    expect(await exists(f.approvalPacketsPath)).toBe(false)
  })

  it('write mode writes one approval packet row and report only', async () => {
    const f = await fixture()
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
      targetWorkspace: f.targetWorkspace,
      now: new Date('2026-07-05T12:00:00Z'),
    })
    expect(result.ok).toBe(true)
    expect(result.approvalPacketWritten).toBe(true)
    expect(result.reportWritten).toBe(true)
    expect(result.commandsRun).toBe(false)
    const rows = await readRows(f.approvalPacketsPath)
    expect(rows).toHaveLength(1)
    expect(rows[0].build_plan_id).toBe(BUILD_PLAN_ID)
    const report = await readFile(result.approval_packet_report_path, 'utf8')
    expect(report).toContain(result.code_edit_approval_id)
    expect(report).toContain('/approve')
  })

  it('duplicate packet blocks', async () => {
    const f = await fixture({ existingPacket: true })
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
      targetWorkspace: f.targetWorkspace,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('CODE_EDIT_APPROVAL_PACKET_DUPLICATE_BLOCKED')
  })

  it('secrets are redacted', async () => {
    const f = await fixture()
    const secretBuildPlan = buildPlanRow(f.targetWorkspace, {
      tests_to_run: ['static scan token=SHOULD_NOT_SURVIVE chat_id=123456789'],
    })
    await writeFile(f.buildPlansPath, `${JSON.stringify(secretBuildPlan)}\n`, 'utf8')
    const result = await runTelegramCodeEditApprovalPacket({
      buildPlanId: BUILD_PLAN_ID,
      buildPlansPath: f.buildPlansPath,
      approvalPacketsPath: f.approvalPacketsPath,
      approvalPacketReportDir: f.reportDir,
      targetWorkspace: f.targetWorkspace,
    })
    expect(result.ok).toBe(true)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('SHOULD_NOT_SURVIVE')
    expect(serialized).not.toContain('123456789')
    const report = await readFile(result.approval_packet_report_path, 'utf8')
    expect(report).not.toContain('SHOULD_NOT_SURVIVE')
    expect(report).not.toContain('123456789')
  })
})
