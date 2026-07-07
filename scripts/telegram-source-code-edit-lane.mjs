#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { exec } from 'node:child_process'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { formatHumanTelegramMessage } from './telegram-message-format.mjs'
import { defaultTelegramEnvFile, resolveTelegramCredentials } from './telegram-discovery-notification.mjs'

const execAsync = promisify(exec)

export const DEFAULT_APPROVAL_PACKETS_PATH = '/root/.hermes/reports/github-discovery/telegram-code-edit-approval-packets.jsonl'
export const DEFAULT_APPROVAL_DECISIONS_PATH = '/root/.hermes/reports/github-discovery/telegram-approval-decisions.jsonl'
export const DEFAULT_EXECUTION_RESULTS_PATH = '/root/.hermes/reports/github-discovery/telegram-source-code-edit-execution-results.jsonl'
export const DEFAULT_COMPLETION_NOTIFICATIONS_PATH = '/root/.hermes/reports/github-discovery/telegram-source-code-edit-completion-notifications.jsonl'
export const DEFAULT_TARGET_WORKSPACE = '/root/hermes-workspace'

export const SOURCE_EDIT_SIDE_EFFECT_FLAGS = Object.freeze({
  githubCalls: false,
  githubWrites: false,
  branch: false,
  pr: false,
  merge: false,
  delete: false,
  dependencyInstall: false,
  obsidianKanbanWrites: false,
  staged: false,
  committed: false,
  auditAppend: false,
  durableMutation: false,
})

const PACKAGE_FILES = new Set(['package.json', 'package-lock.json', 'pnpm-lock.yaml'])
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/gi,
  /github_pat_[A-Za-z0-9_]{20,}/gi,
  /bot\d+:[A-Za-z0-9_-]+/gi,
  /(["']?(?:token|secret|password|api[_-]?key|client[_-]?secret|chat[_-]?id)["']?\s*[:=]\s*)["']?[^\s,'"}]+["']?/gi,
]

function parseArgs(argv) {
  const args = { allowedFile: [], approvedTestCommand: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') args.json = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--approval-id') args.approvalId = argv[++i]
    else if (arg === '--target-workspace') args.targetWorkspace = argv[++i]
    else if (arg === '--allowed-file') args.allowedFile.push(argv[++i])
    else if (arg === '--approved-test-command') args.approvedTestCommand.push(argv[++i])
    else if (arg === '--edit-manifest') args.editManifestPath = argv[++i]
    else if (arg === '--approval-packets-path') args.approvalPacketsPath = argv[++i]
    else if (arg === '--approval-decisions-path') args.approvalDecisionsPath = argv[++i]
    else if (arg === '--execution-results-path') args.executionResultsPath = argv[++i]
    else if (arg === '--completion-notifications-path') args.completionNotificationsPath = argv[++i]
    else if (arg === '--env-file') args.envFile = argv[++i]
    else if (arg === '--bot-token') args.botToken = argv[++i]
    else if (arg === '--chat-id') args.chatId = argv[++i]
    else if (arg === '--mock-send') args.mockSend = true
    else if (arg === '--now') args.now = argv[++i]
  }
  return args
}

function requireJson(json) {
  if (!json) throw new Error('telegram-source-code-edit-lane is intentionally JSON-only. Pass --json.')
}

export function sanitizeText(value, cap = 12000) {
  let text = String(value ?? '').replace(/\u0000/g, '')
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (...match) => (match[1] ? `${match[1]}[REDACTED]` : '[REDACTED]'))
  }
  return text.slice(0, cap)
}

async function readJsonl(pathname) {
  try {
    return (await readFile(pathname, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, 'utf8'))
}

async function appendJsonl(pathname, row) {
  await mkdir(path.dirname(pathname), { recursive: true })
  await appendFile(pathname, `${JSON.stringify(row)}\n`, 'utf8')
}

async function exists(pathname) {
  try {
    await stat(pathname)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function normalizeWorkspace(workspace) {
  return path.resolve(workspace || DEFAULT_TARGET_WORKSPACE)
}

export function normalizeExactFileList(files) {
  if (!Array.isArray(files) || files.length === 0) return null
  const normalized = files.map((file) => String(file || '').trim()).filter(Boolean)
  if (normalized.length !== files.length || normalized.length === 0) return null
  const seen = new Set()
  for (const file of normalized) {
    const parts = file.split('/').filter(Boolean)
    const unsafe =
      path.isAbsolute(file) ||
      file.includes('*') ||
      file.endsWith('/') ||
      file === '.' ||
      file === '..' ||
      parts.includes('..') ||
      parts.includes('.git') ||
      parts.includes('node_modules') ||
      /(^|\/)(\.env|\.ssh)(\/|$)|token|secret|password|credential/i.test(file)
    if (unsafe) return null
    if (seen.has(file)) return null
    seen.add(file)
  }
  return normalized
}

function sameOrderedList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index])
}

