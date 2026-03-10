import { Router } from 'express'
import { Tracker } from '../tracker'

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  return (
    error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    error.code === 'SQLITE_CONSTRAINT_UNIQUE'
  )
}

export function createTeamsRouter(tracker: Tracker): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({ teams: tracker.listTeams() })
  })

  router.post('/', (req, res) => {
    const { id, name, description, permissions } = req.body as {
      id?: string
      name?: string
      description?: string | null
      permissions?: unknown
    }

    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'name is required' })
      return
    }

    const normalizedPermissions = Array.isArray(permissions)
      ? permissions.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : []

    try {
      const team = tracker.createTeam({
        id: id?.trim() || undefined,
        name: name.trim(),
        description: description ?? null,
        permissions: normalizedPermissions,
      })
      res.status(201).json(team)
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ error: 'Team already exists' })
        return
      }

      throw error
    }
  })

  return router
}
