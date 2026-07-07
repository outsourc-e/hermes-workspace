#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_TELEGRAM_EXECUTION_PLANS_PATH = '/root/.hermes/reports/github-discovery/telegram-execution-plans.jsonl';
export const DEFAULT_TELEGRAM_EXECUTION_RESULTS_PATH = '/root/.hermes/reports/github-discovery/telegram-execution-results.jsonl';
export const DEFAULT_RESEARCH_REPORT_DIR = '/root/.hermes/reports/github-discovery/research';
export const APPROVED_REPO = 'CoWork-OS/CoWork-OS';
export const APPROVED_ACTION = 'learn_from';
export const README_CAP = 12000;
export const MANIFEST_CAP = 4000;

export const SIDE_EFFECT_FLAGS = Object.freeze({
  githubWrites: false,
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

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /bot\d+:[A-Za-z0-9_-]+/g,
  /xox[baprs]-[A-Za-z0-9-]+/g,
  /["']?(?<key>token|secret|password|api[_-]?key|client[_-]?secret)["']?\s*[:=]\s*["']?[^\s,'\"}]+["']?/gi,
];

const MANIFEST_NAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Dockerfile',
  'docker-compose.yml',
  'compose.yaml',
  'Gemfile',
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--approval-id') args.approvalId = argv[++i];
    else if (arg === '--plans-path') args.plansPath = argv[++i];
    else if (arg === '--results-path') args.resultsPath = argv[++i];
    else if (arg === '--report-dir') args.reportDir = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else args._.push(arg);
  }
  return args;
}

function requireJson(args) {
  if (!args.json) throw new Error('telegram-approved-discovery-research is intentionally JSON-only. Pass --json.');
}

function sanitizeText(value, cap = README_CAP) {
  let text = String(value || '').replace(/\u0000/g, '');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, (...match) => (match.groups?.key ? `${match.groups.key}=[REDACTED]` : '[REDACTED]'));
  text = text.replace(/[\t ]+$/gm, '').slice(0, cap);
  return text;
}

function normalizeAction(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
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
    reportWritten: false,
    resultWritten: false,
    githubCalls: false,
    ...SIDE_EFFECT_FLAGS,
    ...extra,
    note: 'Fail-closed. No research report or execution result row was written.',
  };
}

function findPlan(rows, approvalId) {
  return rows.find((row) => row?.approval_id === approvalId && row?.status === 'planned') || null;
}

function findResult(rows, approvalId) {
  return rows.find((row) => row?.approval_id === approvalId) || null;
}

function assertApprovedPlan(plan, approvalId) {
  if (!plan) return block('PLAN_NOT_FOUND_OR_NOT_PLANNED', { approval_id: approvalId });
  if (plan.status !== 'planned') return block('PLAN_STATUS_NOT_PLANNED', { approval_id: approvalId, status: plan.status || null });
  if (plan.selected_repo !== APPROVED_REPO) return block('SELECTED_REPO_MISMATCH', { approval_id: approvalId, selected_repo: plan.selected_repo || null, expected_repo: APPROVED_REPO });
  if (normalizeAction(plan.recommended_next_action) !== APPROVED_ACTION) return block('ACTION_MISMATCH', { approval_id: approvalId, recommended_next_action: plan.recommended_next_action || null, expected_action: APPROVED_ACTION });
  return null;
}

function githubApiUrl(route) {
  return `https://api.github.com${route}`;
}

function ghApiJson(route) {
  return new Promise((resolve, reject) => {
    execFile('gh', ['api', route.replace(/^\//, '')], { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`GitHub read failed via gh for ${route}: ${sanitizeText(stderr || error.message, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`GitHub read returned invalid JSON for ${route}: ${sanitizeText(parseError.message, 300)}`));
      }
    });
  });
}

async function githubJson(route, fetchImpl, { allowGhFallback = false } = {}) {
  const response = await fetchImpl(githubApiUrl(route), {
    method: 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'hermes-approved-discovery-research-readonly',
    },
  });
  if (!response.ok) {
    if (allowGhFallback && response.status === 403) return ghApiJson(route);
    throw new Error(`GitHub read failed ${response.status} for ${route}`);
  }
  return response.json();
}

