import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Router } from 'express'
import { Tracker } from '../tracker'

const execFileAsync = promisify(execFile)

async function runGitCommand(projectPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: projectPath,
    timeout: 10_000,
  })

  return stdout.trim()
}

async function getProjectGitStatus(projectPath: string | null | undefined) {
  if (!projectPath) {
    return {
      branch: null,
      commit_hash: null,
      commit_message: null,
      commit_date: null,
    }
  }

  try {
    const [branch, commitLine] = await Promise.all([
      runGitCommand(projectPath, ['branch', '--show-current']),
      runGitCommand(projectPath, ['log', '-1', '--format=%h%x00%s%x00%ai']),
    ])
    const [commit_hash, commit_message, commit_date] = commitLine.split('\x00')

    return {
      branch: branch || null,
      commit_hash: commit_hash?.trim() || null,
      commit_message: commit_message?.trim() || null,
      commit_date: commit_date?.trim() || null,
    }
  } catch {
    return {
      branch: null,
      commit_hash: null,
      commit_message: null,
      commit_date: null,
    }
  }
}

export function createProjectsRouter(tracker: Tracker): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(tracker.listProjects())
  })

  router.post('/', (req, res) => {
    const {
      name,
      path,
      spec,
      auto_approve,
      max_concurrent,
      required_checks,
      allowed_tools,
    } = req.body as {
      name?: string
      path?: string | null
      spec?: string | null
      auto_approve?: number | boolean | null
      max_concurrent?: number | null
      required_checks?: string | string[] | null
      allowed_tools?: string | string[] | null
    }
    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'name is required' })
      return
    }

    if (
      max_concurrent !== undefined &&
      (typeof max_concurrent !== 'number' || Number.isNaN(Number(max_concurrent)))
    ) {
      res.status(400).json({ error: 'max_concurrent must be a number' })
      return
    }

    const normalizedChecks = Array.isArray(required_checks)
      ? required_checks.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : typeof required_checks === 'string'
        ? required_checks
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : ['tsc']
    const normalizedTools = Array.isArray(allowed_tools)
      ? allowed_tools.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : typeof allowed_tools === 'string'
        ? allowed_tools
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : ['git', 'shell']
    const normalizedMaxConcurrent = Math.max(1, Math.trunc(max_concurrent ?? 2))

    const project = tracker.createProject({
      name: name.trim(),
      path: path ?? null,
      spec: spec ?? null,
      auto_approve: auto_approve ? 1 : 0,
      max_concurrent: normalizedMaxConcurrent,
      required_checks: normalizedChecks.join(','),
      allowed_tools: normalizedTools.join(','),
    })
    res.status(201).json(project)
  })

  router.get('/:id', async (req, res) => {
    const project = tracker.getProjectDetail(req.params.id)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json({
      ...project,
      git_status: await getProjectGitStatus(project.path),
    })
  })

  router.get('/:id/git-status', async (req, res) => {
    const project = tracker.getProject(req.params.id)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    res.json(await getProjectGitStatus(project.path))
  })

  router.put('/:id', (req, res) => {
    const project = tracker.updateProject(req.params.id, req.body)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json(project)
  })

  router.patch('/:id', (req, res) => {
    const updates = req.body as {
      status?: unknown
      [key: string]: unknown
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, 'status') &&
      typeof updates.status !== 'string'
    ) {
      res.status(400).json({ error: 'status must be a string' })
      return
    }

    const project = tracker.updateProject(req.params.id, updates as Partial<import('../types').CreateProjectInput>)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json(project)
  })

  router.delete('/:id', (req, res) => {
    const project = tracker.getProject(req.params.id)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    tracker.deleteProject(req.params.id)
    res.json({ ok: true })
  })

  return router
}
