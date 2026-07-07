#!/usr/bin/env node
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDiscoveryNotificationPreview, hashReportContent } from './telegram-discovery-notification.mjs';

export const DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH = '/root/.hermes/reports/github-discovery/telegram-approval-requests.jsonl';
export const DEFAULT_TELEGRAM_APPROVAL_DECISIONS_PATH = '/root/.hermes/reports/github-discovery/telegram-approval-decisions.jsonl';
export const DEFAULT_TELEGRAM_EXECUTION_PLANS_PATH = '/root/.hermes/reports/github-discovery/telegram-execution-plans.jsonl';
export const DEFAULT_DISCOVERY_INDEX_PATH = '/root/.hermes/reports/github-discovery/index.jsonl';

export const SIDE_EFFECT_FLAGS = Object.freeze({
  telegramSend: false,
  githubWrites: false,
  githubCalls: false,
  clone: false,
  fork: false,
  dependencyInstall: false,
  codeExecution: false,
  repoCreation: false,
  branchPush: false,
  prOpen: false,
  merge: false,
  delete: false,
  auditAppend: false,
  durableMutation: false,
  obsidianKanbanWrites: false,
});

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--write-plan') args.writePlan = true;
    else if (arg === '--approval-id') args.approvalId = argv[++i];
    else if (arg === '--requests-path') args.requestsPath = argv[++i];
    else if (arg === '--decisions-path') args.decisionsPath = argv[++i];
    else if (arg === '--plans-path') args.plansPath = argv[++i];
    else if (arg === '--index-path') args.indexPath = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else args._.push(arg);
  }
  return args;
}

function requireJson(args) {
  if (!args.json) throw new Error('telegram-approved-discovery-executor is intentionally JSON-only. Pass --json.');
}