function commandAllowed(command, approvedCommands) {
  if (!approvedCommands.includes(command)) return false
  const forbidden = /(^|\s)(gh|git\s+(add|commit|push|branch|checkout|switch|merge|reset|rm)|npm\s+install|pnpm\s+(install|add|remove)|yarn\s+(install|add|remove)|bun\s+(install|add|remove)|rm\s+-rf)\b/i
  return !forbidden.test(command)
}

function hashObject(value) {
  return createHash('sha256').update(JSON.stringify(value, Object.keys(value).sort())).digest('hex')
}

function findPacket(rows, approvalId) {
  return rows.find((row) => row?.approval_id === approvalId || row?.code_edit_approval_id === approvalId || row?.short_alias === approvalId) || null
}

function findDecision(rows, approvalId, packet) {
  const aliases = new Set([approvalId, packet?.approval_id, packet?.code_edit_approval_id, packet?.short_alias].filter(Boolean))
  return rows.find((row) => aliases.has(row?.approval_id) && String(row?.decision || row?.status || '').toLowerCase() === 'approved') || null
}

function block(reason, extra = {}) {
  return {
    ok: false,
    blocked: true,
    reason,
    dryRun: extra.dryRun === true,
    filesEdited: [],
    testsRun: [],
    executionResultWritten: false,
    telegramSent: false,
    completionNotificationWritten: false,
    workerExecuted: false,
    ...SOURCE_EDIT_SIDE_EFFECT_FLAGS,
    ...extra,
  }
}

function validatePacketGates(packet) {
  if (packet?.implementation_proposal_approved !== true) return 'IMPLEMENTATION_PROPOSAL_NOT_APPROVED'
  if (packet?.build_plan_approved !== true) return 'BUILD_PLAN_NOT_APPROVED'
  if (packet?.exact_source_file_scope_approved !== true) return 'EXACT_SOURCE_FILE_SCOPE_NOT_APPROVED'
  return null
}

function manifestFiles(manifest) {
  return Array.isArray(manifest?.files) ? manifest.files : []
}

function validateManifest(manifest, allowedFiles) {
  const files = manifestFiles(manifest)
  if (!files.length) return 'EDIT_MANIFEST_EMPTY'
  const editPaths = normalizeExactFileList(files.map((file) => file.path))
  if (!editPaths) return 'EDIT_MANIFEST_HAS_UNSAFE_PATHS'
  if (editPaths.some((file) => PACKAGE_FILES.has(file))) return 'PACKAGE_FILE_EDIT_REQUIRES_SEPARATE_APPROVAL_LANE'
  if (!sameOrderedList(editPaths, allowedFiles)) return 'EDIT_MANIFEST_DOES_NOT_MATCH_ALLOWED_FILES'
  for (const file of files) {
    if (typeof file.content !== 'string') return 'EDIT_MANIFEST_FILE_CONTENT_REQUIRED'
  }
  return null
}