function decodeBase64Content(item, cap) {
  if (!item || item.encoding !== 'base64' || typeof item.content !== 'string') return '';
  return sanitizeText(Buffer.from(item.content.replace(/\s+/g, ''), 'base64').toString('utf8'), cap);
}

function summarizeReadme(readme) {
  const lines = sanitizeText(readme, README_CAP).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headings = lines.filter((line) => /^#{1,3}\s+/.test(line)).slice(0, 12).map((line) => line.replace(/^#+\s*/, ''));
  const firstParas = lines.filter((line) => !line.startsWith('#') && !line.startsWith('![') && !line.startsWith('[!')).slice(0, 8);
  return sanitizeText([headings.length ? `Headings: ${headings.join(' | ')}` : '', firstParas.join(' ')].filter(Boolean).join('\n'), 2000);
}

function usefulLessons({ repo, manifests, readmeSummary, languages }) {
  const lessons = [];
  if (Object.keys(languages || {}).length) lessons.push(`Language mix suggests implementation split: ${Object.keys(languages).slice(0, 5).join(', ')}.`);
  if (manifests.some((m) => m.name === 'package.json')) lessons.push('Has Node/package manifest; inspect scripts/dependency shape later before any adoption.');
  if (manifests.some((m) => /Dockerfile|compose/i.test(m.name))) lessons.push('Container/deployment files may provide useful setup/deployment patterns.');
  if (/agent|workflow|workspace|collaboration|task|project/i.test(readmeSummary)) lessons.push('README appears relevant to agent/workspace/collaboration workflow ideas.');
  if (!lessons.length) lessons.push(`Use ${repo.full_name} mainly as a reference for product shape and documentation conventions, not as ready-to-run source.`);
  return lessons;
}

function estimateSetupComplexity(manifests, readmeText) {
  const names = manifests.map((m) => m.name);
  let score = 1;
  if (names.includes('package.json')) score += 1;
  if (names.includes('Dockerfile') || names.includes('docker-compose.yml') || names.includes('compose.yaml')) score += 1;
  if (/database|postgres|redis|docker|env|\.env|oauth|supabase|firebase/i.test(readmeText)) score += 1;
  if (score <= 2) return 'low-to-medium';
  if (score === 3) return 'medium';
  return 'medium-to-high';
}

function risks({ repo, license, manifests, readmeText }) {
  const out = [];
  if (!license?.spdx_id || license.spdx_id === 'NOASSERTION') out.push('License is unclear; reuse should stay learning-only until clarified.');
  if (repo.archived) out.push('Repository is archived.');
  if (!manifests.length) out.push('No common package/manifest files detected at repository root.');
  if (/\.env|secret|token|api key|credential/i.test(readmeText)) out.push('Setup likely depends on external credentials or environment variables; do not copy config blindly.');
  if (!out.length) out.push('No immediate read-only metadata blocker found; still needs later code review before any reuse.');
  return out;
}

export function buildResearchMarkdown({ approvalId, repo, readmeSummary, license, languages, manifests, lessons, complexity, concerns, now }) {
  const manifestLines = manifests.length ? manifests.map((m) => `- ${m.name}${m.summary ? `: ${m.summary}` : ''}`).join('\n') : '- none detected';
  const languageLines = Object.entries(languages || {}).slice(0, 10).map(([name, bytes]) => `- ${name}: ${bytes}`).join('\n') || '- unavailable';
  return sanitizeText(`# Approved GitHub discovery research: ${repo.full_name}

Approval ID: ${approvalId}
Action: learn_from
Generated: ${new Date(now).toISOString()}
Read-only: true

## Repo
- Name: ${repo.full_name}
- URL: ${repo.html_url}
- Stars: ${repo.stargazers_count ?? 'unknown'}
- Forks: ${repo.forks_count ?? 'unknown'}
- Open issues: ${repo.open_issues_count ?? 'unknown'}
- Latest activity: ${repo.pushed_at || repo.updated_at || 'unknown'}
- License: ${license?.spdx_id || license?.name || 'unknown'}

## Languages
${languageLines}

## Detected manifests
${manifestLines}

## README summary
${readmeSummary || 'No README summary available.'}

## Useful architecture/features
${lessons.map((item) => `- ${item}`).join('\n')}

## Possible reuse lessons
- Treat this as reference material only under the approved learn_from action.
- Compare its manifest and README structure against Hermes discovery/workspace workflows before writing any code.
- Do not clone, install, or execute anything from the repo without a separate approval.

## Setup complexity estimate
${complexity}

## Risks/concerns
${concerns.map((item) => `- ${item}`).join('\n')}

## Recommended next step for Hermes
Create a narrow follow-up design note extracting only the useful workflow/UI/architecture patterns from this repo. Keep implementation local and do not import code until a separate license/code review package is approved.
`, 20000);
}

async function fetchPublicRepoResearch(repoFullName, fetchImpl, { allowGhFallback = false } = {}) {
  if (repoFullName !== APPROVED_REPO) throw new Error('Refusing to fetch any repo outside approved selected_repo.');
  const [owner, repoName] = repoFullName.split('/');
  const read = (route) => githubJson(route, fetchImpl, { allowGhFallback });
  const repo = await read(`/repos/${owner}/${repoName}`);
  if (repo.full_name !== APPROVED_REPO || repo.html_url !== `https://github.com/${APPROVED_REPO}`) {
    throw new Error('GitHub repo lookup did not resolve to the approved selected_repo.');
  }
  const [languages, rootContents, readmeResult, licenseResult] = await Promise.all([
    read(`/repos/${owner}/${repoName}/languages`).catch(() => ({})),
    read(`/repos/${owner}/${repoName}/contents`).catch(() => []),
    read(`/repos/${owner}/${repoName}/readme`).catch(() => null),
    read(`/repos/${owner}/${repoName}/license`).catch(() => null),
  ]);
  const rootFiles = Array.isArray(rootContents) ? rootContents.filter((item) => item?.type === 'file') : [];
  const manifestFiles = rootFiles.filter((item) => MANIFEST_NAMES.has(item.name)).slice(0, 8);
  const manifestPayloads = await Promise.all(manifestFiles.map(async (item) => {
    try {
      const contentItem = await read(`/repos/${owner}/${repoName}/contents/${encodeURIComponent(item.name)}`);
      const content = decodeBase64Content(contentItem, MANIFEST_CAP);
      return { name: item.name, size: item.size || content.length, summary: content.split(/\r?\n/).slice(0, 12).join(' ').slice(0, 500), content_capped: true };
    } catch {
      return { name: item.name, size: item.size || null, summary: '', content_capped: true };
    }
  }));
  const readmeText = decodeBase64Content(readmeResult, README_CAP);
  const readmeSummary = summarizeReadme(readmeText);
  const license = licenseResult?.license || repo.license || null;
  const lessons = usefulLessons({ repo, manifests: manifestPayloads, readmeSummary, languages });
  const complexity = estimateSetupComplexity(manifestPayloads, readmeText);
  const concerns = risks({ repo, license, manifests: manifestPayloads, readmeText });
  return { repo, languages, manifests: manifestPayloads, readmeSummary, license, lessons, complexity, concerns };
}

function safeReportName(approvalId) {
  return `${approvalId.replace(/[^a-zA-Z0-9_-]/g, '_')}-CoWork-OS_CoWork-OS-research.md`;
}

function resultRow({ approvalId, plan, research, reportPath, reportHash, now }) {
  return {
    approval_id: approvalId,
    status: 'completed',
    executed_at: new Date(now).toISOString(),
    action: APPROVED_ACTION,
    selected_repo: APPROVED_REPO,
    report_path: reportPath,
    report_hash: reportHash,
    github_read_only_calls: true,
    github_writes: false,
    clone: false,
    fork: false,
    dependency_install: false,
    code_execution: false,
    repo_creation: false,
    branch_push: false,
    pr_open: false,
    merge: false,
    delete: false,
    audit_append: false,
    durable_mutation: false,
    obsidian_kanban_writes: false,
    telegram_completion_sent: false,
    telegram_message_id: null,
    sanitized: true,
    repo: {
      full_name: research.repo.full_name,
      html_url: research.repo.html_url,
      stars: research.repo.stargazers_count ?? null,
      forks: research.repo.forks_count ?? null,
      open_issues: research.repo.open_issues_count ?? null,
      latest_activity: research.repo.pushed_at || research.repo.updated_at || null,
      license: research.license?.spdx_id || research.license?.name || null,
      languages: Object.keys(research.languages || {}).slice(0, 10),
      manifests: research.manifests.map((m) => ({ name: m.name, size: m.size ?? null })),
      setup_complexity_estimate: research.complexity,
    },
    source_plan: {
      plan_type: plan.plan_type || null,
      plan_only: plan.plan_only === true,
      status: plan.status,
    },
  };
}

export async function runApprovedDiscoveryResearch({
  approvalId,
  plansPath = DEFAULT_TELEGRAM_EXECUTION_PLANS_PATH,
  resultsPath = DEFAULT_TELEGRAM_EXECUTION_RESULTS_PATH,
  reportDir = DEFAULT_RESEARCH_REPORT_DIR,
  dryRun = false,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  allowGhFallback = true,
} = {}) {
  if (!approvalId) throw new Error('telegram-approved-discovery-research requires --approval-id.');
  const [plans, results] = await Promise.all([readJsonl(plansPath), readJsonl(resultsPath)]);
  const plan = findPlan(plans, approvalId);
  const planBlock = assertApprovedPlan(plan, approvalId);
  if (planBlock) return planBlock;
  if (findResult(results, approvalId)) return block('EXECUTION_RESULT_EXISTS_REPLAY_BLOCKED', { approval_id: approvalId });

  const dryRunBase = {
    ok: true,
    blocked: false,
    mode: dryRun ? 'approved_discovery_research_dry_run' : 'approved_discovery_research_execute',
    approval_id: approvalId,
    dryRun,
    selected_repo: APPROVED_REPO,
    recommended_next_action: APPROVED_ACTION,
    report_dir: reportDir,
    results_path: resultsPath,
    executed: false,
    reportWritten: false,
    resultWritten: false,
    githubCalls: false,
    ...SIDE_EFFECT_FLAGS,
  };
  if (dryRun) return { ...dryRunBase, note: 'Dry-run only. Validated plan/replay gates; no GitHub call and no writes.' };

  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for public GitHub read-only research.');
  let research;
  try {
    research = await fetchPublicRepoResearch(APPROVED_REPO, fetchImpl, { allowGhFallback });
  } catch (error) {
    return block('GITHUB_READ_FAILED_NO_RESULT_WRITTEN', { approval_id: approvalId, githubCalls: true, error: sanitizeText(error?.message || error, 500) });
  }

  const markdown = buildResearchMarkdown({ approvalId, ...research, now });
  const reportPath = path.join(reportDir, safeReportName(approvalId));
  const reportHash = createHash('sha256').update(markdown).digest('hex');
  const row = resultRow({ approvalId, plan, research, reportPath, reportHash, now });
  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, markdown, 'utf8');
  await appendJsonl(resultsPath, row);
  return {
    ...dryRunBase,
    ok: true,
    mode: 'approved_discovery_research_execute',
    executed: true,
    reportWritten: true,
    resultWritten: true,
    githubCalls: true,
    report_path: reportPath,
    report_hash: reportHash,
    result_row: row,
    research_summary: row.repo,
    note: 'Completed read-only public GitHub research and appended one sanitized execution result row.',
  };
}

export async function runApprovedDiscoveryResearchCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  requireJson(args);
  const result = await runApprovedDiscoveryResearch({
    approvalId: args.approvalId,
    plansPath: args.plansPath || DEFAULT_TELEGRAM_EXECUTION_PLANS_PATH,
    resultsPath: args.resultsPath || DEFAULT_TELEGRAM_EXECUTION_RESULTS_PATH,
    reportDir: args.reportDir || DEFAULT_RESEARCH_REPORT_DIR,
    dryRun: args.dryRun === true,
    now: args.now ? new Date(args.now) : new Date(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runApprovedDiscoveryResearchCli().catch((error) => {
    const safe = {
      ok: false,
      blocked: true,
      error: sanitizeText(error?.message || error, 500),
      executed: false,
      reportWritten: false,
      resultWritten: false,
      githubCalls: false,
      ...SIDE_EFFECT_FLAGS,
      note: 'No action taken.',
    };
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
    process.exitCode = 1;
  });
}
