#!/usr/bin/env node
import { pathToFileURL } from 'node:url'

export const TELEGRAM_MESSAGE_TYPES = Object.freeze([
  'discovery',
  'approval',
  'implementation-proposal-approval',
  'code-edit-approval',
  'approval-recorded',
  'completion',
  'blocked-error',
])

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/gi,
  /github_pat_[A-Za-z0-9_]{20,}/gi,
  /bot\d+:[A-Za-z0-9_-]+/gi,
  /(["']?(?:token|secret|password|api[_-]?key|client[_-]?secret|chat[_-]?id)["']?\s*[:=]\s*)["']?[^\s,'"}]+["']?/gi,
]

const TYPE_ALIASES = Object.freeze({
  approval: 'approval',
  'approval-request': 'approval',
  'implementation-proposal': 'implementation-proposal-approval',
  'implementation-proposal-approval': 'implementation-proposal-approval',
  'code-edit': 'code-edit-approval',
  'code-edit-approval': 'code-edit-approval',
  'approval-recorded': 'approval-recorded',
  recorded: 'approval-recorded',
  completion: 'completion',
  completed: 'completion',
  blocked: 'blocked-error',
  error: 'blocked-error',
  'blocked-error': 'blocked-error',
  discovery: 'discovery',
})

export const MESSAGE_SIDE_EFFECT_FLAGS = Object.freeze({
  sent: false,
  sendTest: false,
  githubCalls: false,
  githubWrites: false,
  codeEdits: false,
  auditAppend: false,
  durableMutation: false,
  obsidianKanbanWrites: false,
})

export function sanitizeTelegramText(value, cap = 500) {
  let text = String(value ?? '').replace(/\u0000/g, '').replace(/idea_body\s*[:=]\s*[^\s\n\r]*/gi, 'idea_body=[OMITTED]')
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (...match) => (match[1] ? `${match[1]}[REDACTED]` : '[REDACTED]'))
  }
  text = text.replace(/\/root\/[^\s,;)]{40,}/g, '[long path hidden]')
  text = text.replace(/[\t ]+/g, ' ').replace(/\s+\n/g, '\n').trim()
  return text.length > cap ? `${text.slice(0, Math.max(0, cap - 1)).trim()}…` : text
}

export function normalizeTelegramMessageType(type) {
  const normalized = String(type || '').trim().toLowerCase()
  const mapped = TYPE_ALIASES[normalized]
  if (!mapped) throw new Error(`Unsupported Telegram message preview type: ${type}`)
  return mapped
}

export function shortAliasForTelegram(value, fallback = 'item1') {
  const id = String(value || '')
  if (!id) return fallback
  if (id === 'code_edit_build_impl_tg4_d3fd7da71ae557f3_8f61483465_d7420c166e_a033e3539084') return 'edit1'
  const explicit = id.match(/\b(edit\d+|app\d+|disc\d+|done\d+|blk\d+)\b/i)
  if (explicit) return explicit[1].toLowerCase()
  const hex = id.match(/([a-f0-9]{8})[a-f0-9]*$/i)
  if (hex) return hex[1].toLowerCase()
  const safe = id.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 8)
  return safe || fallback
}

function reportLine(reportPath) {
  return reportPath ? 'Details saved in report.' : null
}

function displayId(id, alias, verbose) {
  if (verbose && id) return `${alias} (${sanitizeTelegramText(id, 120)})`
  return alias
}

function truncateList(items, cap = 3) {
  return (Array.isArray(items) ? items : []).map((item) => sanitizeTelegramText(item, 80)).filter(Boolean).slice(0, cap)
}

