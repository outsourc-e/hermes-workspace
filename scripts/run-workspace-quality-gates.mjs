import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const startedAt = Date.now()
const runId = new Date(startedAt).toISOString().replaceAll(':', '').replaceAll('.', '-')
const qualityRoot = process.env.WORKSPACE_QUALITY_ROOT
  ? path.resolve(process.env.WORKSPACE_QUALITY_ROOT)
  : path.join(os.homedir(), '.hermes', 'workspace-health', 'hermes-workspace')
const runDir = path.join(qualityRoot, 'runs', runId)
const latestPath = process.env.WORKSPACE_QUALITY_ARTIFACT
  ? path.resolve(process.env.WORKSPACE_QUALITY_ARTIFACT)
  : path.join(qualityRoot, 'latest.json')
fs.mkdirSync(runDir, { recursive: true, mode: 0o700 })
fs.mkdirSync(path.dirname(latestPath), { recursive: true, mode: 0o700 })

const commandEnv = {
  ...process.env,
  WORKSPACE_AUTOSTART_LOCAL_SERVICES: '0',
}

function runCommand(id, label, command, args, options = {}) {
  const checkStartedAt = Date.now()
  console.log(`[workspace-qa] ${label}…`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...commandEnv, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    timeout: options.timeout || 10 * 60 * 1000,
  })
  const finishedAt = Date.now()
  const logPath = path.join(runDir, `${id}.log`)
  const output = [result.stdout || '', result.stderr || '', result.error?.message || '']
    .filter(Boolean)
    .join('\n')
  fs.writeFileSync(logPath, output, { encoding: 'utf8', mode: 0o600 })
  const exitCode = result.status
  const state = exitCode === 0 ? 'pass' : 'fail'
  console.log(`[workspace-qa] ${label}: ${state.toUpperCase()} (${finishedAt - checkStartedAt}ms)`)
  return {
    id,
    label,
    state,
    detail: state === 'pass' ? `${label} completed successfully.` : `${label} failed; inspect the saved evidence.`,
    command: [command, ...args].join(' '),
    exitCode,
    durationMs: finishedAt - checkStartedAt,
    artifactPath: logPath,
    rawStdout: result.stdout || '',
    rawStderr: [result.stderr || '', result.error?.message || '']
      .filter(Boolean)
      .join('\n'),
  }
}

const checks = []
checks.push(runCommand('diff-check', 'Diff whitespace', 'git', ['diff', '--check']))

const lint = runCommand(
  'lint',
  'Lint budget',
  'pnpm',
  ['exec', 'tsx', 'scripts/check-eslint-budget.ts', '--json'],
)
try {
  const payload = JSON.parse(lint.rawStdout.trim())
  lint.state = payload.evaluation.state
  lint.warnings = payload.snapshot.totalWarnings
  lint.errors = payload.snapshot.totalErrors
  lint.detail =
    lint.state === 'fail'
      ? `${payload.snapshot.totalErrors} errors; ${payload.snapshot.totalWarnings}/${payload.baselineWarnings} warnings; budget regression detected.`
      : lint.state === 'warn'
        ? `${payload.snapshot.totalErrors} errors; ${payload.snapshot.totalWarnings} grandfathered warnings within the ${payload.baselineWarnings} warning budget.`
        : 'ESLint completed with zero errors and zero warnings.'
  lint.baselineWarnings = payload.baselineWarnings
} catch (error) {
  lint.state = 'fail'
  lint.detail = `Lint budget output was invalid: ${error instanceof Error ? error.message : String(error)}`
}
checks.push(lint)

checks.push(runCommand('typecheck', 'TypeScript', 'pnpm', ['typecheck']))
checks.push(
  runCommand('tests', 'Full tests', 'pnpm', ['test'], {
    env: { NODE_ENV: 'test', VITEST: 'true' },
  }),
)
checks.push(runCommand('build', 'Production build', 'pnpm', ['build']))

for (const check of checks) {
  delete check.rawStdout
  delete check.rawStderr
}

function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout : ''
}

const status = gitOutput(['status', '--porcelain=v1', '--untracked-files=all'])
const statusFingerprint = createHash('sha256').update(status).digest('hex')
const dirtyPaths = gitOutput(['ls-files', '-m', '-o', '--exclude-standard', '-z'])
const untrackedPaths = gitOutput(['ls-files', '-o', '--exclude-standard', '-z'])
const lintCheck = checks.find((check) => check.id === 'lint')
const finishedAt = Date.now()
const overall = checks.some((check) => check.state === 'fail')
  ? 'fail'
  : checks.some((check) => check.state === 'warn')
    ? 'warn'
    : 'pass'
const artifact = {
  schemaVersion: 1,
  runId,
  runDir,
  startedAt,
  finishedAt,
  durationMs: finishedAt - startedAt,
  overall,
  repo: {
    root,
    head: gitOutput(['rev-parse', 'HEAD']).trim(),
    branch: gitOutput(['branch', '--show-current']).trim(),
    statusFingerprint,
    dirtyCount: dirtyPaths ? dirtyPaths.split('\0').filter(Boolean).length : 0,
    untrackedCount: untrackedPaths ? untrackedPaths.split('\0').filter(Boolean).length : 0,
  },
  warningBudget: {
    baseline: lintCheck?.baselineWarnings ?? 0,
    current: lintCheck?.warnings ?? null,
  },
  checks,
}
const runArtifactPath = path.join(runDir, 'quality-run.json')
fs.writeFileSync(runArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
})
fs.writeFileSync(latestPath, `${JSON.stringify(artifact, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
})
console.log(
  JSON.stringify({
    overall,
    runId,
    runArtifactPath,
    latestPath,
    durationMs: artifact.durationMs,
    checks: checks.map(({ id, state, exitCode, durationMs }) => ({ id, state, exitCode, durationMs })),
  }),
)
if (overall === 'fail') process.exitCode = 1
