import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

type ProductId = 'workspace' | 'agent'
type InstallKind = 'git' | 'desktop' | 'docker' | 'unknown'
type UpdateState = 'current' | 'available' | 'blocked' | 'unsupported' | 'error'

type ReleaseNoteSection = {
  product: ProductId
  label: string
  from: string | null
  to: string | null
  commits: Array<string>
}

export type ProductUpdateStatus = {
  id: ProductId
  label: string
  installKind: InstallKind
  version: string
  path: string | null
  repoPath: string | null
  branch: string | null
  currentHead: string | null
  latestHead: string | null
  updateAvailable: boolean
  canUpdate: boolean
  state: UpdateState
  reason: string | null
  updateMode:
    | 'git-ff'
    | 'hermes-update'
    | 'desktop-auto-updater'
    | 'docker-manual'
    | 'manual'
}

export type UpdateStatus = {
  ok: true
  checkedAt: number
  products: {
    workspace: ProductUpdateStatus
    agent: ProductUpdateStatus
  }
  updateAvailable: boolean
  pendingReleaseNotes: Array<ReleaseNoteSection>
}

export type ApplyUpdateResult = {
  ok: boolean
  product: ProductId
  output: string
  restartRequired: boolean
  status: ProductUpdateStatus
  releaseNotes: Array<ReleaseNoteSection>
  error?: string
}

function pendingNotesPath(): string {
  return join(process.cwd(), '.runtime', 'pending-update-release-notes.json')
}

