#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_PROPOSALS_PATH =
  '/root/.hermes/reports/github-discovery/telegram-implementation-proposals.jsonl'
export const DEFAULT_APPROVAL_DECISIONS_PATH =
  '/root/.hermes/reports/github-discovery/telegram-approval-decisions.jsonl'
export const DEFAULT_BUILD_PLANS_PATH =
  '/root/.hermes/reports/github-discovery/telegram-build-plans.jsonl'
export const DEFAULT_BUILD_PLAN_REPORT_DIR =
  '/root/.hermes/reports/github-discovery/build-plans'
export const APPROVED_PROPOSAL_ID = 'impl_tg4_d3fd7da71ae557f3_8f61483465'
export const PARENT_APPROVAL_ID = 'tg4_d3fd7da71ae557f3'

export const SIDE_EFFECT_FLAGS = Object.freeze({
  planOnly: true,
  codeEdits: false,
  fileWritesOutsideBuildPlanState: false,
  githubWrites: false,
  githubCalls: false,
  clone: false,
  fork: false,
  install: false,
  commandExecution: false,
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
    else if (arg === '--proposal-id') args.proposalId = argv[++i]
    else if (arg === '--target-workspace') args.targetWorkspace = argv[++i]
    else if (arg === '--proposals-path') args.proposalsPath = argv[++i]
    else if (arg === '--approval-decisions-path') args.approvalDecisionsPath = argv[++i]
    else if (arg === '--build-plans-path') args.buildPlansPath = argv[++i]
    else if (arg === '--build-plan-report-dir') args.buildPlanReportDir = argv[++i]
    else if (arg === '--now') args.now = argv[++i]
    else args._.push(arg)
  }
  return args
}