async function readEnvFile(envFile) {
  try {
    const parsed = {}
    for (const line of (await readFile(envFile, 'utf8')).split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      parsed[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    }
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

async function sendTelegramCompletion({ credentials, message, mockSend, fetchImpl = globalThis.fetch }) {
  if (!credentials.botToken || !credentials.chatId) return { ok: false, reason: 'MISSING_TELEGRAM_CREDENTIALS' }
  if (mockSend) return { ok: true, mocked: true, messageId: 'mock-completion-message-id' }
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'FETCH_UNAVAILABLE' }
  const response = await fetchImpl(`https://api.telegram.org/bot${credentials.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: credentials.chatId, text: message, disable_web_page_preview: true }),
  })
  let body = null
  try { body = await response.json() } catch {}
  if (!response.ok || body?.ok === false) return { ok: false, reason: `TELEGRAM_SEND_FAILED_${response.status}` }
  return { ok: true, messageId: body?.result?.message_id ?? null }
}

async function runApprovedTests(commands, workspace) {
  const results = []
  for (const command of commands) {
    const { stdout, stderr } = await execAsync(command, { cwd: workspace, timeout: 120000, maxBuffer: 1024 * 1024 })
    results.push({ command, exit_code: 0, stdout: sanitizeText(stdout, 4000), stderr: sanitizeText(stderr, 4000) })
  }
  return results
}

export async function runTelegramSourceCodeEditLane({
  approvalId,
  targetWorkspace = DEFAULT_TARGET_WORKSPACE,
  allowedFile = [],
  approvedTestCommand = [],
  editManifestPath,
  approvalPacketsPath = DEFAULT_APPROVAL_PACKETS_PATH,
  approvalDecisionsPath = DEFAULT_APPROVAL_DECISIONS_PATH,
  executionResultsPath = DEFAULT_EXECUTION_RESULTS_PATH,
  completionNotificationsPath = DEFAULT_COMPLETION_NOTIFICATIONS_PATH,
  dryRun = false,
  env = process.env,
  envFile = defaultTelegramEnvFile(),
  botToken,
  chatId,
  mockSend = false,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (!approvalId) return block('APPROVAL_ID_REQUIRED', { dryRun })
  if (!editManifestPath) return block('EDIT_MANIFEST_REQUIRED', { dryRun })
  const workspace = normalizeWorkspace(targetWorkspace)
  const exactAllowedFiles = normalizeExactFileList(allowedFile)
  if (!exactAllowedFiles) return block('EXACT_ALLOWED_FILE_LIST_REQUIRED', { dryRun })
  if (exactAllowedFiles.some((file) => PACKAGE_FILES.has(file))) {
    return block('PACKAGE_FILE_EDIT_REQUIRES_SEPARATE_APPROVAL_LANE', { dryRun, approval_id: approvalId, package_files_blocked: exactAllowedFiles.filter((file) => PACKAGE_FILES.has(file)) })
  }

  const packets = await readJsonl(approvalPacketsPath)
  const packet = findPacket(packets, approvalId)
  if (!packet) return block('CODE_EDIT_APPROVAL_PACKET_NOT_FOUND', { dryRun, approval_id: approvalId })
  const gateReason = validatePacketGates(packet)
  if (gateReason) return block(gateReason, { dryRun, approval_id: approvalId })
  const packetFiles = normalizeExactFileList(packet.exact_files_allowed_to_edit)
  if (!sameOrderedList(packetFiles, exactAllowedFiles)) return block('ALLOWED_FILE_LIST_MISMATCH', { dryRun, approval_id: approvalId, packet_files: packetFiles, allowed_files: exactAllowedFiles })

  const decisions = await readJsonl(approvalDecisionsPath)
  const decision = findDecision(decisions, approvalId, packet)
  if (!decision) return block('TELEGRAM_APPROVAL_REQUIRED', { dryRun, approval_id: approvalId })

  const previousResults = await readJsonl(executionResultsPath)
  if (previousResults.some((row) => row.approval_id === (packet.approval_id || packet.code_edit_approval_id))) {
    return block('REPLAY_BLOCKED_PREVIOUS_EXECUTION_RESULT', { dryRun, approval_id: approvalId, replayBlocked: true })
  }

  const manifest = await readJson(editManifestPath)
  const manifestReason = validateManifest(manifest, exactAllowedFiles)
  if (manifestReason) return block(manifestReason, { dryRun, approval_id: approvalId })

  const packetTests = Array.isArray(packet.tests_to_run) ? packet.tests_to_run.map(String) : []
  const manifestTests = Array.isArray(manifest.test_commands) ? manifest.test_commands.map(String) : []
  const approvedTests = approvedTestCommand.map(String)
  if (!sameOrderedList(manifestTests, approvedTests) || !sameOrderedList(packetTests, approvedTests)) {
    return block('APPROVED_TEST_COMMANDS_REQUIRED', { dryRun, approval_id: approvalId, packet_tests: packetTests, approved_test_commands: approvedTests })
  }
  if (!approvedTests.every((command) => commandAllowed(command, approvedTests))) {
    return block('UNAPPROVED_OR_FORBIDDEN_TEST_COMMAND', { dryRun, approval_id: approvalId })
  }

  const plan = {
    ok: true,
    dryRun,
    approval_id: packet.approval_id || packet.code_edit_approval_id,
    short_alias: packet.short_alias || null,
    target_workspace: workspace,
    exact_allowed_files: exactAllowedFiles,
    approved_test_commands: approvedTests,
    filesEdited: [],
    testsRun: [],
    executionResultWritten: false,
    telegramSent: false,
    completionNotificationWritten: false,
    replayBlocked: false,
    workerExecuted: false,
    ...SOURCE_EDIT_SIDE_EFFECT_FLAGS,
  }
  if (dryRun) return { ...plan, mode: 'dry-run', note: 'Dry-run only. No source files, execution results, Telegram, GitHub, audit, durable store, Obsidian, Kanban, staging, or commits touched.' }

  for (const file of manifestFiles(manifest)) {
    const target = path.resolve(workspace, file.path)
    if (!target.startsWith(`${workspace}${path.sep}`)) return block('TARGET_FILE_ESCAPES_WORKSPACE', { approval_id: approvalId })
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, 'utf8')
  }
  const testsRun = await runApprovedTests(approvedTests, workspace)
  const resultId = `source_edit_${createHash('sha256').update(`${packet.approval_id || approvalId}\n${now.toISOString()}`).digest('hex').slice(0, 16)}`
  const executionResult = {
    execution_result_id: resultId,
    approval_id: packet.approval_id || packet.code_edit_approval_id,
    short_alias: packet.short_alias || null,
    status: 'completed',
    completed_at: new Date(now).toISOString(),
    target_workspace: workspace,
    files_edited: exactAllowedFiles,
    tests_run: testsRun.map((test) => ({ command: test.command, exit_code: test.exit_code })),
    replay_blocked: true,
    telegram_approval_received: true,
    implementation_proposal_approved: true,
    build_plan_approved: true,
    exact_source_file_scope_approved: true,
    ...SOURCE_EDIT_SIDE_EFFECT_FLAGS,
  }
  await appendJsonl(executionResultsPath, executionResult)

  const message = formatHumanTelegramMessage({
    type: 'completion',
    execution_result_id: resultId,
    approval_id: executionResult.approval_id,
    alias: packet.short_alias || null,
    status: 'Source code edit completed',
    recommendation: 'Review edited files. Staging/commit still needs separate explicit approval.',
    reply: 'Reply with exact next instruction if you want review, staging, or commit.',
  })
  const fileEnv = await readEnvFile(envFile)
  const credentials = resolveTelegramCredentials({ ...fileEnv, ...env }, { botToken, chatId })
  const sent = await sendTelegramCompletion({ credentials, message, mockSend, fetchImpl })
  if (!sent.ok) return block(sent.reason, { approval_id: approvalId, filesEdited: exactAllowedFiles, testsRun, executionResultWritten: true })
  const notificationRow = {
    sent: true,
    sent_at: new Date(now).toISOString(),
    execution_result_id: resultId,
    execution_result_hash: hashObject(executionResult),
    approval_id: executionResult.approval_id,
    approval_alias: packet.short_alias || null,
    files_edited: exactAllowedFiles,
    result_status: 'completed',
    replay_blocked: true,
    telegram_message_id: sent.messageId,
    telegram_chat: credentials.redacted.chatId,
    telegram_token: credentials.redacted.botToken,
    ...SOURCE_EDIT_SIDE_EFFECT_FLAGS,
  }
  await appendJsonl(completionNotificationsPath, notificationRow)

  return {
    ...plan,
    mode: 'execute',
    filesEdited: exactAllowedFiles,
    testsRun,
    executionResultWritten: true,
    execution_result: executionResult,
    execution_results_path: executionResultsPath,
    telegramSent: true,
    telegram_message_text: message,
    telegram_message_id: sent.messageId,
    completionNotificationWritten: true,
    completion_notifications_path: completionNotificationsPath,
    mocked: sent.mocked === true,
    note: 'Approved exact-scope source edit completed. No staging, commit, GitHub write, dependency install, Obsidian, Kanban, audit, or durable-store mutation was performed.',
  }
}

export async function runTelegramSourceCodeEditLaneCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  requireJson(args.json)
  const result = await runTelegramSourceCodeEditLane({
    approvalId: args.approvalId,
    targetWorkspace: args.targetWorkspace,
    allowedFile: args.allowedFile,
    approvedTestCommand: args.approvedTestCommand,
    editManifestPath: args.editManifestPath,
    approvalPacketsPath: args.approvalPacketsPath,
    approvalDecisionsPath: args.approvalDecisionsPath,
    executionResultsPath: args.executionResultsPath,
    completionNotificationsPath: args.completionNotificationsPath,
    dryRun: args.dryRun === true,
    envFile: args.envFile,
    botToken: args.botToken,
    chatId: args.chatId,
    mockSend: args.mockSend === true,
    now: args.now ? new Date(args.now) : new Date(),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.ok ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTelegramSourceCodeEditLaneCli().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}
