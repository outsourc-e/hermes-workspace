import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated, requireLocalOrAuth } from '../../server/auth-middleware'
import { deleteWorkspaceSkill, listWorkspaceSkills, readWorkspaceSkill, updateWorkspaceSkill } from '../../server/skills-store'
import { getClientIp, rateLimit, rateLimitResponse, requireJsonContentType, safeErrorMessage } from '../../server/rate-limit'

export const Route = createFileRoute('/api/skills')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const ip = getClientIp(request)
        if (!rateLimit(`skills:get:${ip}`, 80, 60_000)) return rateLimitResponse()
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id')
          if (id) return json({ ok: true, skill: await readWorkspaceSkill(id) })
          return json({ ok: true, skills: await listWorkspaceSkills() })
        } catch (error) {
          return json({ ok: false, error: safeErrorMessage(error) }, { status: 400 })
        }
      },
      PUT: async ({ request }) => {
        if (!requireLocalOrAuth(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const contentTypeCheck = requireJsonContentType(request)
        if (contentTypeCheck) return contentTypeCheck
        const ip = getClientIp(request)
        if (!rateLimit(`skills:put:${ip}`, 20, 60_000)) return rateLimitResponse()
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>
          const id = String(body.id || '')
          const content = String(body.content || '')
          const skill = await updateWorkspaceSkill(id, content)
          return json({ ok: true, skill, backupPath: skill.backupPath })
        } catch (error) {
          return json({ ok: false, error: safeErrorMessage(error) }, { status: 400 })
        }
      },
      DELETE: async ({ request }) => {
        if (!requireLocalOrAuth(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const ip = getClientIp(request)
        if (!rateLimit(`skills:delete:${ip}`, 10, 60_000)) return rateLimitResponse()
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id') || ''
          const confirm = url.searchParams.get('confirm') || ''
          if (confirm !== id) return json({ ok: false, error: 'Delete requires matching confirm parameter' }, { status: 400 })
          return json(await deleteWorkspaceSkill(id))
        } catch (error) {
          return json({ ok: false, error: safeErrorMessage(error) }, { status: 400 })
        }
      },
    },
  },
})
