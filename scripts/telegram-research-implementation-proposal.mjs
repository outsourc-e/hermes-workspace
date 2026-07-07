#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { formatHumanTelegramMessage, shortAliasForTelegram } from './telegram-message-format.mjs'

export const DEFAULT_EXECUTION_RESULTS_PATH =
  '/root/.hermes/reports/github-discovery/telegram-execution-results.jsonl'
export const DEFAULT_PROPOSAL_STATE_PATH =
  '/root/.hermes/reports/github-discovery/telegram-implementation-proposals.jsonl'
export const DEFAULT_PROPOSAL_REPORT_DIR =
  '/root/.hermes/reports/github-discovery/proposals'
export const APPROVAL_ID = 'tg4_d3fd7da71ae557f3'
export const SELECTED_REPO = 'CoWork-OS/CoWork-OS'
export const PRIOR_ACTION = 'learn_from'

export const SIDE_EFFECT_FLAGS = Object.freeze({
  executor: false,
  repoClone: false,
  fork: false,
  install: false,
  codeExecution: false,
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
    else if (arg === '--force') args.force = true
    else if (arg === '--send-telegram') args.sendTelegram = true
    else if (arg === '--approval-id') args.approvalId = argv[++i]
    else if (arg === '--results-path') args.resultsPath = argv[++i]
    else if (arg === '--proposals-path') args.proposalsPath = argv[++i]
    else if (arg === '--proposal-report-dir') args.proposalReportDir = argv[++i]
    else if (arg === '--research-report-path')
      args.researchReportPath = argv[++i]
    else if (arg === '--now') args.now = argv[++i]
    else args._.push(arg)
  }
  return args
}

