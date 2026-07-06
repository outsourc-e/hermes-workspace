#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const SERVICE_UNIT_NAME = 'hermes-public-github-discovery-worker.service';
export const TIMER_UNIT_NAME = 'hermes-public-github-discovery-worker.timer';
export const PYTHON_COMMAND = '/usr/bin/python3';
export const GITHUB_CONNECTOR_SCRIPT = '/root/.hermes/scripts/github_connector.py';
export const WORKER_SUBCOMMAND = 'public-github-discovery-worker';
export const WORKER_ARGS = ['--limit', '3', '--json'];
export const PREFLIGHT_ARGS = ['--dry-run', '--json'];

const execFileAsync = promisify(execFile);
const WORKER_COMMAND = [PYTHON_COMMAND, GITHUB_CONNECTOR_SCRIPT, WORKER_SUBCOMMAND, ...WORKER_ARGS];
const PREFLIGHT_COMMAND = [PYTHON_COMMAND, GITHUB_CONNECTOR_SCRIPT, WORKER_SUBCOMMAND, ...PREFLIGHT_ARGS];

const SERVICE_UNIT = `[Unit]
Description=Hermes public GitHub discovery worker
Documentation=https://hermes-agent.nousresearch.com/docs

[Service]
Type=oneshot
RuntimeDirectory=hermes-public-github-discovery-worker
RuntimeDirectoryMode=0700
ExecStartPre=/bin/sleep 120
ExecStart=/usr/bin/flock -n /run/hermes-public-github-discovery-worker/worker.lock ${WORKER_COMMAND.join(' ')}
`;

const TIMER_UNIT = `[Unit]
Description=Run Hermes public GitHub discovery worker every 30 minutes (disabled by default)
Documentation=https://hermes-agent.nousresearch.com/docs

[Timer]
OnCalendar=*:0/30
AccuracySec=1s
RandomizedDelaySec=3min
Persistent=false
Unit=${SERVICE_UNIT_NAME}

[Install]
WantedBy=timers.target
`;

export function getPublicGithubDiscoveryTimerPlan({ unitDir = '/etc/systemd/system' } = {}) {
  const resolvedUnitDir = path.resolve(unitDir);
  return {
    defaultState: 'disabled',
    enableTimer: false,
    startTimer: false,
    runWorker: false,
    githubCalls: false,
    reportWrites: false,
    indexWrites: false,
    auditWrites: false,
    durableStoreWrites: false,
    workerCommand: WORKER_COMMAND,
    preflightCommand: PREFLIGHT_COMMAND,
    schedule: {
      onCalendar: '*:0/30',
      everyMinutes: 30,
      randomizedDelay: '2-5 minutes',
      randomizedDelayImplementation: 'ExecStartPre=/bin/sleep 120 plus RandomizedDelaySec=3min',
      nonOverlap: 'same systemd service instance plus flock -n /run/hermes-public-github-discovery-worker/worker.lock',
    },
    units: [
      {
        name: SERVICE_UNIT_NAME,
        path: path.join(resolvedUnitDir, SERVICE_UNIT_NAME),
        content: SERVICE_UNIT,
      },
      {
        name: TIMER_UNIT_NAME,
        path: path.join(resolvedUnitDir, TIMER_UNIT_NAME),
        content: TIMER_UNIT,
      },
    ],
  };
}

export async function preflightPublicGithubDiscoveryWorker({
  pythonPath = PYTHON_COMMAND,
  connectorPath = GITHUB_CONNECTOR_SCRIPT,
} = {}) {
  await access(pythonPath, fsConstants.X_OK);
  await access(connectorPath, fsConstants.R_OK);
  const { stdout, stderr } = await execFileAsync(pythonPath, [connectorPath, WORKER_SUBCOMMAND, ...PREFLIGHT_ARGS], {
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  return {
    ok: true,
    rc: 0,
    stderr,
    command: [pythonPath, connectorPath, WORKER_SUBCOMMAND, ...PREFLIGHT_ARGS],
    verdict: parsed.verdict,
    githubWrites: parsed?.result?.github_write === true,
    auditWrites: parsed?.result?.audit_append === true,
    durableStoreWrites: parsed?.result?.durable_mutation === true,
    reportWrites: Number(parsed?.result?.reports_saved || 0) > 0,
    indexWrites: Number(parsed?.result?.index_rows_appended_count || 0) > 0,
    raw: parsed,
  };
}

function parseArgs(argv) {
  const args = { json: false, dryRun: false, unitDir: '/etc/systemd/system', allowSystemDir: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--allow-system-dir') args.allowSystemDir = true;
    else if (arg === '--unit-dir') {
      i += 1;
      if (!argv[i]) throw new Error('--unit-dir requires a value');
      args.unitDir = argv[i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function assertJson(args) {
  if (!args.json) throw new Error('This CLI is intentionally JSON-only. Pass --json.');
}

function isTempPath(targetPath) {
  const resolved = path.resolve(targetPath);
  const tmp = path.resolve(process.env.TMPDIR || '/tmp');
  return resolved === tmp || resolved.startsWith(`${tmp}${path.sep}`);
}

export async function installPublicGithubDiscoveryTimer({ unitDir = '/etc/systemd/system', dryRun, allowSystemDir = false } = {}) {
  const plan = getPublicGithubDiscoveryTimerPlan({ unitDir });
  if (dryRun) {
    return { action: 'dry-run', wrote: [], enabled: false, started: false, workerExecuted: false, ...plan };
  }

  if (!allowSystemDir && !isTempPath(unitDir)) {
    throw new Error('Refusing to write outside a temp unit directory without --allow-system-dir. This installer never enables or starts the timer.');
  }

  await mkdir(unitDir, { recursive: true });
  const wrote = [];
  for (const unit of plan.units) {
    await writeFile(unit.path, unit.content, { encoding: 'utf8', mode: 0o644 });
    wrote.push(unit.path);
  }
  return { action: 'install', wrote, enabled: false, started: false, workerExecuted: false, ...plan };
}

function render(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runPublicGithubDiscoveryTimerCli(argv = process.argv.slice(2), invokedPath = process.argv[1] || '') {
  const invokedAs = path.basename(invokedPath);
  const args = parseArgs(argv);
  assertJson(args);

  if (invokedAs.endsWith('public-github-discovery-timer-plan')) {
    process.stdout.write(render(getPublicGithubDiscoveryTimerPlan({ unitDir: args.unitDir })));
    return;
  }

  if (invokedAs.endsWith('public-github-discovery-timer-install')) {
    const result = await installPublicGithubDiscoveryTimer({
      unitDir: args.unitDir,
      dryRun: args.dryRun,
      allowSystemDir: args.allowSystemDir,
    });
    process.stdout.write(render(result));
    return;
  }

  throw new Error('Invoke as public-github-discovery-timer-plan or public-github-discovery-timer-install');
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  runPublicGithubDiscoveryTimerCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
