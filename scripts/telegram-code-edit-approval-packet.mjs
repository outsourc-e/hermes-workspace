#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { formatHumanTelegramMessage } from './telegram-message-format.mjs'

export const DEFAULT_BUILD_PLANS_PATH =
  '/root/.hermes/reports/github-discovery/telegram-build-plans.jsonl'
export const DEFAULT_APPROVAL_PACKETS_PATH =
  '/root/.hermes/reports/github-discovery/telegram-code-edit-approval-packets.jsonl'
export const DEFAULT_APPROVAL_PACKET_REPORT_DIR =
  '/root/.hermes/reports/github-discovery/code-edit-approval-packets'

export const SIDE_EFFECT_FLAGS = Object.freeze({
  approvalPacketOnly: true,
  codeEdits: false,
  commandsRun: false,
  dependencyInstall: false,
  githubCalls: false,
  githubWrites: false,
  branch: false,
  pr: false,
  merge: false,
  delete: false,
  auditAppend: false,
  durableMutation: false,
  obsidianKanbanWrites: false,
  telegramSent: false,
})

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /bot\d+:[A-Za-z0-9_-]+/g,
  /\b-?\d{8,15}\b/g,
  /["']?(?<key>token|secret|password|api[_-]?key|client[_-]?secret|chat[_-]?id)["']?\s*[:=]\s*["']?[^\s,'\"}]+["']?/gi,
]

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') args.json = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--send-telegram') args.sendTelegram = true
    else if (arg === '--build-plan-id') args.buildPlanId = argv[++i]
    else if (arg === '--build-plans-path') args.buildPlansPath = argv[++i]
    else if (arg === '--approval-packets-path') args.approvalPacketsPath = argv[++i]
    else if (arg === '--approval-packet-report-dir') args.approvalPacketReportDir = argv[++i]
    else if (arg === '--target-workspace') args.targetWorkspace = argv[++i]
    else if (arg === '--now') args.now = argv[++i]
    else args._.push(arg)
  }
  return args
}

function requireJson(args) {
  if (!args.json)
    throw new Error(
      'telegram-code-edit-approval-packet is intentionally JSON-only. Pass --json.',
    )
}

export function sanitizeText(value, cap = 12000) {
  let text = String(value || '').replace(/\u0000/g, '')
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (...match) =>
      match.groups?.key ? `${match.groups.key}=[REDACTED]` : '[REDACTED]',
    )
  }
  return text.replace(/[\t ]+$/gm, '').slice(0, cap)
}