function defaultsForType(type, input) {
  const alias = input.alias || input.short_alias || shortAliasForTelegram(input.approval_id || input.id, 'req1')
  const reportPath = input.report_path || input.reportPath || null
  const common = { alias, reportPath }
  switch (type) {
    case 'discovery':
      return {
        title: 'Discovery ready',
        what: `Found ${input.repo || input.selected_repo || 'a repo candidate'} for ${input.idea_title || input.ideaTitle || 'the idea'}.`,
        recommendation: input.recommendation || input.recommended_next_action || 'Review the report, then approve only if useful.',
        ifApprove: `Reply /approve ${alias} to allow the next read-only step.`,
        willNot: 'No clone, fork, GitHub write, code edit, audit append, or Obsidian/Kanban write.',
        reply: `Approve: /approve ${alias}\nReject: /reject ${alias}`,
        ...common,
      }
    case 'approval':
      return {
        title: 'Approval needed',
        what: `Request ${displayId(input.approval_id, alias, input.verbose)} is ready for ${input.action || input.recommended_next_action || 'the next step'}.`,
        recommendation: input.recommendation || 'Approve only if the scope looks right.',
        ifApprove: input.if_approve || 'I will do only the approved next step.',
        willNot: input.will_not || 'No GitHub writes, clone/fork/install, code edits, or durable mutation.',
        reply: `Approve: /approve ${alias}\nReject: /reject ${alias}`,
        ...common,
      }
    case 'implementation-proposal-approval':
      return {
        title: 'Implementation proposal ready',
        what: `Proposal ${displayId(input.proposal_id || input.approval_id, alias, input.verbose)} is ready for review.`,
        recommendation: input.recommendation || 'Approve only if you want a later build plan; this is not code approval.',
        ifApprove: `Reply /approve ${alias} to allow a build plan.`,
        willNot: 'No code edits, commands, installs, GitHub writes, audit append, or durable mutation.',
        reply: `Approve: /approve ${alias}\nReject: /reject ${alias}`,
        ...common,
      }
    case 'code-edit-approval':
      return {
        title: 'Code edit approval needed',
        what: `Edit packet ${displayId(input.code_edit_approval_id || input.approval_id, alias, input.verbose)} is ready. Files: ${truncateList(input.files || input.exact_files_allowed_to_edit, 2).join(', ') || 'exact approved files only'}.`,
        recommendation: input.recommendation || 'Approve only if these exact files are right.',
        ifApprove: `Reply /approve ${alias} to allow edits to the exact listed files.`,
        willNot: 'No extra files, staging, commit, GitHub call/write, audit append, or durable mutation.',
        reply: `Approve: /approve ${alias}\nReject: /reject ${alias}`,
        ...common,
      }
    case 'approval-recorded':
      return {
        title: 'Approval recorded',
        what: `${input.decision || 'Decision'} recorded for ${displayId(input.approval_id, alias, input.verbose)}.`,
        recommendation: input.decision === 'rejected' ? 'I will stop this path.' : 'Next worker may proceed only within the approved scope.',
        ifApprove: 'Already recorded. No extra reply needed.',
        willNot: 'Recording the reply did not run executor, edit code, call GitHub, or mutate durable store.',
        reply: 'No reply needed.',
        ...common,
      }
    case 'completion':
      return {
        title: 'Execution completed',
        what: `${input.status || 'Completed'} for ${displayId(input.execution_result_id || input.approval_id, alias, input.verbose)}.`,
        recommendation: input.recommendation || 'Review the result before approving any stage/commit/send step.',
        ifApprove: `Reply /approve ${alias} only if a follow-up approval request asks for it.`,
        willNot: 'No staging, commit, push, PR, GitHub write, audit append, or durable mutation happened here.',
        reply: input.reply || 'Reply with the next exact instruction if you want follow-up work.',
        ...common,
      }
    case 'blocked-error':
      return {
        title: 'Blocked',
        what: sanitizeTelegramText(input.reason || input.error || 'The task stopped safely.', 180),
        recommendation: input.recommendation || 'Fix the blocker or send a narrower approval.',
        ifApprove: 'Approval alone may not continue until the blocker is fixed.',
        willNot: 'No retry, code edit, GitHub call/write, audit append, durable mutation, or Obsidian/Kanban write.',
        reply: input.reply || 'Reply with corrected scope or say stop.',
        ...common,
      }
    default:
      throw new Error(`Unsupported Telegram message type: ${type}`)
  }
}

export function formatHumanTelegramMessage(input = {}) {
  const type = normalizeTelegramMessageType(input.type || 'discovery')
  const spec = defaultsForType(type, input)
  const lines = [
    sanitizeTelegramText(spec.title, 80),
    '',
    `What happened: ${sanitizeTelegramText(spec.what, 220)}`,
    `Recommendation: ${sanitizeTelegramText(spec.recommendation, 180)}`,
    `If you approve: ${sanitizeTelegramText(spec.ifApprove, 180)}`,
    `What will NOT happen: ${sanitizeTelegramText(spec.willNot, 220)}`,
  ]
  const report = reportLine(spec.reportPath)
  if (report) lines.push(report)
  lines.push(`Reply: ${sanitizeTelegramText(spec.reply, 180)}`)
  return lines.join('\n')
}