function requireJson(args) {
  if (!args.json)
    throw new Error(
      'telegram-research-implementation-proposal is intentionally JSON-only. Pass --json.',
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

function block(reason, extra = {}) {
  return {
    ok: false,
    blocked: true,
    reason,
    executed: false,
    proposalWritten: false,
    reportWritten: false,
    ...SIDE_EFFECT_FLAGS,
    ...extra,
    note: 'Fail-closed. No proposal row or proposal report was written.',
  }
}

function safeIdPart(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_')
}

function proposalId(approvalId, sourceRepo) {
  return `impl_${safeIdPart(approvalId)}_${createHash('sha256').update(sourceRepo).digest('hex').slice(0, 10)}`
}

function safeReportName(proposalIdValue) {
  return `${safeIdPart(proposalIdValue)}.md`
}

function findResult(rows, approvalId) {
  return (
    rows.find(
      (row) => row?.approval_id === approvalId && row?.status === 'completed',
    ) || null
  )
}

function findProposal(rows, approvalId) {
  return rows.find((row) => row?.parent_approval_id === approvalId) || null
}

function expectedResearchPath(result) {
  return (
    result?.report_path ||
    `/root/.hermes/reports/github-discovery/research/${APPROVAL_ID}-CoWork-OS_CoWork-OS-research.md`
  )
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = markdown.match(
    new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |$)`, 'm'),
  )
  return sanitizeText(match?.[1]?.trim() || '', 3000)
}

function assertApprovedResult(result, approvalId) {
  if (!result)
    return block('EXECUTION_RESULT_NOT_FOUND', { approval_id: approvalId })
  if (result.selected_repo !== SELECTED_REPO)
    return block('SELECTED_REPO_MISMATCH', {
      approval_id: approvalId,
      selected_repo: result.selected_repo || null,
      expected_repo: SELECTED_REPO,
    })
  if (result.action !== PRIOR_ACTION)
    return block('ACTION_MISMATCH', {
      approval_id: approvalId,
      action: result.action || null,
      expected_action: PRIOR_ACTION,
    })
  if (
    result.github_writes !== false ||
    result.clone !== false ||
    result.fork !== false ||
    result.dependency_install !== false ||
    result.code_execution !== false
  ) {
    return block('UNSAFE_EXECUTION_RESULT_FLAGS', { approval_id: approvalId })
  }
  return null
}

function buildProposal({ approvalId, result, researchMarkdown, now }) {
  const id = proposalId(approvalId, SELECTED_REPO)
  const useful = extractSection(
    researchMarkdown,
    'Useful architecture/features',
  )
  const recommended = extractSection(
    researchMarkdown,
    'Recommended next step for Hermes',
  )
  const risks = extractSection(researchMarkdown, 'Risks/concerns')
  const manifests =
    result.repo?.manifests?.map((item) => item.name).filter(Boolean) || []
  const languages = result.repo?.languages || []
  const proposedScope = sanitizeText(
    [
      'Draft a local Hermes/LifeOS design note and thin prototype plan that adapts CoWork-OS product/workflow patterns without importing code.',
      'Focus on agent workspace/product-shape lessons: GUI-first workflow surfaces, CLI-capable local app shape, container/deployment notes, and TypeScript workspace structure.',
      recommended
        ? `Research recommendation: ${recommended.replace(/\s+/g, ' ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    1800,
  )
  const proposal = {
    proposal_id: id,
    parent_approval_id: approvalId,
    idea_title:
      'Adapt CoWork-OS workflow/product patterns into a local Hermes implementation design',
    source_repo: SELECTED_REPO,
    recommended_build_type: 'adapt_pattern',
    proposed_scope: proposedScope,
    files_or_modules_expected_to_touch: [
      'docs or reports/proposals design note only at approval stage',
      'future implementation may touch workspace/dashboard UX modules after separate approval',
      manifests.includes('package.json') || languages.includes('TypeScript')
        ? 'TypeScript workspace/dashboard patterns are likely relevant, exact files TBD after approval'
        : 'exact files TBD after approval',
    ],
    allowed_side_effects: [
      'Create this proposal row and proposal report only.',
      'No execution until a separate /approve command is received and a later implementation package is explicitly scoped.',
    ],
    forbidden_side_effects: [
      'executor run',
      'repo clone',
      'fork',
      'install/dependency install',
      'code execution from source repo',
      'GitHub writes or API mutations',
      'branch/PR/merge/delete',
      'audit append',
      'durable store mutation outside the proposal state file',
      'Obsidian or Kanban writes',
      'Telegram send unless --send-telegram is explicitly implemented/tested later',
    ],
    estimated_complexity: result.repo?.setup_complexity_estimate || 'medium',
    risks: [
      ...(risks
        ? risks
            .split(/\r?\n/)
            .map((line) => line.replace(/^-\s*/, '').trim())
            .filter(Boolean)
        : []),
      'CoWork-OS is a broad local AI app; scope can sprawl unless the next package stays design/prototype-only.',
      'License is MIT in research, but no source copy/import should occur without a separate code/license review.',
      'External credentials and environment-dependent features must stay excluded from the first implementation task.',
    ].map((item) => sanitizeText(item, 500)),
    acceptance_tests: [
      'Proposal/preview emits JSON with side-effect flags false.',
      'Next approved task produces a design/prototype artifact only, with no clone/fork/install/GitHub write path.',
      'Any future code package has explicit file scope, targeted tests, and rollback instructions before edits.',
      'Secrets, Telegram token, and chat identifiers are redacted from all output.',
    ],
    rollback_plan: [
      'Remove the single proposal JSONL row matching this proposal_id.',
      'Delete the single proposal report file matching this proposal_id.',
      'No repo, GitHub, audit, durable, Obsidian, Kanban, or Telegram rollback should be needed because those side effects are forbidden.',
    ],
    approval_command: `/approve ${id}`,
    reject_command: `/reject ${id}`,
    created_at: new Date(now).toISOString(),
    source_research_report_path: expectedResearchPath(result),
    source_research_report_hash: createHash('sha256')
      .update(researchMarkdown)
      .digest('hex'),
    source_execution_result_status: result.status,
    sanitized: true,
    preview_only: true,
    ...SIDE_EFFECT_FLAGS,
  }
  if (proposal.recommended_build_type !== 'adapt_pattern')
    throw new Error('Unsafe proposal build type.')
  if (
    /clone|fork|install|execute|run worker|github write/i.test(
      proposal.proposed_scope,
    ) &&
    !/without importing code|No execution/i.test(proposal.proposed_scope)
  ) {
    throw new Error('Unsafe proposal scope detected.')
  }
  return proposal
}

function buildProposalMarkdown(proposal, researchMarkdown) {
  const useful =
    extractSection(researchMarkdown, 'Useful architecture/features') ||
    '- No useful features extracted.'
  return sanitizeText(
    `# Telegram research implementation proposal

Proposal ID: ${proposal.proposal_id}
Parent approval ID: ${proposal.parent_approval_id}
Source repo: ${proposal.source_repo}
Recommended build type: ${proposal.recommended_build_type}
Created: ${proposal.created_at}
Preview only: true

## Idea title
${proposal.idea_title}

## Proposed scope
${proposal.proposed_scope}

## Research signals
${useful}

## Files/modules expected to touch
${proposal.files_or_modules_expected_to_touch.map((item) => `- ${item}`).join('\n')}

## Allowed side effects
${proposal.allowed_side_effects.map((item) => `- ${item}`).join('\n')}

## Forbidden side effects
${proposal.forbidden_side_effects.map((item) => `- ${item}`).join('\n')}

## Estimated complexity
${proposal.estimated_complexity}

## Risks
${proposal.risks.map((item) => `- ${item}`).join('\n')}

## Acceptance tests
${proposal.acceptance_tests.map((item) => `- ${item}`).join('\n')}

## Rollback plan
${proposal.rollback_plan.map((item) => `- ${item}`).join('\n')}

## Approval commands
- ${proposal.approval_command}
- ${proposal.reject_command}
`,
    20000,
  )
}

function validateSafeProposal(proposal) {
  const serialized = JSON.stringify(proposal)
  if (/gh[pousr]_|github_pat_|bot\d+:/i.test(serialized))
    return block('UNREDACTED_SECRET_DETECTED', {
      proposal_id: proposal.proposal_id,
    })
  if (/chat[_-]?id\s*[:=]/i.test(serialized))
    return block('UNREDACTED_CHAT_IDENTIFIER_DETECTED', {
      proposal_id: proposal.proposal_id,
    })
  const forbiddenTrue = Object.entries(SIDE_EFFECT_FLAGS)
    .filter(([key]) => proposal[key] !== false)
    .map(([key]) => key)
  if (forbiddenTrue.length)
    return block('UNSAFE_SIDE_EFFECT_FLAG', {
      proposal_id: proposal.proposal_id,
      flags: forbiddenTrue,
    })
  if (
    !['build_from_scratch', 'adapt_pattern', 'fork_later', 'no_build'].includes(
      proposal.recommended_build_type,
    )
  )
    return block('INVALID_BUILD_TYPE', { proposal_id: proposal.proposal_id })
  if (
    /\b(clone|fork|install|npm install|pnpm install|execute repo|run repo|github write|open pr|merge|delete branch)\b/i.test(
      proposal.proposed_scope,
    )
  )
    return block('UNSAFE_PROPOSAL_SCOPE', { proposal_id: proposal.proposal_id })
  return null
}

export async function runResearchImplementationProposal({
  approvalId,
  resultsPath = DEFAULT_EXECUTION_RESULTS_PATH,
  proposalsPath = DEFAULT_PROPOSAL_STATE_PATH,
  proposalReportDir = DEFAULT_PROPOSAL_REPORT_DIR,
  researchReportPath,
  dryRun = false,
  force = false,
  sendTelegram = false,
  now = new Date(),
} = {}) {
  if (!approvalId)
    throw new Error(
      'telegram-research-implementation-proposal requires --approval-id.',
    )
  if (approvalId !== APPROVAL_ID)
    return block('APPROVAL_ID_NOT_ALLOWED', {
      approval_id: approvalId,
      expected_approval_id: APPROVAL_ID,
    })
  if (sendTelegram)
    return block('TELEGRAM_SEND_NOT_IMPLEMENTED_FOR_THIS_PACKAGE', {
      approval_id: approvalId,
      telegramSent: false,
    })

  const [results, existingProposals] = await Promise.all([
    readJsonl(resultsPath),
    readJsonl(proposalsPath),
  ])
  const result = findResult(results, approvalId)
  const resultBlock = assertApprovedResult(result, approvalId)
  if (resultBlock) return resultBlock
  const existing = findProposal(existingProposals, approvalId)
  if (existing && !force)
    return block('PROPOSAL_EXISTS_DUPLICATE_BLOCKED', {
      approval_id: approvalId,
      proposal_id: existing.proposal_id || null,
    })

  const reportPath = researchReportPath || expectedResearchPath(result)
  let researchMarkdown
  try {
    researchMarkdown = sanitizeText(await readFile(reportPath, 'utf8'), 20000)
  } catch (error) {
    if (error?.code === 'ENOENT')
      return block('RESEARCH_REPORT_MISSING', {
        approval_id: approvalId,
        research_report_path: reportPath,
      })
    throw error
  }
  if (
    !researchMarkdown.includes(`Approval ID: ${approvalId}`) ||
    !researchMarkdown.includes(`Name: ${SELECTED_REPO}`)
  ) {
    return block('RESEARCH_REPORT_MISMATCH', {
      approval_id: approvalId,
      research_report_path: reportPath,
    })
  }

  const proposal = buildProposal({ approvalId, result, researchMarkdown, now })
  const unsafe = validateSafeProposal(proposal)
  if (unsafe) return unsafe
  const markdown = buildProposalMarkdown(proposal, researchMarkdown)
  const proposalReportPath = path.join(
    proposalReportDir,
    safeReportName(proposal.proposal_id),
  )
  const proposalRow = {
    ...proposal,
    proposal_report_path: proposalReportPath,
    proposal_report_hash: createHash('sha256').update(markdown).digest('hex'),
  }
  proposalRow.short_alias = shortAliasForTelegram(proposal.proposal_id, 'impl1')
  proposalRow.telegram_message_text = formatHumanTelegramMessage({
    type: 'implementation-proposal-approval',
    proposal_id: proposal.proposal_id,
    alias: proposalRow.short_alias,
    report_path: proposalReportPath,
  })

  const base = {
    ok: true,
    blocked: false,
    mode: dryRun
      ? 'implementation_proposal_dry_run'
      : 'implementation_proposal_write',
    approval_id: approvalId,
    proposal_id: proposal.proposal_id,
    dryRun,
    force,
    selected_repo: SELECTED_REPO,
    proposal_path: proposalsPath,
    proposal_report_path: proposalReportPath,
    proposal: proposalRow,
    executed: false,
    proposalWritten: false,
    reportWritten: false,
    ...SIDE_EFFECT_FLAGS,
    note: dryRun
      ? 'Dry-run only. Proposal generated in JSON; no proposal row or report written.'
      : 'Proposal generated and ready for explicit approval. No executor or external side effects were run.',
  }
  if (dryRun) return base

  await mkdir(proposalReportDir, { recursive: true })
  await writeFile(proposalReportPath, markdown, 'utf8')
  await appendJsonl(proposalsPath, proposalRow)
  return { ...base, proposalWritten: true, reportWritten: true }
}

export async function runResearchImplementationProposalCli(
  argv = process.argv.slice(2),
) {
  const args = parseArgs(argv)
  requireJson(args)
  const result = await runResearchImplementationProposal({
    approvalId: args.approvalId,
    resultsPath: args.resultsPath || DEFAULT_EXECUTION_RESULTS_PATH,
    proposalsPath: args.proposalsPath || DEFAULT_PROPOSAL_STATE_PATH,
    proposalReportDir: args.proposalReportDir || DEFAULT_PROPOSAL_REPORT_DIR,
    researchReportPath: args.researchReportPath,
    dryRun: args.dryRun === true,
    force: args.force === true,
    sendTelegram: args.sendTelegram === true,
    now: args.now ? new Date(args.now) : new Date(),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runResearchImplementationProposalCli().catch((error) => {
    const safe = {
      ok: false,
      blocked: true,
      error: sanitizeText(error?.message || error, 500),
      executed: false,
      proposalWritten: false,
      reportWritten: false,
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    }
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`)
    process.exitCode = 1
  })
}