async function readJsonl(pathname) {
  try {
    const content = await readFile(pathname, 'utf8')
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function appendJsonl(pathname, row) {
  await mkdir(path.dirname(pathname), { recursive: true })
  await appendFile(pathname, `${JSON.stringify(row)}\n`, 'utf8')
}

async function pathExists(pathname) {
  try {
    await stat(pathname)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function safeIdPart(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_')
}

function approvalPacketId(buildPlanId, targetWorkspace) {
  const hash = createHash('sha256')
    .update(`${buildPlanId}\n${targetWorkspace}\ncode-edit-approval`)
    .digest('hex')
    .slice(0, 12)
  return `code_edit_${safeIdPart(buildPlanId)}_${hash}`
}

function shortAliasForApprovalId(approvalId) {
  const id = String(approvalId || '')
  if (
    id ===
    'code_edit_build_impl_tg4_d3fd7da71ae557f3_8f61483465_d7420c166e_a033e3539084'
  )
    return 'edit1'
  const match = id.match(/([a-f0-9]{8})[a-f0-9]*$/i)
  return match
    ? match[1].toLowerCase()
    : id.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 12)
}

function safeReportName(codeEditApprovalId) {
  return `${safeIdPart(codeEditApprovalId)}.md`
}

function block(reason, extra = {}) {
  return {
    ok: false,
    blocked: true,
    reason,
    approvalPacketWritten: false,
    reportWritten: false,
    ...SIDE_EFFECT_FLAGS,
    ...extra,
    note: 'Fail-closed. No code edit approval packet row or report was written.',
  }
}

function findBuildPlan(rows, buildPlanId) {
  return rows.find((row) => row?.build_plan_id === buildPlanId) || null
}

function findExistingPacket(rows, buildPlanId) {
  return rows.find((row) => row?.build_plan_id === buildPlanId) || null
}

function exactFilesFromBuildPlan(buildPlan) {
  const files = buildPlan?.expected_files_to_touch
  if (!Array.isArray(files) || files.length === 0) return null
  const normalized = files.map((item) => String(item || '').trim()).filter(Boolean)
  if (normalized.length !== files.length || normalized.length === 0) return null
  const unsafe = normalized.some(
    (item) =>
      item.includes('*') ||
      item.endsWith('/') ||
      path.isAbsolute(item) ||
      item.split('/').includes('..') ||
      /(^|\/)(\.env|\.git|node_modules|\.ssh)(\/|$)|token|secret|password|credential/i.test(
        item,
      ),
  )
  return unsafe ? null : normalized
}

function forbiddenFilesFromBuildPlan(buildPlan) {
  const forbidden = buildPlan?.forbidden_files_or_paths
  if (!Array.isArray(forbidden)) return []
  return forbidden.map((item) => sanitizeText(item, 500)).filter(Boolean)
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString()
}

function buildPacket({ buildPlan, now }) {
  const targetWorkspace = buildPlan.target_repo_or_workspace || buildPlan.target_workspace
  const exactFilesAllowed = exactFilesFromBuildPlan(buildPlan)
  if (!exactFilesAllowed) {
    return block('BLOCKED_EXACT_EDIT_SCOPE_REQUIRED', {
      build_plan_id: buildPlan?.build_plan_id || null,
      target_workspace: targetWorkspace || null,
    })
  }

  const id = approvalPacketId(buildPlan.build_plan_id, targetWorkspace)
  const shortAlias = shortAliasForApprovalId(id)
  return {
    code_edit_approval_id: id,
    approval_id: id,
    short_alias: shortAlias,
    build_plan_id: buildPlan.build_plan_id,
    target_workspace: targetWorkspace,
    exact_files_allowed_to_edit: exactFilesAllowed,
    exact_files_forbidden_to_edit: forbiddenFilesFromBuildPlan(buildPlan),
    proposed_change_summary: [
      'Create the approved local docs-only CoWork-OS pattern adaptation design note.',
      'Create the approved companion test-plan note for later implementation validation gates.',
      'Keep this package limited to the exact docs paths; no implementation, prototype, dashboard, route, service, dependency, or external-service edits.',
    ],
    planned_commands: [
      'git diff --cached --name-status',
      'mkdir -p docs/github-discovery',
      'write docs/github-discovery/cowork-os-pattern-adaptation.md',
      'write docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
      'git diff --check -- docs/github-discovery/cowork-os-pattern-adaptation.md docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
      'git status --short -- docs/github-discovery/cowork-os-pattern-adaptation.md docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
      'static scan: no token/chat_id/API key/password strings in the two generated docs',
      'static scan: no source-code import/copy instructions from CoWork-OS in the design note',
    ],
    tests_to_run: (buildPlan.tests_to_run || []).map((item) => sanitizeText(item, 1000)),
    rollback_plan: (buildPlan.rollback_plan || []).map((item) => sanitizeText(item, 1000)),
    allowed_side_effects: [
      'Create or modify only docs/github-discovery/cowork-os-pattern-adaptation.md',
      'Create or modify only docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
      'Run local git diff/status/static-scan verification commands only after approval.',
    ],
    forbidden_side_effects: [
      'No edits outside exact_files_allowed_to_edit.',
      'No command execution before approval.',
      'No dependency install.',
      'No GitHub calls or writes.',
      'No branch, PR, merge, push, clone, fork, or delete.',
      'No audit append.',
      'No durable-store mutation.',
      'No Obsidian or Kanban writes.',
      'No Telegram send unless explicitly passed --send-telegram in a future sender package.',
      'No token/chat/API key/password exposure; redact sensitive identifiers.',
    ],
    expiry_time: addMinutes(now, 24 * 60),
    approval_command: `/approve ${shortAlias}`,
    reject_command: `/reject ${shortAlias}`,
    created_at: now.toISOString(),
    sanitized: true,
    ...SIDE_EFFECT_FLAGS,
  }
}

function validatePacket(packet) {
  if (packet?.blocked) return packet
  const serialized = JSON.stringify(packet)
  if (/gh[pousr]_|github_pat_|bot\d+:/i.test(serialized))
    return block('UNREDACTED_SECRET_DETECTED', {
      code_edit_approval_id: packet.code_edit_approval_id,
    })
  if (/chat[_-]?id\s*[:=]/i.test(serialized))
    return block('UNREDACTED_CHAT_IDENTIFIER_DETECTED', {
      code_edit_approval_id: packet.code_edit_approval_id,
    })
  if (
    !Array.isArray(packet.exact_files_allowed_to_edit) ||
    packet.exact_files_allowed_to_edit.length === 0
  ) {
    return block('BLOCKED_EXACT_EDIT_SCOPE_REQUIRED', {
      build_plan_id: packet.build_plan_id,
    })
  }
  return null
}

function packetMarkdown(packet) {
  return sanitizeText(
    `# Telegram code edit approval packet

Code edit approval ID: ${packet.code_edit_approval_id}
Build plan ID: ${packet.build_plan_id}
Target workspace: ${packet.target_workspace}
Expiry time: ${packet.expiry_time}

## Exact files allowed to edit
${packet.exact_files_allowed_to_edit.map((item) => `- ${item}`).join('\n')}

## Exact files forbidden to edit
${packet.exact_files_forbidden_to_edit.map((item) => `- ${item}`).join('\n')}

## Proposed change summary
${packet.proposed_change_summary.map((item) => `- ${item}`).join('\n')}

## Planned commands after approval
${packet.planned_commands.map((item) => `- ${item}`).join('\n')}

## Tests to run after approval
${packet.tests_to_run.map((item) => `- ${item}`).join('\n')}

## Rollback plan
${packet.rollback_plan.map((item) => `- ${item}`).join('\n')}

## Allowed side effects
${packet.allowed_side_effects.map((item) => `- ${item}`).join('\n')}

## Forbidden side effects
${packet.forbidden_side_effects.map((item) => `- ${item}`).join('\n')}

## Approval commands
- ${packet.approval_command}
- ${packet.reject_command}
`,
    24000,
  )
}

export async function runTelegramCodeEditApprovalPacket({
  buildPlanId,
  buildPlansPath = DEFAULT_BUILD_PLANS_PATH,
  approvalPacketsPath = DEFAULT_APPROVAL_PACKETS_PATH,
  approvalPacketReportDir = DEFAULT_APPROVAL_PACKET_REPORT_DIR,
  targetWorkspace,
  dryRun = false,
  sendTelegram = false,
  now = new Date(),
} = {}) {
  if (!buildPlanId)
    throw new Error('telegram-code-edit-approval-packet requires --build-plan-id.')
  if (sendTelegram)
    return block('TELEGRAM_SEND_NOT_IMPLEMENTED_FOR_THIS_PACKAGE', {
      build_plan_id: buildPlanId,
      telegramSent: false,
    })

  const [buildPlans, existingPackets] = await Promise.all([
    readJsonl(buildPlansPath),
    readJsonl(approvalPacketsPath),
  ])
  const buildPlan = findBuildPlan(buildPlans, buildPlanId)
  if (!buildPlan) return block('BUILD_PLAN_NOT_FOUND', { build_plan_id: buildPlanId })

  if (!targetWorkspace) {
    return block('BLOCKED_TARGET_WORKSPACE_REQUIRED', {
      build_plan_id: buildPlanId,
      required_field: '--target-workspace <absolute repo/workspace path>',
    })
  }

  const planWorkspace = buildPlan.target_repo_or_workspace || buildPlan.target_workspace || null
  if (planWorkspace !== targetWorkspace) {
    return block('TARGET_WORKSPACE_MISMATCH', {
      build_plan_id: buildPlanId,
      target_workspace: targetWorkspace,
      build_plan_target_workspace: planWorkspace,
    })
  }
  if (!path.isAbsolute(targetWorkspace)) {
    return block('TARGET_WORKSPACE_MUST_BE_ABSOLUTE', {
      build_plan_id: buildPlanId,
      target_workspace: targetWorkspace,
    })
  }
  if (!(await pathExists(targetWorkspace))) {
    return block('TARGET_WORKSPACE_NOT_FOUND', {
      build_plan_id: buildPlanId,
      target_workspace: targetWorkspace,
    })
  }

  const existing = findExistingPacket(existingPackets, buildPlanId)
  if (existing) {
    return block('CODE_EDIT_APPROVAL_PACKET_DUPLICATE_BLOCKED', {
      build_plan_id: buildPlanId,
      code_edit_approval_id: existing.code_edit_approval_id || null,
    })
  }

  const packet = buildPacket({ buildPlan, now })
  const invalid = validatePacket(packet)
  if (invalid) return invalid

  const markdown = packetMarkdown(packet)
  const reportPath = path.join(
    approvalPacketReportDir,
    safeReportName(packet.code_edit_approval_id),
  )
  const row = {
    ...packet,
    approval_packet_report_path: reportPath,
    approval_packet_report_hash: createHash('sha256').update(markdown).digest('hex'),
    telegram_message_text: formatHumanTelegramMessage({
      type: 'code-edit-approval',
      code_edit_approval_id: packet.code_edit_approval_id,
      alias: packet.short_alias,
      exact_files_allowed_to_edit: packet.exact_files_allowed_to_edit,
      report_path: reportPath,
    }),
  }
  const base = {
    ok: true,
    blocked: false,
    mode: dryRun ? 'code_edit_approval_packet_dry_run' : 'code_edit_approval_packet_write',
    build_plan_id: buildPlanId,
    code_edit_approval_id: packet.code_edit_approval_id,
    dryRun,
    approval_packets_path: approvalPacketsPath,
    approval_packet_report_path: reportPath,
    approval_packet: row,
    approvalPacketWritten: false,
    reportWritten: false,
    ...SIDE_EFFECT_FLAGS,
    note: dryRun
      ? 'Dry-run only. Approval packet generated in JSON; no packet row or report written.'
      : 'Approval packet written only. No code edits or commands were run.',
  }
  if (dryRun) return base

  await mkdir(approvalPacketReportDir, { recursive: true })
  await writeFile(reportPath, markdown, 'utf8')
  await appendJsonl(approvalPacketsPath, row)
  return { ...base, approvalPacketWritten: true, reportWritten: true }
}

export async function runTelegramCodeEditApprovalPacketCli(
  argv = process.argv.slice(2),
) {
  const args = parseArgs(argv)
  requireJson(args)
  const result = await runTelegramCodeEditApprovalPacket({
    buildPlanId: args.buildPlanId,
    buildPlansPath: args.buildPlansPath || DEFAULT_BUILD_PLANS_PATH,
    approvalPacketsPath: args.approvalPacketsPath || DEFAULT_APPROVAL_PACKETS_PATH,
    approvalPacketReportDir:
      args.approvalPacketReportDir || DEFAULT_APPROVAL_PACKET_REPORT_DIR,
    targetWorkspace: args.targetWorkspace,
    dryRun: args.dryRun === true,
    sendTelegram: args.sendTelegram === true,
    now: args.now ? new Date(args.now) : new Date(),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runTelegramCodeEditApprovalPacketCli().catch((error) => {
    const safe = {
      ok: false,
      blocked: true,
      error: sanitizeText(error?.message || error, 500),
      approvalPacketWritten: false,
      reportWritten: false,
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    }
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`)
    process.exitCode = 1
  })
}
