import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApprovedDiscoveryExecutionPlan } from './telegram-approved-discovery-executor.mjs';

const APPROVAL_ID = 'tg4_d3fd7da71ae557f3';
const SECRET_TOKEN = '123456:SUPER_SECRET_TOKEN';
const CHAT_ID = '987654321';

async function exists(pathname) {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function discoveryReport(repo = 'CoWork-OS/CoWork-OS', action = 'learn_from') {
  return `# GitHub discovery report: File/document assistant summary starter\n\nRecommendation: ${action}\n\n### 1. ${repo}\n- URL: https://github.com/${repo}\n- Recommendation: ${action}\n- Score: 91\n- Stars: 123\n`;
}

async function fixture({
  decision = 'approved',
  requestRepo = 'CoWork-OS/CoWork-OS',
  decisionRepo = 'CoWork-OS/CoWork-OS',
  requestAction = 'learn_from',
  decisionAction = 'learn_from',
  reportRepo = 'CoWork-OS/CoWork-OS',
  reportAction = 'learn_from',
  expiresAt = '2026-07-05T10:00:00.000Z',
  existingExecution = false,
  includeRequest = true,
} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-approved-executor-'));
  const reportPath = path.join(dir, 'report.md');
  const indexPath = path.join(dir, 'index.jsonl');
  const requestsPath = path.join(dir, 'telegram-approval-requests.jsonl');
  const decisionsPath = path.join(dir, 'telegram-approval-decisions.jsonl');
  const plansPath = path.join(dir, 'telegram-execution-plans.jsonl');
  await writeFile(reportPath, discoveryReport(reportRepo, reportAction), 'utf8');
  const { createHash } = await import('node:crypto');
  const reportHash = createHash('sha256').update(await readFile(reportPath, 'utf8')).digest('hex');
  await writeFile(indexPath, `${JSON.stringify({
    report_path: reportPath,
    report_hash: reportHash,
    idea_title: 'File/document assistant summary starter',
    recommendation: reportAction,
    top_candidate_summaries: [{ full_name: reportRepo, html_url: `https://github.com/${reportRepo}`, recommendation: reportAction, score: 91, stars: 123 }],
    indexed_at: '2026-07-05T08:00:00.000Z',
    sanitized: true,
  })}\n`, 'utf8');
  if (includeRequest) {
    await writeFile(requestsPath, `${JSON.stringify({
      approval_id: APPROVAL_ID,
      report_path: reportPath,
      report_hash: reportHash,
      sent_at: '2026-07-05T08:00:00.000Z',
      expires_at: expiresAt,
      selected_repo: requestRepo,
      recommended_next_action: requestAction,
      message_id: 77,
      status: 'requested',
    })}\n`, 'utf8');
  }
  await writeFile(decisionsPath, `${JSON.stringify({
    approval_id: APPROVAL_ID,
    decision,
    decided_at: '2026-07-05T08:10:00.000Z',
    report_path: reportPath,
    report_hash: reportHash,
    selected_repo: decisionRepo,
    recommended_next_action: decisionAction,
    telegram_update_id: 1,
    telegram_message_id: 2,
    telegram_chat_verified: true,
    status: decision,
    sanitized: true,
  })}\n`, 'utf8');
  if (existingExecution) {
    await writeFile(plansPath, `${JSON.stringify({ approval_id: APPROVAL_ID, status: 'planned', sanitized: true })}\n`, 'utf8');
  }
  return { dir, reportPath, indexPath, requestsPath, decisionsPath, plansPath };
}

async function run(f, extra = {}) {
  return createApprovedDiscoveryExecutionPlan({
    approvalId: extra.approvalId || APPROVAL_ID,
    requestsPath: f.requestsPath,
    decisionsPath: f.decisionsPath,
    plansPath: f.plansPath,
    indexPath: f.indexPath,
    dryRun: true,
    now: new Date('2026-07-05T09:00:00.000Z'),
    ...extra,
  });
}

describe('telegram approved discovery executor dry-run planner', () => {
  it('approved learn_from decision produces a safe read-only plan', async () => {
    const f = await fixture();
    const result = await run(f);
    expect(result.ok).toBe(true);
    expect(result.executed).toBe(false);
    expect(result.planWritten).toBe(false);
    expect(result.plan.selected_repo).toBe('CoWork-OS/CoWork-OS');
    expect(result.plan.recommended_next_action).toBe('learn_from');
    expect(result.plan.steps.map((step) => step.id)).toEqual([
      'fetch_public_repo_metadata',
      'fetch_readme_metadata_or_summary',
      'inspect_license_metadata',
      'inspect_package_manifest_metadata',
      'produce_implementation_notes',
      'produce_next_action_recommendation',
    ]);
    expect(result.plan.steps.every((step) => step.writes === false)).toBe(true);
    expect(result.telegramSend).toBe(false);
    expect(result.githubWrites).toBe(false);
    expect(result.clone).toBe(false);
    expect(result.fork).toBe(false);
    expect(result.auditAppend).toBe(false);
    expect(result.durableMutation).toBe(false);
    expect(result.obsidianKanbanWrites).toBe(false);
  });

  it('rejected decision blocks', async () => {
    const f = await fixture({ decision: 'rejected' });
    const result = await run(f);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('DECISION_NOT_APPROVED');
  });

  it('unknown approval_id blocks', async () => {
    const f = await fixture({ includeRequest: false });
    const result = await run(f, { approvalId: 'tg4_unknownapproval' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('UNKNOWN_APPROVAL_ID');
  });

  it('expired request blocks', async () => {
    const f = await fixture({ expiresAt: '2026-07-05T08:59:59.000Z' });
    const result = await run(f);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EXPIRED_APPROVAL_ID');
  });

  it('mismatched repo/action blocks', async () => {
    const repoMismatch = await fixture({ decisionRepo: 'other/repo' });
    expect((await run(repoMismatch)).reason).toBe('DECISION_REQUEST_MISMATCH');

    const actionMismatch = await fixture({ decisionAction: 'fork' });
    expect((await run(actionMismatch)).reason).toBe('DECISION_REQUEST_MISMATCH');

    const reportMismatch = await fixture({ reportRepo: 'other/repo' });
    expect((await run(reportMismatch)).reason).toBe('REQUEST_REPORT_MISMATCH');
  });

  it('existing execution record blocks replay', async () => {
    const f = await fixture({ existingExecution: true });
    const result = await run(f);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EXECUTION_RECORD_EXISTS');
  });

  it('dry-run writes nothing', async () => {
    const f = await fixture();
    const result = await run(f);
    expect(result.ok).toBe(true);
    expect(result.planWritten).toBe(false);
    expect(await exists(f.plansPath)).toBe(false);
  });

  it('--write-plan writes one sanitized plan row only', async () => {
    const f = await fixture();
    const result = await run(f, { writePlan: true });
    expect(result.ok).toBe(true);
    expect(result.planWritten).toBe(true);
    const rows = (await readFile(f.plansPath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ approval_id: APPROVAL_ID, status: 'planned', sanitized: true, executed: false, selected_repo: 'CoWork-OS/CoWork-OS' });
    expect(rows[0].steps.every((step) => step.writes === false)).toBe(true);
    expect(JSON.stringify(rows[0])).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify(rows[0])).not.toContain(CHAT_ID);
  });

  it('--write-plan is the explicit one-shot write mode and does not require --dry-run', async () => {
    const f = await fixture();
    const result = await run(f, { dryRun: false, writePlan: true });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('telegram_approved_discovery_executor_write_plan');
    expect(result.dryRun).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.planWritten).toBe(true);
    const rows = (await readFile(f.plansPath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ approval_id: APPROVAL_ID, status: 'planned', dry_run: false, plan_only: true, executed: false });
    expect(rows[0].steps.every((step) => step.writes === false)).toBe(true);
  });

  it('token/chat/secrets are never printed', async () => {
    const f = await fixture();
    const result = await run(f);
    const raw = JSON.stringify(result);
    expect(raw).not.toContain(SECRET_TOKEN);
    expect(raw).not.toContain(CHAT_ID);
    expect(raw).not.toMatch(/bot\d+:/);
  });
});