function sampleForType(type, verbose = false) {
  const samples = {
    discovery: {
      type,
      idea_title: 'Cleaner Telegram approval UX',
      repo: 'owner/repo',
      recommendation: 'learn_from',
      approval_id: 'tg4_1234567890abcdef',
      alias: '90abcdef',
      report_path: '/root/.hermes/reports/github-discovery/example-report.md',
      verbose,
    },
    approval: {
      type,
      approval_id: 'tg4_1234567890abcdef',
      alias: '90abcdef',
      action: 'learn_from',
      report_path: '/root/.hermes/reports/github-discovery/example-report.md',
      verbose,
    },
    'implementation-proposal-approval': {
      type,
      proposal_id: 'impl_tg4_1234567890abcdef_aaaabbbbcc',
      alias: 'aaaabbbb',
      report_path: '/root/.hermes/reports/github-discovery/proposals/example.md',
      verbose,
    },
    'code-edit-approval': {
      type,
      code_edit_approval_id: 'code_edit_build_impl_tg4_1234567890abcdef_longlonglong_aaaabbbbcccc',
      alias: 'edit1',
      exact_files_allowed_to_edit: ['scripts/telegram-message-format.mjs', 'bin/telegram-message-preview'],
      report_path: '/root/.hermes/reports/github-discovery/code-edit-approval-packets/example.md',
      verbose,
    },
    'approval-recorded': {
      type,
      approval_id: 'tg4_1234567890abcdef',
      alias: '90abcdef',
      decision: 'approved',
      verbose,
    },
    completion: {
      type,
      execution_result_id: 'exec_tg4_1234567890abcdef_aaaabbbbcccc',
      alias: 'done1',
      status: 'Completed',
      report_path: '/root/.hermes/reports/github-discovery/execution/example.md',
      verbose,
    },
    'blocked-error': {
      type,
      approval_id: 'tg4_1234567890abcdef',
      alias: 'blk1',
      reason: 'Exact edit scope is missing.',
      verbose,
    },
  }
  return samples[type]
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') args.json = true
    else if (arg === '--verbose') args.verbose = true
    else if (arg === '--send-test') args.sendTest = true
    else if (arg === '--type') args.type = argv[++i]
    else args._.push(arg)
  }
  return args
}

function requireJson(args) {
  if (!args.json) throw new Error('telegram-message-preview is intentionally JSON-only. Pass --json.')
}

export async function buildTelegramMessagePreview({ type, verbose = false, sendTest = false } = {}) {
  const normalizedType = normalizeTelegramMessageType(type)
  const sample = sampleForType(normalizedType, verbose)
  const message = formatHumanTelegramMessage(sample)
  return {
    ok: true,
    mode: 'telegram_message_preview',
    type: normalizedType,
    verbose,
    message,
    message_length: message.length,
    alias: sample.alias,
    approve_command: message.includes('/approve') ? `/approve ${sample.alias}` : null,
    reject_command: message.includes('/reject') ? `/reject ${sample.alias}` : null,
    full_ids_hidden: !verbose,
    raw_idea_body_included: false,
    secrets_included: false,
    report_path: sample.report_path || null,
    details_saved_in_report: Boolean(sample.report_path),
    ...MESSAGE_SIDE_EFFECT_FLAGS,
    sendTest: sendTest === true,
    note: sendTest ? 'Preview only in this CLI. Live test send is intentionally not implemented here.' : 'Preview only. No Telegram send.',
  }
}

export async function runTelegramMessagePreviewCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  requireJson(args)
  const result = await buildTelegramMessagePreview({ type: args.type, verbose: args.verbose === true, sendTest: args.sendTest === true })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runTelegramMessagePreviewCli().catch((error) => {
    const safe = {
      ok: false,
      blocked: true,
      error: sanitizeTelegramText(error?.message || error, 500),
      ...MESSAGE_SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    }
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`)
    process.exitCode = 1
  })
}