function requireJson(args) {
  if (!args.json)
    throw new Error(
      'telegram-approved-implementation-build-plan is intentionally JSON-only. Pass --json.',
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

function buildPlanId(proposalId, targetWorkspace) {
  const hash = createHash('sha256')
    .update(`${proposalId}\n${targetWorkspace}`)
    .digest('hex')
    .slice(0, 10)
  return `build_${safeIdPart(proposalId)}_${hash}`
}

function safeReportName(buildPlanIdValue) {
  return `${safeIdPart(buildPlanIdValue)}.md`
}

function block(reason, extra = {}) {
  return {
    ok: false,
    blocked: true,
    reason,
    executed: false,
    buildPlanWritten: false,
    reportWritten: false,
    ...SIDE_EFFECT_FLAGS,
    ...extra,
    note: 'Fail-closed. No build plan row or report was written.',
  }
}

function findProposal(rows, proposalId) {
  return rows.find((row) => row?.proposal_id === proposalId) || null
}

function findApprovedDecision(rows, proposalId) {
  return (
    rows.find(
      (row) =>
        row?.approval_id === proposalId &&
        row?.decision === 'approved' &&
        row?.status === 'approved',
    ) || null
  )
}

function findParentDecision(rows, parentApprovalId) {
  return (
    rows.find(
      (row) =>
        row?.approval_id === parentApprovalId &&
        row?.decision === 'approved' &&
        row?.status === 'approved',
    ) || null
  )
}

function findExistingPlan(rows, proposalId) {
  return rows.find((row) => row?.proposal_id === proposalId) || null
}

async function directoryExists(pathname) {
  try {
    const info = await stat(pathname)
    return info.isDirectory()
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false
    throw error
  }
}

async function findRepoRootCandidate(start = process.cwd()) {
  let current = path.resolve(start)
  while (true) {
    if (await directoryExists(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

async function likelyWorkspaceCandidates() {
  const candidates = []
  const addCandidate = async (candidate) => {
    if (!candidate) return
    const resolved = path.resolve(candidate)
    if (!path.isAbsolute(resolved)) return
    if (!(await directoryExists(resolved))) return
    if (!candidates.includes(resolved)) candidates.push(resolved)
  }

  const repoRoot = await findRepoRootCandidate()
  await addCandidate(repoRoot)
  await addCandidate(process.cwd())

  const workspaceParent = process.env.HERMES_WORKSPACE_PARENT
  if (workspaceParent && (await directoryExists(workspaceParent))) {
    const entries = await readdir(workspaceParent, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) await addCandidate(path.join(workspaceParent, entry.name))
    }
  }

  return candidates
}

function validateProposalSafety(proposal) {
  const unsafeScope = /\b(clone|fork|install|npm install|pnpm install|execute repo|run repo|github write|open pr|merge|delete branch|push)\b/i
  const scope = proposal?.proposed_scope || ''
  if (unsafeScope.test(scope) && !/without importing code|No execution|do not import code/i.test(scope)) {
    return block('UNSAFE_FILE_SCOPE_BLOCKED', { proposal_id: proposal?.proposal_id || null })
  }
  const expectedFiles = proposal?.files_or_modules_expected_to_touch || []
  if (!Array.isArray(expectedFiles))
    return block('UNSAFE_FILE_SCOPE_BLOCKED', { proposal_id: proposal?.proposal_id || null })
  if (
    expectedFiles.some((item) =>
      /(^|\/)(\.env|\.git|node_modules|\.ssh)(\/|$)|token|secret|password|credential/i.test(
        String(item),
      ),
    )
  ) {
    return block('UNSAFE_FILE_SCOPE_BLOCKED', { proposal_id: proposal?.proposal_id || null })
  }
  return null
}

function buildPlan({ proposal, targetWorkspace, now }) {
  const id = buildPlanId(proposal.proposal_id, targetWorkspace)
  const expectedFiles = [
    'docs/github-discovery/cowork-os-pattern-adaptation.md',
    'docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
  ]
  const plan = {
    build_plan_id: id,
    proposal_id: proposal.proposal_id,
    parent_approval_id: proposal.parent_approval_id,
    recommended_build_type: proposal.recommended_build_type,
    target_repo_or_workspace: targetWorkspace,
    expected_files_to_touch: expectedFiles,
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
    implementation_steps: [
      'Preflight: confirm clean staged index for the two approved docs paths only and inspect current docs folder shape.',
      'Create a concise design note summarising CoWork-OS patterns relevant to Hermes/LifeOS without copying source code.',
      'Create a companion test-plan note describing future validation gates for any later UX/prototype implementation.',
      'Run formatting/spell-safe checks that do not install dependencies or touch runtime state.',
      'Run repository status checks scoped to the two expected docs paths and confirm forbidden paths are untouched.',
      'Stop for final code edit approval before any implementation, prototype, dashboard, route, service, or dependency edits.',
    ],
    tests_to_run: [
      'git diff --check -- docs/github-discovery/cowork-os-pattern-adaptation.md docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
      'git status --short -- docs/github-discovery/cowork-os-pattern-adaptation.md docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md',
      'static scan: no token/chat_id/API key/password strings in the two generated docs',
      'static scan: no source-code import/copy instructions from CoWork-OS in the design note',
    ],
    acceptance_criteria: [
      'Only the two expected docs paths are created or modified.',
      'No CoWork-OS source code is copied, cloned, forked, installed, executed, or vendored.',
      'The design note is actionable for Hermes/LifeOS and explicitly marks implementation as a later approval-gated stage.',
      'The test-plan note lists concrete future checks without running them in this package.',
      'GitHub writes, audit append, durable mutation, Obsidian/Kanban writes, Telegram sends, branch/PR/merge/delete, clone/fork/install/run all remain false.',
    ],
    rollback_plan: [
      'Delete docs/github-discovery/cowork-os-pattern-adaptation.md if created by the approved edit package.',
      'Delete docs/github-discovery/cowork-os-pattern-adaptation.test-plan.md if created by the approved edit package.',
      'Remove the matching build plan row and report only if explicitly rolling back this plan metadata.',
      'No external service rollback should be needed because the build is local docs-only and side-effect-gated.',
    ],
    risk_level: 'low',
    requires_final_code_edit_approval: true,
    approval_command: `/approve ${id}`,
    reject_command: `/reject ${id}`,
    created_at: new Date(now).toISOString(),
    source_repo: sanitizeText(proposal.source_repo || '', 500) || null,
    source_proposal_report_path: sanitizeText(
      proposal.proposal_report_path || '',
      1000,
    ) || null,
    sanitized: true,
    ...SIDE_EFFECT_FLAGS,
  }
  return plan
}

function validateBuildPlan(plan) {
  const serialized = JSON.stringify(plan)
  if (/gh[pousr]_|github_pat_|bot\d+:/i.test(serialized))
    return block('UNREDACTED_SECRET_DETECTED', { build_plan_id: plan.build_plan_id })
  if (/chat[_-]?id\s*[:=]/i.test(serialized))
    return block('UNREDACTED_CHAT_IDENTIFIER_DETECTED', {
      build_plan_id: plan.build_plan_id,
    })
  if (plan.requires_final_code_edit_approval !== true)
    return block('FINAL_CODE_EDIT_APPROVAL_GATE_MISSING', {
      build_plan_id: plan.build_plan_id,
    })
  if (
    !Array.isArray(plan.expected_files_to_touch) ||
    plan.expected_files_to_touch.length === 0 ||
    plan.expected_files_to_touch.some((item) =>
      /(^|\/)(\.env|\.git|node_modules|\.ssh)(\/|$)|token|secret|password|credential/i.test(
        String(item),
      ),
    )
  ) {
    return block('UNSAFE_FILE_SCOPE_BLOCKED', { build_plan_id: plan.build_plan_id })
  }
  return null
}

function buildPlanMarkdown(plan) {
  return sanitizeText(
    `# Telegram approved implementation build plan

Build plan ID: ${plan.build_plan_id}
Proposal ID: ${plan.proposal_id}
Parent approval ID: ${plan.parent_approval_id}
Recommended build type: ${plan.recommended_build_type}
Target repo/workspace: ${plan.target_repo_or_workspace}
Risk level: ${plan.risk_level}
Requires final code edit approval: true

## Expected files to touch
${plan.expected_files_to_touch.map((item) => `- ${item}`).join('\n')}

## Forbidden files or paths
${plan.forbidden_files_or_paths.map((item) => `- ${item}`).join('\n')}

## Implementation steps
${plan.implementation_steps.map((item) => `- ${item}`).join('\n')}

## Tests to run
${plan.tests_to_run.map((item) => `- ${item}`).join('\n')}

## Acceptance criteria
${plan.acceptance_criteria.map((item) => `- ${item}`).join('\n')}

## Rollback plan
${plan.rollback_plan.map((item) => `- ${item}`).join('\n')}

## Approval commands
- ${plan.approval_command}
- ${plan.reject_command}
`,
    20000,
  )
}

export async function runApprovedImplementationBuildPlan({
  proposalId,
  targetWorkspace,
  proposalsPath = DEFAULT_PROPOSALS_PATH,
  approvalDecisionsPath = DEFAULT_APPROVAL_DECISIONS_PATH,
  buildPlansPath = DEFAULT_BUILD_PLANS_PATH,
  buildPlanReportDir = DEFAULT_BUILD_PLAN_REPORT_DIR,
  dryRun = false,
  sendTelegram = false,
  now = new Date(),
} = {}) {
  if (!proposalId)
    throw new Error(
      'telegram-approved-implementation-build-plan requires --proposal-id.',
    )
  if (sendTelegram)
    return block('TELEGRAM_SEND_NOT_IMPLEMENTED_FOR_THIS_PACKAGE', {
      proposal_id: proposalId,
      telegramSent: false,
    })

  const [proposals, decisions, existingPlans] = await Promise.all([
    readJsonl(proposalsPath),
    readJsonl(approvalDecisionsPath),
    readJsonl(buildPlansPath),
  ])
  const proposal = findProposal(proposals, proposalId)
  if (!proposal) return block('PROPOSAL_NOT_FOUND', { proposal_id: proposalId })
  if (proposalId !== APPROVED_PROPOSAL_ID)
    return block('PROPOSAL_NOT_ALLOWED_FOR_THIS_PACKAGE', {
      proposal_id: proposalId,
      expected_proposal_id: APPROVED_PROPOSAL_ID,
    })
  const approvalDecision = findApprovedDecision(decisions, proposalId)
  if (!approvalDecision)
    return block('PROPOSAL_NOT_APPROVED', { proposal_id: proposalId })
  const parentDecision = findParentDecision(decisions, proposal.parent_approval_id)
  if (!parentDecision)
    return block('PARENT_APPROVAL_NOT_APPROVED', {
      proposal_id: proposalId,
      parent_approval_id: proposal.parent_approval_id || null,
    })
  if (proposal.parent_approval_id !== PARENT_APPROVAL_ID)
    return block('PARENT_APPROVAL_MISMATCH', {
      proposal_id: proposalId,
      parent_approval_id: proposal.parent_approval_id || null,
      expected_parent_approval_id: PARENT_APPROVAL_ID,
    })
  const existing = findExistingPlan(existingPlans, proposalId)
  if (existing)
    return block('BUILD_PLAN_EXISTS_DUPLICATE_BLOCKED', {
      proposal_id: proposalId,
      build_plan_id: existing.build_plan_id || null,
    })
  const proposalUnsafe = validateProposalSafety(proposal)
  if (proposalUnsafe) return proposalUnsafe

  const candidates = await likelyWorkspaceCandidates()
  if (!targetWorkspace) {
    return block('BLOCKED_TARGET_WORKSPACE_REQUIRED', {
      proposal_id: proposalId,
      parent_approval_id: proposal.parent_approval_id,
      required_field: '--target-workspace <absolute repo/workspace path>',
      likely_candidates: candidates,
      message:
        'Target repo/workspace is unknown. Provide the exact workspace/repo path; candidates are reported but not selected automatically.',
    })
  }
  if (!path.isAbsolute(targetWorkspace))
    return block('TARGET_WORKSPACE_MUST_BE_ABSOLUTE', {
      proposal_id: proposalId,
      target_repo_or_workspace: targetWorkspace,
    })
  if (!(await pathExists(targetWorkspace)))
    return block('TARGET_WORKSPACE_NOT_FOUND', {
      proposal_id: proposalId,
      target_repo_or_workspace: targetWorkspace,
    })

  const plan = buildPlan({ proposal, targetWorkspace, now })
  const unsafe = validateBuildPlan(plan)
  if (unsafe) return unsafe
  const markdown = buildPlanMarkdown(plan)
  const buildPlanReportPath = path.join(
    buildPlanReportDir,
    safeReportName(plan.build_plan_id),
  )
  const row = {
    ...plan,
    build_plan_report_path: buildPlanReportPath,
    build_plan_report_hash: createHash('sha256').update(markdown).digest('hex'),
  }
  const base = {
    ok: true,
    blocked: false,
    mode: dryRun ? 'build_plan_dry_run' : 'build_plan_write',
    proposal_id: proposalId,
    parent_approval_id: proposal.parent_approval_id,
    build_plan_id: plan.build_plan_id,
    dryRun,
    build_plans_path: buildPlansPath,
    build_plan_report_path: buildPlanReportPath,
    build_plan: row,
    executed: false,
    buildPlanWritten: false,
    reportWritten: false,
    ...SIDE_EFFECT_FLAGS,
    note: dryRun
      ? 'Dry-run only. Build plan generated in JSON; no build plan row or report written.'
      : 'Build plan written only. Final code edit approval is still required before implementation.',
  }
  if (dryRun) return base

  await mkdir(buildPlanReportDir, { recursive: true })
  await writeFile(buildPlanReportPath, markdown, 'utf8')
  await appendJsonl(buildPlansPath, row)
  return { ...base, buildPlanWritten: true, reportWritten: true }
}

export async function runApprovedImplementationBuildPlanCli(
  argv = process.argv.slice(2),
) {
  const args = parseArgs(argv)
  requireJson(args)
  const result = await runApprovedImplementationBuildPlan({
    proposalId: args.proposalId,
    targetWorkspace: args.targetWorkspace,
    proposalsPath: args.proposalsPath || DEFAULT_PROPOSALS_PATH,
    approvalDecisionsPath:
      args.approvalDecisionsPath || DEFAULT_APPROVAL_DECISIONS_PATH,
    buildPlansPath: args.buildPlansPath || DEFAULT_BUILD_PLANS_PATH,
    buildPlanReportDir: args.buildPlanReportDir || DEFAULT_BUILD_PLAN_REPORT_DIR,
    dryRun: args.dryRun === true,
    sendTelegram: args.sendTelegram === true,
    now: args.now ? new Date(args.now) : new Date(),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runApprovedImplementationBuildPlanCli().catch((error) => {
    const safe = {
      ok: false,
      blocked: true,
      error: sanitizeText(error?.message || error, 500),
      executed: false,
      buildPlanWritten: false,
      reportWritten: false,
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    }
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`)
    process.exitCode = 1
  })
}