async function readJsonl(pathname) {
  try {
    const content = await readFile(pathname, 'utf8');
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendJsonl(pathname, row) {
  await mkdir(path.dirname(pathname), { recursive: true });
  await appendFile(pathname, `${JSON.stringify(row)}\n`, 'utf8');
}

function block(reason, extra = {}) {
  return {
    ok: false,
    blocked: true,
    reason,
    executed: false,
    planCreated: false,
    planWritten: false,
    ...SIDE_EFFECT_FLAGS,
    ...extra,
    note: 'No execution plan was written and no action executed.',
  };
}

function expiryValue(request) {
  return request?.expires_at || request?.expiry_time || null;
}

function isExpired(request, now) {
  const expiresAt = expiryValue(request);
  if (!expiresAt) return true;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return true;
  return expiryMs <= new Date(now).getTime();
}

function selectedRepoName(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.full_name || value.name || null;
  return null;
}

function normalizeAction(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function findRequest(rows, approvalId) {
  return rows.find((row) => row?.approval_id === approvalId && row?.status === 'requested') || null;
}

function findDecision(rows, approvalId) {
  return rows.find((row) => row?.approval_id === approvalId && (row?.status === 'approved' || row?.status === 'rejected' || row?.decision === 'approved' || row?.decision === 'rejected')) || null;
}

function existingExecution(rows, approvalId) {
  return rows.find((row) => row?.approval_id === approvalId && row?.status === 'planned') || null;
}

function reportCandidateMatches(reportPreview, expectedRepo, expectedAction) {
  const candidates = Array.isArray(reportPreview?.report?.topCandidates) ? reportPreview.report.topCandidates : [];
  return candidates.some((candidate) => selectedRepoName(candidate) === expectedRepo && normalizeAction(candidate.recommendation || expectedAction) === expectedAction);
}

function safeReadOnlyStepsForLearnFrom(repo) {
  return [
    { id: 'fetch_public_repo_metadata', action: 'fetch public repo metadata', method: 'read_public_github_metadata_only', target: repo, writes: false },
    { id: 'fetch_readme_metadata_or_summary', action: 'fetch README metadata or summary', method: 'read_public_readme_only', target: repo, writes: false },
    { id: 'inspect_license_metadata', action: 'inspect license metadata', method: 'read_public_license_metadata_only', target: repo, writes: false },
    { id: 'inspect_package_manifest_metadata', action: 'inspect package/manifest metadata', method: 'read_public_manifest_metadata_only', target: repo, writes: false },
    { id: 'produce_implementation_notes', action: 'produce implementation notes', method: 'derive_notes_from_read_only_metadata', target: repo, writes: false },
    { id: 'produce_next_action_recommendation', action: 'produce next-action recommendation', method: 'recommend_follow_up_without_side_effects', target: repo, writes: false },
  ];
}

export function buildExecutionPlan({ approvalId, request, decision, reportHash, dryRun = true, now = new Date() }) {
  const selectedRepo = selectedRepoName(decision.selected_repo) || selectedRepoName(request.selected_repo);
  const recommendedNextAction = normalizeAction(decision.recommended_next_action || request.recommended_next_action);
  if (recommendedNextAction !== 'learn_from') throw new Error(`Unsupported approved discovery action: ${recommendedNextAction}`);
  return {
    approval_id: approvalId,
    status: 'planned',
    dry_run: dryRun,
    executed: false,
    plan_only: true,
    created_at: new Date(now).toISOString(),
    report_path: path.resolve(request.report_path),
    report_hash: reportHash,
    selected_repo: selectedRepo,
    recommended_next_action: recommendedNextAction,
    plan_type: 'learn_from_read_only_research',
    steps: safeReadOnlyStepsForLearnFrom(selectedRepo),
    forbidden_side_effects: [
      'Telegram send',
      'GitHub write',
      'clone',
      'fork',
      'dependency install',
      'code execution',
      'repo creation',
      'branch push',
      'PR open',
      'merge',
      'delete',
      'audit append',
      'durable mutation',
      'Obsidian/Kanban write',
    ],
    sanitized: true,
  };
}

export async function createApprovedDiscoveryExecutionPlan({
  approvalId,
  requestsPath = DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH,
  decisionsPath = DEFAULT_TELEGRAM_APPROVAL_DECISIONS_PATH,
  plansPath = DEFAULT_TELEGRAM_EXECUTION_PLANS_PATH,
  indexPath = DEFAULT_DISCOVERY_INDEX_PATH,
  dryRun = false,
  writePlan = false,
  now = new Date(),
} = {}) {
  if (!approvalId) throw new Error('telegram-approved-discovery-executor requires --approval-id.');
  if (!dryRun && !writePlan) throw new Error('telegram-approved-discovery-executor is plan/dry-run only. Pass --dry-run or --write-plan.');

  const [requestRows, decisionRows, existingPlanRows] = await Promise.all([
    readJsonl(requestsPath),
    readJsonl(decisionsPath),
    readJsonl(plansPath),
  ]);
  const request = findRequest(requestRows, approvalId);
  if (!request) return block('UNKNOWN_APPROVAL_ID', { approval_id: approvalId });
  const decision = findDecision(decisionRows, approvalId);
  if (!decision) return block('MISSING_APPROVED_DECISION', { approval_id: approvalId });
  if ((decision.decision || decision.status) !== 'approved') return block('DECISION_NOT_APPROVED', { approval_id: approvalId, decision: decision.decision || decision.status });
  if (isExpired(request, now)) return block('EXPIRED_APPROVAL_ID', { approval_id: approvalId, expires_at: expiryValue(request) });
  if (existingExecution(existingPlanRows, approvalId)) return block('EXECUTION_RECORD_EXISTS', { approval_id: approvalId });

  const requestRepo = selectedRepoName(request.selected_repo);
  const decisionRepo = selectedRepoName(decision.selected_repo);
  const requestAction = normalizeAction(request.recommended_next_action);
  const decisionAction = normalizeAction(decision.recommended_next_action);
  if (!requestRepo || !decisionRepo || requestRepo !== decisionRepo || requestAction !== decisionAction) {
    return block('DECISION_REQUEST_MISMATCH', { approval_id: approvalId, request_selected_repo: requestRepo, decision_selected_repo: decisionRepo, request_action: requestAction, decision_action: decisionAction });
  }

  const reportPath = request.report_path || decision.report_path;
  if (!reportPath) return block('MISSING_DISCOVERY_REPORT_PATH', { approval_id: approvalId });
  const resolvedReportPath = path.resolve(reportPath);
  const reportContent = await readFile(resolvedReportPath, 'utf8');
  const reportHash = hashReportContent(reportContent);
  if ((request.report_hash && request.report_hash !== reportHash) || (decision.report_hash && decision.report_hash !== reportHash)) {
    return block('REPORT_HASH_MISMATCH', { approval_id: approvalId, report_path: resolvedReportPath });
  }

  const reportPreview = await buildDiscoveryNotificationPreview({ reportPath: resolvedReportPath, indexPath });
  if (!reportCandidateMatches(reportPreview, requestRepo, requestAction)) {
    return block('REQUEST_REPORT_MISMATCH', { approval_id: approvalId, selected_repo: requestRepo, recommended_next_action: requestAction });
  }

  const plan = buildExecutionPlan({ approvalId, request: { ...request, report_path: resolvedReportPath }, decision, reportHash, dryRun, now });
  if (writePlan) await appendJsonl(plansPath, plan);
  return {
    ok: true,
    blocked: false,
    mode: writePlan ? 'telegram_approved_discovery_executor_write_plan' : 'telegram_approved_discovery_executor_dry_run',
    approval_id: approvalId,
    dryRun,
    writePlan,
    executed: false,
    planCreated: true,
    planWritten: writePlan,
    plans_path: plansPath,
    plan,
    ...SIDE_EFFECT_FLAGS,
    note: writePlan ? 'Wrote one sanitized execution plan row only. Plan was not executed.' : 'Dry-run only. No writes and no execution.',
  };
}

export async function runTelegramApprovedDiscoveryExecutorCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  requireJson(args);
  const result = await createApprovedDiscoveryExecutionPlan({
    approvalId: args.approvalId,
    requestsPath: args.requestsPath || DEFAULT_TELEGRAM_APPROVAL_REQUESTS_PATH,
    decisionsPath: args.decisionsPath || DEFAULT_TELEGRAM_APPROVAL_DECISIONS_PATH,
    plansPath: args.plansPath || DEFAULT_TELEGRAM_EXECUTION_PLANS_PATH,
    indexPath: args.indexPath || DEFAULT_DISCOVERY_INDEX_PATH,
    dryRun: args.dryRun === true,
    writePlan: args.writePlan === true,
    now: args.now ? new Date(args.now) : new Date(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runTelegramApprovedDiscoveryExecutorCli().catch((error) => {
    const safe = {
      ok: false,
      blocked: true,
      error: String(error?.message || error).replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]'),
      executed: false,
      planWritten: false,
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    };
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
    process.exitCode = 1;
  });
}
