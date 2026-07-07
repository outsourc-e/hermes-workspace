import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runApprovedDiscoveryResearch } from './telegram-approved-discovery-research.mjs';

const APPROVAL_ID = 'tg4_d3fd7da71ae557f3';

async function exists(pathname) {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function fixture({ repo = 'CoWork-OS/CoWork-OS', action = 'learn_from', status = 'planned', existingResult = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tg-research-'));
  const plansPath = path.join(dir, 'telegram-execution-plans.jsonl');
  const resultsPath = path.join(dir, 'telegram-execution-results.jsonl');
  const reportDir = path.join(dir, 'research');
  await writeFile(plansPath, `${JSON.stringify({
    approval_id: APPROVAL_ID,
    status,
    selected_repo: repo,
    recommended_next_action: action,
    plan_type: 'learn_from_read_only_research',
    plan_only: true,
    executed: false,
    sanitized: true,
  })}\n`, 'utf8');
  if (existingResult) await writeFile(resultsPath, `${JSON.stringify({ approval_id: APPROVAL_ID, status: 'completed', sanitized: true })}\n`, 'utf8');
  return { dir, plansPath, resultsPath, reportDir };
}

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function fakeGithubFetch({ fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options?.method || 'GET' });
    if (fail) return response({ message: 'boom' }, false, 503);
    if (url.endsWith('/repos/CoWork-OS/CoWork-OS')) {
      return response({
        full_name: 'CoWork-OS/CoWork-OS',
        html_url: 'https://github.com/CoWork-OS/CoWork-OS',
        stargazers_count: 42,
        forks_count: 7,
        open_issues_count: 3,
        pushed_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-02T00:00:00Z',
        archived: false,
        license: { spdx_id: 'MIT', name: 'MIT License' },
      });
    }
    if (url.endsWith('/languages')) return response({ TypeScript: 1000, JavaScript: 500 });
    if (url.endsWith('/contents')) return response([{ type: 'file', name: 'package.json', size: 120 }, { type: 'file', name: 'Dockerfile', size: 80 }]);
    if (url.endsWith('/readme')) return response({ encoding: 'base64', content: Buffer.from('# CoWork OS\nAgent workspace and project workflow. token=SHOULD_NOT_SURVIVE\n').toString('base64') });
    if (url.endsWith('/license')) return response({ license: { spdx_id: 'MIT', name: 'MIT License' } });
    if (url.includes('/contents/package.json')) return response({ encoding: 'base64', content: Buffer.from('{"scripts":{"dev":"vite"},"secret":"SHOULD_NOT_SURVIVE"}').toString('base64') });
    if (url.includes('/contents/Dockerfile')) return response({ encoding: 'base64', content: Buffer.from('FROM node:22-alpine').toString('base64') });
    throw new Error(`unexpected URL ${url}`);
  };
  return { fetchImpl, calls };
}

async function readRows(pathname) {
  return (await readFile(pathname, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

describe('telegram approved discovery research executor', () => {
  it('dry-run performs no GitHub call and writes nothing', async () => {
    const f = await fixture();
    const fake = fakeGithubFetch();
    const result = await runApprovedDiscoveryResearch({ approvalId: APPROVAL_ID, plansPath: f.plansPath, resultsPath: f.resultsPath, reportDir: f.reportDir, dryRun: true, fetchImpl: fake.fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.githubCalls).toBe(false);
    expect(result.reportWritten).toBe(false);
    expect(result.resultWritten).toBe(false);
    expect(fake.calls).toHaveLength(0);
    expect(await exists(f.resultsPath)).toBe(false);
    expect(await exists(f.reportDir)).toBe(false);
  });

  it('mocked read-only GitHub research writes one report and one result row', async () => {
    const f = await fixture();
    const fake = fakeGithubFetch();
    const result = await runApprovedDiscoveryResearch({ approvalId: APPROVAL_ID, plansPath: f.plansPath, resultsPath: f.resultsPath, reportDir: f.reportDir, now: new Date('2026-07-05T10:00:00Z'), fetchImpl: fake.fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.githubCalls).toBe(true);
    expect(result.githubWrites).toBe(false);
    expect(result.clone).toBe(false);
    expect(result.fork).toBe(false);
    expect(result.dependencyInstall).toBe(false);
    expect(result.codeExecution).toBe(false);
    const report = await readFile(result.report_path, 'utf8');
    expect(report).toContain('CoWork-OS/CoWork-OS');
    expect(report).toContain('README summary');
    expect(report).not.toContain('SHOULD_NOT_SURVIVE');
    const rows = await readRows(f.resultsPath);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ approval_id: APPROVAL_ID, status: 'completed', selected_repo: 'CoWork-OS/CoWork-OS', github_writes: false, clone: false, fork: false, dependency_install: false, code_execution: false, sanitized: true });
  });

  it('replay blocks after one result row exists', async () => {
    const f = await fixture({ existingResult: true });
    const fake = fakeGithubFetch();
    const result = await runApprovedDiscoveryResearch({ approvalId: APPROVAL_ID, plansPath: f.plansPath, resultsPath: f.resultsPath, reportDir: f.reportDir, fetchImpl: fake.fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EXECUTION_RESULT_EXISTS_REPLAY_BLOCKED');
    expect(fake.calls).toHaveLength(0);
  });

  it('wrong repo/action blocks before GitHub calls', async () => {
    const wrongRepo = await fixture({ repo: 'other/repo' });
    const fakeRepo = fakeGithubFetch();
    expect((await runApprovedDiscoveryResearch({ approvalId: APPROVAL_ID, plansPath: wrongRepo.plansPath, resultsPath: wrongRepo.resultsPath, reportDir: wrongRepo.reportDir, fetchImpl: fakeRepo.fetchImpl })).reason).toBe('SELECTED_REPO_MISMATCH');
    expect(fakeRepo.calls).toHaveLength(0);

    const wrongAction = await fixture({ action: 'fork' });
    const fakeAction = fakeGithubFetch();
    expect((await runApprovedDiscoveryResearch({ approvalId: APPROVAL_ID, plansPath: wrongAction.plansPath, resultsPath: wrongAction.resultsPath, reportDir: wrongAction.reportDir, fetchImpl: fakeAction.fetchImpl })).reason).toBe('ACTION_MISMATCH');
    expect(fakeAction.calls).toHaveLength(0);
  });

  it('GitHub failure writes no result unless failed-result mode exists', async () => {
    const f = await fixture();
    const fake = fakeGithubFetch({ fail: true });
    const result = await runApprovedDiscoveryResearch({ approvalId: APPROVAL_ID, plansPath: f.plansPath, resultsPath: f.resultsPath, reportDir: f.reportDir, fetchImpl: fake.fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('GITHUB_READ_FAILED_NO_RESULT_WRITTEN');
    expect(result.githubCalls).toBe(true);
    expect(await exists(f.resultsPath)).toBe(false);
    expect(await exists(f.reportDir)).toBe(false);
  });

  it('secrets are redacted from result/report output', async () => {
    const f = await fixture();
    const fake = fakeGithubFetch();
    const result = await runApprovedDiscoveryResearch({ approvalId: APPROVAL_ID, plansPath: f.plansPath, resultsPath: f.resultsPath, reportDir: f.reportDir, fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify(result) + await readFile(result.report_path, 'utf8') + await readFile(f.resultsPath, 'utf8');
    expect(raw).not.toContain('SHOULD_NOT_SURVIVE');
    expect(raw).not.toMatch(/gh[pousr]_/);
    expect(raw).not.toMatch(/github_pat_/);
    expect(raw).not.toMatch(/bot\d+:/);
  });
});
