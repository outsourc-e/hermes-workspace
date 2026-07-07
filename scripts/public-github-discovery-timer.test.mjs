import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  GITHUB_CONNECTOR_SCRIPT,
  PYTHON_COMMAND,
  SERVICE_UNIT_NAME,
  TIMER_UNIT_NAME,
  getPublicGithubDiscoveryTimerPlan,
  installPublicGithubDiscoveryTimer,
  preflightPublicGithubDiscoveryWorker,
} from './public-github-discovery-timer.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

async function runCli(relativeBin, args) {
  const { stdout, stderr } = await execFileAsync(path.join(repoRoot, relativeBin), args, {
    cwd: repoRoot,
    env: { ...process.env, PATH: `/tmp/nonexistent-worker-bin:${process.env.PATH || ''}` },
  });
  expect(stderr).toBe('');
  return JSON.parse(stdout);
}

describe('public GitHub discovery systemd timer packaging', () => {
  it('plan CLI emits exact disabled-by-default unit content without side-effect flags', async () => {
    const plan = await runCli('bin/public-github-discovery-timer-plan', ['--json']);

    expect(plan.defaultState).toBe('disabled');
    expect(plan.enableTimer).toBe(false);
    expect(plan.startTimer).toBe(false);
    expect(plan.runWorker).toBe(false);
    expect(plan.githubCalls).toBe(false);
    expect(plan.auditWrites).toBe(false);
    expect(plan.reportWrites).toBe(false);
    expect(plan.indexWrites).toBe(false);
    expect(plan.durableStoreWrites).toBe(false);
    expect(plan.workerCommand).toEqual([
      PYTHON_COMMAND,
      GITHUB_CONNECTOR_SCRIPT,
      'public-github-discovery-worker',
      '--limit',
      '3',
      '--json',
    ]);
    expect(plan.preflightCommand).toEqual([
      PYTHON_COMMAND,
      GITHUB_CONNECTOR_SCRIPT,
      'public-github-discovery-worker',
      '--dry-run',
      '--json',
    ]);
    expect(plan.schedule).toMatchObject({
      everyMinutes: 30,
      randomizedDelay: '2-5 minutes',
    });

    const service = plan.units.find((unit) => unit.name === SERVICE_UNIT_NAME);
    const timer = plan.units.find((unit) => unit.name === TIMER_UNIT_NAME);
    expect(service.content).toBe(`[Unit]\nDescription=Hermes public GitHub discovery worker\nDocumentation=https://hermes-agent.nousresearch.com/docs\n\n[Service]\nType=oneshot\nRuntimeDirectory=hermes-public-github-discovery-worker\nRuntimeDirectoryMode=0700\nExecStartPre=/bin/sleep 120\nExecStart=/usr/bin/flock -n /run/hermes-public-github-discovery-worker/worker.lock ${PYTHON_COMMAND} ${GITHUB_CONNECTOR_SCRIPT} public-github-discovery-worker --limit 3 --json\n`);
    expect(timer.content).toBe(`[Unit]\nDescription=Run Hermes public GitHub discovery worker every 30 minutes (disabled by default)\nDocumentation=https://hermes-agent.nousresearch.com/docs\n\n[Timer]\nOnCalendar=*:0/30\nAccuracySec=1s\nRandomizedDelaySec=3min\nPersistent=false\nUnit=${SERVICE_UNIT_NAME}\n\n[Install]\nWantedBy=timers.target\n`);
    expect(`${service.content}\n${timer.content}`).not.toMatch(/systemctl\s+(enable|start)|gh\s+|git\s+|github\.com|audit|report|index/i);
  });

  it('install dry-run CLI emits exact units and writes nothing', async () => {
    const unitDir = await mkdtemp(path.join(os.tmpdir(), 'gh-disc-timer-dry-'));
    try {
      const before = await readdir(unitDir);
      const result = await runCli('bin/public-github-discovery-timer-install', ['--dry-run', '--json', '--unit-dir', unitDir]);
      const after = await readdir(unitDir);

      expect(before).toEqual([]);
      expect(after).toEqual([]);
      expect(result.action).toBe('dry-run');
      expect(result.wrote).toEqual([]);
      expect(result.enabled).toBe(false);
      expect(result.started).toBe(false);
      expect(result.workerExecuted).toBe(false);
      expect(result.units.map((unit) => unit.path).sort()).toEqual([
        path.join(unitDir, SERVICE_UNIT_NAME),
        path.join(unitDir, TIMER_UNIT_NAME),
      ].sort());
    } finally {
      await rm(unitDir, { recursive: true, force: true });
    }
  });

  it('install writes only approved temp unit paths and never enables, starts, or runs the worker', async () => {
    const unitDir = await mkdtemp(path.join(os.tmpdir(), 'gh-disc-timer-install-'));
    try {
      const auditBefore = getPublicGithubDiscoveryTimerPlan().auditWrites;
      const durableBefore = getPublicGithubDiscoveryTimerPlan().durableStoreWrites;
      const result = await installPublicGithubDiscoveryTimer({ unitDir, dryRun: false });

      expect(result.action).toBe('install');
      expect(result.enabled).toBe(false);
      expect(result.started).toBe(false);
      expect(result.workerExecuted).toBe(false);
      expect(result.githubCalls).toBe(false);
      expect(result.auditWrites).toBe(auditBefore);
      expect(result.durableStoreWrites).toBe(durableBefore);
      expect(result.wrote.sort()).toEqual([
        path.join(unitDir, SERVICE_UNIT_NAME),
        path.join(unitDir, TIMER_UNIT_NAME),
      ].sort());
      expect((await readdir(unitDir)).sort()).toEqual([SERVICE_UNIT_NAME, TIMER_UNIT_NAME].sort());
      for (const unit of result.units) {
        expect(await readFile(unit.path, 'utf8')).toBe(unit.content);
        expect((await stat(unit.path)).isFile()).toBe(true);
      }
    } finally {
      await rm(unitDir, { recursive: true, force: true });
    }
  });

  it('preflight runs the absolute dry-run worker command without writes', async () => {
    const result = await preflightPublicGithubDiscoveryWorker();

    expect(result.ok).toBe(true);
    expect(result.rc).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.command).toEqual([
      PYTHON_COMMAND,
      GITHUB_CONNECTOR_SCRIPT,
      'public-github-discovery-worker',
      '--dry-run',
      '--json',
    ]);
    expect(result.verdict).toBe('PASS_PUBLIC_GITHUB_DISCOVERY_WORKER_DRY_RUN');
    expect(result.githubWrites).toBe(false);
    expect(result.auditWrites).toBe(false);
    expect(result.durableStoreWrites).toBe(false);
    expect(result.reportWrites).toBe(false);
    expect(result.indexWrites).toBe(false);
  });

  it('refuses non-temp writes unless explicitly allowed', async () => {
    await expect(installPublicGithubDiscoveryTimer({ unitDir: '/etc/systemd/system', dryRun: false })).rejects.toThrow(
      'Refusing to write outside a temp unit directory',
    );
  });
});