function persistPendingReleaseNotes(sections: Array<ReleaseNoteSection>): void {
  if (!sections.length) return
  const path = pendingNotesPath()
  mkdirSync(join(process.cwd(), '.runtime'), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify({ sections, updatedAt: Date.now() }, null, 2)}\n`,
  )
}

function readPendingReleaseNotes(): Array<ReleaseNoteSection> {
  try {
    const raw = JSON.parse(readFileSync(pendingNotesPath(), 'utf8')) as {
      sections?: Array<ReleaseNoteSection>
    }
    return Array.isArray(raw.sections) ? raw.sections : []
  } catch {
    return []
  }
}

function exec(
  command: string,
  args: Array<string>,
  options: { cwd?: string; timeout?: number; stdio?: 'pipe' | 'ignore' } = {},
): string | null {
  try {
    if (options.stdio === 'ignore') {
      execFileSync(command, args, {
        cwd: options.cwd ?? process.cwd(),
        timeout: options.timeout ?? 8_000,
        stdio: 'ignore',
      })
      return 'ok'
    }
    return (
      execFileSync(command, args, {
        cwd: options.cwd ?? process.cwd(),
        encoding: 'utf8',
        timeout: options.timeout ?? 8_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim() || null
    )
  } catch {
    return null
  }
}

function execOrThrow(
  command: string,
  args: Array<string>,
  options: { cwd?: string; timeout?: number } = {},
): string {
  return execFileSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? 300_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function git(args: Array<string>, cwd: string, timeout = 8_000): string | null {
  return exec('git', args, { cwd, timeout })
}

function realGitRepoPath(path: string | null | undefined): string | null {
  if (!path) return null
  try {
    const resolved = realpathSync(path)
    return existsSync(join(resolved, '.git')) ? resolved : null
  } catch {
    return null
  }
}

function pkgVersion(repoPath: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(repoPath, 'package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function remoteUrlMatches(
  url: string | null,
  expected: Array<string>,
): boolean {
  if (!url) return false
  const normalized = url
    .toLowerCase()
    .replace(/^git@github\.com:/, 'github.com/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
  return expected.some((alias) =>
    normalized.includes(alias.toLowerCase().replace(/\.git$/, '')),
  )
}

function remoteHead(repoPath: string, remote = 'origin'): string | null {
  const url = git(['remote', 'get-url', remote], repoPath)
  if (!url) return null
  const raw = exec('git', ['ls-remote', url, 'HEAD'], {
    cwd: repoPath,
    timeout: 10_000,
  })
  return raw?.split(/\s+/)[0] ?? null
}

function isDirty(repoPath: string): boolean {
  return Boolean(git(['status', '--porcelain'], repoPath))
}

function canFastForward(repoPath: string, remoteRef: string): boolean {
  return (
    exec('git', ['merge-base', '--is-ancestor', 'HEAD', remoteRef], {
      cwd: repoPath,
      stdio: 'ignore',
    }) !== null
  )
}

function canResetToRemote(repoPath: string, remoteRef: string): boolean {
  return Boolean(git(['rev-parse', '--verify', remoteRef], repoPath, 10_000))
}

function syncRepoToRemote(repoPath: string, remoteRef: string): string {
  if (canFastForward(repoPath, remoteRef)) {
    return execOrThrow('git', ['merge', '--ff-only', remoteRef], {
      cwd: repoPath,
      timeout: 60_000,
    })
  }
  return execOrThrow('git', ['reset', '--hard', remoteRef], {
    cwd: repoPath,
    timeout: 60_000,
  })
}

function readCommits(
  repoPath: string,
  from: string | null,
  to: string | null,
): Array<string> {
  if (!from || !to || from === to) return []
  return (
    git(['log', '--pretty=format:%s (%h)', `${from}..${to}`], repoPath, 10_000)
      ?.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12) ?? []
  )
}

function workspaceInstallKind(): InstallKind {
  if (
    process.env.HERMES_WORKSPACE_DESKTOP === '1' ||
    process.env.ELECTRON_RUN_AS_NODE
  )
    return 'desktop'
  if (process.env.HERMES_WORKSPACE_DOCKER === '1' || existsSync('/.dockerenv'))
    return 'docker'
  return realGitRepoPath(process.cwd()) ? 'git' : 'unknown'
}

export function readWorkspaceUpdateStatus(
  repoPath = process.cwd(),
): ProductUpdateStatus {
  const installKind = workspaceInstallKind()
  const gitRepo = realGitRepoPath(repoPath)
  const version = gitRepo ? pkgVersion(gitRepo) : 'unknown'

  if (installKind === 'desktop') {
    return {
      id: 'workspace',
      label: 'Hermes Workspace',
      installKind,
      version,
      path: repoPath,
      repoPath: gitRepo,
      branch: null,
      currentHead: null,
      latestHead: null,
      updateAvailable: false,
      canUpdate: false,
      state: 'unsupported',
      reason:
        'Desktop auto-updater manifest is not wired yet. This path is reserved for DMG/EXE packaging.',
      updateMode: 'desktop-auto-updater',
    }
  }

  if (installKind === 'docker') {
    return {
      id: 'workspace',
      label: 'Hermes Workspace',
      installKind,
      version,
      path: repoPath,
      repoPath: gitRepo,
      branch: null,
      currentHead: null,
      latestHead: null,
      updateAvailable: false,
      canUpdate: false,
      state: 'unsupported',
      reason:
        'Docker installs should update by pulling a newer image/tag, not by mutating the running container.',
      updateMode: 'docker-manual',
    }
  }

  if (!gitRepo) {
    return {
      id: 'workspace',
      label: 'Hermes Workspace',
      installKind: 'unknown',
      version,
      path: repoPath,
      repoPath: null,
      branch: null,
      currentHead: null,
      latestHead: null,
      updateAvailable: false,
      canUpdate: false,
      state: 'unsupported',
      reason: 'Workspace install type could not be detected.',
      updateMode: 'manual',
    }
  }

  const remoteUrl = git(['remote', 'get-url', 'origin'], gitRepo)
  const repoMatches = remoteUrlMatches(remoteUrl, [
    'hermes-workspace',
    'outsourc-e/hermes-workspace',
  ])
  if (repoMatches) git(['fetch', 'origin', '--quiet'], gitRepo, 30_000)
  const currentHead = git(['rev-parse', 'HEAD'], gitRepo)
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], gitRepo)
  const supportedBranch = branch === 'main' || branch === 'master'
  const latestHead =
    repoMatches && supportedBranch ? remoteHead(gitRepo, 'origin') : null
  const dirty = isDirty(gitRepo)
  const updateAvailable = Boolean(
    supportedBranch && currentHead && latestHead && currentHead !== latestHead,
  )
  const remoteRef = `origin/${branch || 'main'}`
  const canSync = updateAvailable ? canResetToRemote(gitRepo, remoteRef) : true
  const ff = updateAvailable ? canFastForward(gitRepo, remoteRef) : true
  const canUpdate = Boolean(
    repoMatches && supportedBranch && updateAvailable && !dirty && canSync,
  )

  return {
    id: 'workspace',
    label: 'Hermes Workspace',
    installKind: 'git',
    version,
    path: repoPath,
    repoPath: gitRepo,
    branch,
    currentHead,
    latestHead,
    updateAvailable,
    canUpdate,
    state: !repoMatches
      ? 'unsupported'
      : !supportedBranch
        ? 'unsupported'
        : dirty
          ? 'blocked'
          : updateAvailable
            ? canSync
              ? 'available'
              : 'blocked'
            : 'current',
    reason: !repoMatches
      ? 'Workspace origin remote does not look like hermes-workspace.'
      : !supportedBranch
        ? 'Workspace one-click updates are only enabled on main/master branches.'
        : dirty
          ? 'Workspace checkout has local changes. Commit or stash before updating.'
          : updateAvailable && !canSync
            ? 'Workspace update could not verify the remote branch ref.'
            : updateAvailable && !ff
              ? 'Workspace branch diverged from origin. One-click update will realign to the remote branch.'
              : null,
    updateMode: 'git-ff',
  }
}

function agentRepoPath(): string | null {
  const candidates = [
    process.env.HERMES_AGENT_REPO,
    join(homedir(), '.hermes', 'hermes-agent'),
    join(homedir(), 'Projects', 'hermes-agent'),
    join(homedir(), 'hermes-agent'),
  ]
  for (const candidate of candidates) {
    const repo = realGitRepoPath(candidate)
    if (repo) return repo
  }
  return null
}

export function readAgentUpdateStatus(): ProductUpdateStatus {
  const repoPath = agentRepoPath()
  const repoHermes = repoPath ? join(repoPath, 'venv', 'bin', 'hermes') : null
  const path =
    repoHermes && existsSync(repoHermes) ? repoHermes : exec('which', ['hermes'])
  const version =
    (path ? exec(path, ['--version'], { timeout: 10_000 }) : null)?.split(
      '\n',
    )[0] ?? 'unknown'

  if (!repoPath) {
    return {
      id: 'agent',
      label: 'Hermes Agent',
      installKind: 'unknown',
      version,
      path,
      repoPath: null,
      branch: null,
      currentHead: null,
      latestHead: null,
      updateAvailable: false,
      canUpdate: false,
      state: 'unsupported',
      reason:
        'Hermes Agent git checkout was not found. Bundled desktop installs will update through the app updater.',
      updateMode: 'manual',
    }
  }

  const remoteUrl = git(['remote', 'get-url', 'origin'], repoPath)
  const repoMatches = remoteUrlMatches(remoteUrl, [
    'hermes-agent',
    'outsourc-e/hermes-agent',
    'NousResearch/hermes-agent',
  ])
  if (repoMatches) git(['fetch', 'origin', '--quiet'], repoPath, 30_000)
  const currentHead = git(['rev-parse', 'HEAD'], repoPath)
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
  const latestHead = repoMatches ? remoteHead(repoPath, 'origin') : null
  const remoteRef = repoMatches ? `origin/${branch || 'main'}` : null
  const dirty = isDirty(repoPath)
  const updateAvailable = Boolean(
    currentHead && latestHead && currentHead !== latestHead && remoteRef,
  )
  const canSync = remoteRef ? canResetToRemote(repoPath, remoteRef) : false
  const ff = remoteRef ? canFastForward(repoPath, remoteRef) : false
  const canUpdate = Boolean(repoMatches && updateAvailable && !dirty && canSync)

  return {
    id: 'agent',
    label: 'Hermes Agent',
    installKind: 'git',
    version,
    path,
    repoPath,
    branch,
    currentHead,
    latestHead,
    updateAvailable,
    canUpdate,
    state: !repoMatches
      ? 'unsupported'
      : dirty
        ? 'blocked'
        : updateAvailable && canSync
          ? 'available'
          : updateAvailable
            ? 'blocked'
            : 'current',
    reason: !repoMatches
      ? 'Hermes Agent origin remote does not look like hermes-agent.'
      : dirty
        ? 'Hermes Agent checkout has local changes. Commit or stash before updating.'
        : updateAvailable && !canSync
          ? 'Hermes Agent update could not verify the remote branch ref.'
          : updateAvailable && !ff
            ? 'Hermes Agent branch diverged from origin. One-click update will realign to the remote branch.'
            : null,
    updateMode: 'hermes-update',
  }
}

export function readUpdateStatus(): UpdateStatus {
  const workspace = readWorkspaceUpdateStatus()
  const agent = readAgentUpdateStatus()
  return {
    ok: true,
    checkedAt: Date.now(),
    products: { workspace, agent },
    updateAvailable: workspace.updateAvailable || agent.updateAvailable,
    pendingReleaseNotes: readPendingReleaseNotes(),
  }
}

export function applyWorkspaceUpdate(): ApplyUpdateResult {
  const before = readWorkspaceUpdateStatus()
  if (!before.canUpdate || !before.repoPath || !before.branch) {
    return {
      ok: false,
      product: 'workspace',
      output: '',
      restartRequired: false,
      status: before,
      releaseNotes: [],
      error: before.reason || 'Workspace update is not available.',
    }
  }
  const output: Array<string> = []
  output.push(
    execOrThrow('git', ['fetch', 'origin'], {
      cwd: before.repoPath,
      timeout: 60_000,
    }),
  )
  const remoteRef = `origin/${before.branch}`
  if (!canResetToRemote(before.repoPath, remoteRef)) {
    const status = readWorkspaceUpdateStatus()
    return {
      ok: false,
      product: 'workspace',
      output: output.filter(Boolean).join('\n'),
      restartRequired: false,
      status,
      releaseNotes: [],
      error: `${remoteRef} could not be verified.`,
    }
  }
  output.push(syncRepoToRemote(before.repoPath, remoteRef))
  const after = readWorkspaceUpdateStatus()
  const changedFiles =
    before.currentHead && after.currentHead
      ? (git(
          ['diff', '--name-only', before.currentHead, after.currentHead],
          before.repoPath,
          10_000,
        )
          ?.split('\n')
          .filter(Boolean) ?? [])
      : []
  if (
    changedFiles.some(
      (file) => file === 'package.json' || file === 'pnpm-lock.yaml',
    )
  ) {
    output.push(
      execOrThrow('pnpm', ['install', '--no-frozen-lockfile'], {
        cwd: before.repoPath,
        timeout: 180_000,
      }),
    )
  }
  if (
    changedFiles.some(
      (file) =>
        file.startsWith('src/') ||
        file === 'package.json' ||
        file === 'pnpm-lock.yaml' ||
        file.startsWith('vite') ||
        file.startsWith('tsconfig'),
    )
  ) {
    output.push(
      execOrThrow('pnpm', ['build'], {
        cwd: before.repoPath,
        timeout: 240_000,
      }),
    )
  }
  const releaseNotes = [
    {
      product: 'workspace' as const,
      label: 'Hermes Workspace',
      from: before.currentHead,
      to: after.currentHead,
      commits: readCommits(
        before.repoPath,
        before.currentHead,
        after.currentHead,
      ),
    },
  ]
  persistPendingReleaseNotes(releaseNotes)
  return {
    ok: true,
    product: 'workspace',
    output: output.filter(Boolean).join('\n'),
    restartRequired: before.currentHead !== after.currentHead,
    status: after,
    releaseNotes,
  }
}

export function applyAgentUpdate(): ApplyUpdateResult {
  const before = readAgentUpdateStatus()
  if (!before.canUpdate || !before.repoPath) {
    return {
      ok: false,
      product: 'agent',
      output: '',
      restartRequired: false,
      status: before,
      releaseNotes: [],
      error: before.reason || 'Hermes Agent update is not available.',
    }
  }

  const output: Array<string> = []
  output.push(
    execOrThrow('git', ['fetch', 'origin'], {
      cwd: before.repoPath,
      timeout: 60_000,
    }),
  )
  const remoteRef = `origin/${before.branch || 'main'}`
  if (!canResetToRemote(before.repoPath, remoteRef)) {
    const status = readAgentUpdateStatus()
    return {
      ok: false,
      product: 'agent',
      output: output.filter(Boolean).join('\n'),
      restartRequired: false,
      status,
      releaseNotes: [],
      error: `${remoteRef} could not be verified.`,
    }
  }
  output.push(syncRepoToRemote(before.repoPath, remoteRef))

  const after = readAgentUpdateStatus()
  const releaseNotes = [
    {
      product: 'agent' as const,
      label: 'Hermes Agent',
      from: before.currentHead,
      to: after.currentHead,
      commits: readCommits(
        before.repoPath,
        before.currentHead,
        after.currentHead,
      ),
    },
  ]
  persistPendingReleaseNotes(releaseNotes)
  return {
    ok: true,
    product: 'agent',
    output: output.filter(Boolean).join('\n'),
    restartRequired: before.currentHead !== after.currentHead,
    status: after,
    releaseNotes,
  }
}
