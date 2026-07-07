import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runTelegramSourceCodeEditLane } from './telegram-source-code-edit-lane.mjs'

const APPROVAL_ID = 'source_edit_tg15_approved'
const ALLOWED = ['src/example.ts']
const TESTS = ['node -e "process.exit(0)"']

async function exists(pathname) {
  try {
    await stat(pathname)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function fixture({ packet = {}, decision = {}, manifest = {}, previousResult = null } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-source-edit-'))
  const workspace = path.join(dir, 'workspace')
  const packetsPath = path.join(dir, 'telegram-code-edit-approval-packets.jsonl')
  const decisionsPath = path.join(dir, 'telegram-approval-decisions.jsonl')
  const resultsPath = path.join(dir, 'telegram-source-code-edit-execution-results.jsonl')
  const notificationsPath = path.join(dir, 'telegram-source-code-edit-completion-notifications.jsonl')
  const manifestPath = path.join(dir, 'edit-manifest.json')
  const basePacket = {
    approval_id: APPROVAL_ID,
    code_edit_approval_id: APPROVAL_ID,
    short_alias: 'tg15',
    target_workspace: workspace,
    implementation_proposal_approved: true,
    build_plan_approved: true,
    exact_source_file_scope_approved: true,
    exact_files_allowed_to_edit: ALLOWED,
    tests_to_run: TESTS,
    ...packet,
  }
  const baseDecision = { approval_id: APPROVAL_ID, decision: 'approved', ...decision }
  const baseManifest = {
    files: [{ path: 'src/example.ts', content: 'export const tg15 = true\n' }],
    test_commands: TESTS,
    ...manifest,
  }
  await writeFile(packetsPath, `${JSON.stringify(basePacket)}\n`, 'utf8')
  await writeFile(decisionsPath, `${JSON.stringify(baseDecision)}\n`, 'utf8')
  await writeFile(manifestPath, JSON.stringify(baseManifest), 'utf8')
  if (previousResult) await writeFile(resultsPath, `${JSON.stringify(previousResult)}\n`, 'utf8')
  return { dir, workspace, packetsPath, decisionsPath, resultsPath, notificationsPath, manifestPath }
}

function runArgs(f, overrides = {}) {
  return {
    approvalId: APPROVAL_ID,
    targetWorkspace: f.workspace,
    allowedFile: ALLOWED,
    approvedTestCommand: TESTS,
    editManifestPath: f.manifestPath,
    approvalPacketsPath: f.packetsPath,
    approvalDecisionsPath: f.decisionsPath,
    executionResultsPath: f.resultsPath,
    completionNotificationsPath: f.notificationsPath,
    env: { TELEGRAM_BOT_TOKEN: 'bot123:ABC', TELEGRAM_CHAT_ID: '12345' },
    mockSend: true,
    now: new Date('2026-07-05T12:00:00Z'),
    ...overrides,
  }
}

describe('telegram source-code edit approval lane', () => {
  it('dry-run validates exact approval chain and writes nothing', async () => {
    const f = await fixture()
    const result = await runTelegramSourceCodeEditLane(runArgs(f, { dryRun: true }))
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('dry-run')
    expect(result.exact_allowed_files).toEqual(ALLOWED)
    expect(result.executionResultWritten).toBe(false)
    expect(result.telegramSent).toBe(false)
    expect(result.githubWrites).toBe(false)
    expect(result.staged).toBe(false)
    expect(await exists(path.join(f.workspace, 'src/example.ts'))).toBe(false)
    expect(await exists(f.resultsPath)).toBe(false)
    expect(await exists(f.notificationsPath)).toBe(false)
  })

  it('requires exact allowed file list and rejects broad directories', async () => {
    const f = await fixture()
    const result = await runTelegramSourceCodeEditLane(runArgs(f, { allowedFile: ['src/'] }))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('EXACT_ALLOWED_FILE_LIST_REQUIRED')
    expect(await exists(f.resultsPath)).toBe(false)
  })

  it('hard-blocks package files even when explicitly listed by packet and invocation', async () => {
    for (const packageFile of ['package.json', 'package-lock.json', 'pnpm-lock.yaml']) {
      const f = await fixture({
        packet: { exact_files_allowed_to_edit: [packageFile] },
        manifest: { files: [{ path: packageFile, content: '{}' }], test_commands: TESTS },
      })
      const result = await runTelegramSourceCodeEditLane(runArgs(f, { allowedFile: [packageFile] }))
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('PACKAGE_FILE_EDIT_REQUIRES_SEPARATE_APPROVAL_LANE')
      expect(result.package_files_blocked).toEqual([packageFile])
      expect(await exists(path.join(f.workspace, packageFile))).toBe(false)
      expect(await exists(f.resultsPath)).toBe(false)
      expect(result.githubCalls).toBe(false)
      expect(result.dependencyInstall).toBe(false)
      expect(result.auditAppend).toBe(false)
      expect(result.durableMutation).toBe(false)
    }
  })

  it('hard-blocks package files from edit manifest even when allowed scope is different', async () => {
    const f = await fixture({ manifest: { files: [{ path: 'package.json', content: '{}' }], test_commands: TESTS } })
    const result = await runTelegramSourceCodeEditLane(runArgs(f))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('PACKAGE_FILE_EDIT_REQUIRES_SEPARATE_APPROVAL_LANE')
    expect(await exists(path.join(f.workspace, 'package.json'))).toBe(false)
    expect(await exists(f.resultsPath)).toBe(false)
  })

  it('rejects unapproved test commands and dependency installs', async () => {
    const forbidden = ['pnpm install']
    const f = await fixture({ packet: { tests_to_run: forbidden }, manifest: { test_commands: forbidden } })
    const result = await runTelegramSourceCodeEditLane(runArgs(f, { approvedTestCommand: forbidden }))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('UNAPPROVED_OR_FORBIDDEN_TEST_COMMAND')
    expect(await exists(f.resultsPath)).toBe(false)
  })

  it('executes approved exact-scope edit, approved tests, result write, and Telegram completion only', async () => {
    const f = await fixture()
    const result = await runTelegramSourceCodeEditLane(runArgs(f))
    expect(result.ok).toBe(true)
    expect(result.filesEdited).toEqual(ALLOWED)
    expect(result.testsRun).toHaveLength(1)
    expect(result.executionResultWritten).toBe(true)
    expect(result.telegramSent).toBe(true)
    expect(result.completionNotificationWritten).toBe(true)
    expect(result.githubCalls).toBe(false)
    expect(result.githubWrites).toBe(false)
    expect(result.dependencyInstall).toBe(false)
    expect(result.obsidianKanbanWrites).toBe(false)
    expect(result.staged).toBe(false)
    expect(result.committed).toBe(false)
    expect(await readFile(path.join(f.workspace, 'src/example.ts'), 'utf8')).toBe('export const tg15 = true\n')
    const rows = (await readFile(f.resultsPath, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line))
    expect(rows).toHaveLength(1)
    expect(rows[0].files_edited).toEqual(ALLOWED)
    const notifications = (await readFile(f.notificationsPath, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line))
    expect(notifications).toHaveLength(1)
    expect(JSON.stringify(notifications[0])).not.toContain('bot123:ABC')
    expect(JSON.stringify(notifications[0])).not.toContain('12345')
  })

  it('blocks replay before edits, tests, result writes, or Telegram sends', async () => {
    const f = await fixture({ previousResult: { approval_id: APPROVAL_ID, execution_result_id: 'old' } })
    const result = await runTelegramSourceCodeEditLane(runArgs(f))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('REPLAY_BLOCKED_PREVIOUS_EXECUTION_RESULT')
    expect(result.telegramSent).toBe(false)
    expect(await exists(path.join(f.workspace, 'src/example.ts'))).toBe(false)
  })

  it('requires implementation proposal, build plan, exact scope, and Telegram approval', async () => {
    const missingProposal = await fixture({ packet: { implementation_proposal_approved: false } })
    expect((await runTelegramSourceCodeEditLane(runArgs(missingProposal))).reason).toBe('IMPLEMENTATION_PROPOSAL_NOT_APPROVED')
    const missingBuild = await fixture({ packet: { build_plan_approved: false } })
    expect((await runTelegramSourceCodeEditLane(runArgs(missingBuild))).reason).toBe('BUILD_PLAN_NOT_APPROVED')
    const missingScope = await fixture({ packet: { exact_source_file_scope_approved: false } })
    expect((await runTelegramSourceCodeEditLane(runArgs(missingScope))).reason).toBe('EXACT_SOURCE_FILE_SCOPE_NOT_APPROVED')
    const missingTelegram = await fixture({ decision: { decision: 'rejected' } })
    expect((await runTelegramSourceCodeEditLane(runArgs(missingTelegram))).reason).toBe('TELEGRAM_APPROVAL_REQUIRED')
  })
})
