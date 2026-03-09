import { Router } from 'express'
import { Tracker } from '../tracker'

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

  router.get('/:id', (req, res) => {
    const project = tracker.getProjectDetail(req.params.id)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json(project)
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
    const project = tracker.updateProject(req.params.id, req.body)
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json(project)
  })

  router.delete('/:id', (req, res) => {
    const deleted = tracker.deleteProject(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.status(204).send()
  })

  return router
}
