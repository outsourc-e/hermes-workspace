import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  deleteWorkspaceSkill,
  listWorkspaceSkills,
  readWorkspaceSkill,
  updateWorkspaceSkill,
} from '../../server/skills-store'
import { isAuthenticated, requireLocalOrAuth } from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
  safeErrorMessage,
} from '../../server/rate-limit'
import type { WorkspaceSkillSummary } from '../../server/skills-store'

function normalizeWorkspaceSkill(
  skill: WorkspaceSkillSummary,
  content = '',
) {
  const tags = skill.category === 'local' ? [] : skill.category.split('/')
  return {
    ...skill,
    slug: skill.id,
    author: 'Local Hermes',
    triggers: [] as Array<string>,
    tags,
    homepage: null,
    icon: '🧩',
    content,
    fileCount: 1,
    sourcePath: skill.path,
    installed: true,
    enabled: true,
    origin: 'agent-created' as const,
  }
}

export const Route = createFileRoute('/api/skills')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const ip = getClientIp(request)
        if (!rateLimit(`skills:get:${ip}`, 80, 60_000)) {
          return rateLimitResponse()
        }
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id')
          if (id) {
            const skill = await readWorkspaceSkill(id)
            return json({
              ok: true,
              skill: normalizeWorkspaceSkill(skill, skill.content),
            })
          }

          const query = (url.searchParams.get('search') ?? '').trim().toLowerCase()
          const category = url.searchParams.get('category') ?? 'All'
          const origin = url.searchParams.get('origin') ?? 'All'
          const sort = url.searchParams.get('sort') ?? 'name'
          const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
          const limit = Math.min(
            200,
            Math.max(1, Number(url.searchParams.get('limit') ?? 30) || 30),
          )
          const allSkills = (await listWorkspaceSkills()).map((skill) =>
            normalizeWorkspaceSkill(skill),
          )
          const categories = [
            'All',
            ...Array.from(new Set(allSkills.map((skill) => skill.category))).sort(),
          ]
          const filtered = allSkills.filter((skill) => {
            if (origin !== 'All' && skill.origin !== origin) return false
            if (category !== 'All' && skill.category !== category) return false
            if (!query) return true
            return [skill.name, skill.title, skill.description, ...skill.tags]
              .join('\n')
              .toLowerCase()
              .includes(query)
          })
          filtered.sort((left, right) =>
            sort === 'category'
              ? left.category.localeCompare(right.category) ||
                left.name.localeCompare(right.name)
              : left.name.localeCompare(right.name),
          )
          const start = (page - 1) * limit
          return json({
            ok: true,
            skills: filtered.slice(start, start + limit),
            total: filtered.length,
            page,
            categories,
            source: 'local-workspace',
          })
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 400 },
          )
        }
      },
      PUT: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeCheck = requireJsonContentType(request)
        if (contentTypeCheck) return contentTypeCheck
        const ip = getClientIp(request)
        if (!rateLimit(`skills:put:${ip}`, 20, 60_000)) {
          return rateLimitResponse()
        }
        try {
          const body = (await request
            .json()
            .catch(() => ({}))) as Record<string, unknown>
          const id = String(body.id || '')
          const content = String(body.content || '')
          const skill = await updateWorkspaceSkill(id, content)
          return json({
            ok: true,
            skill: normalizeWorkspaceSkill(skill, skill.content),
            backupPath: skill.backupPath,
          })
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 400 },
          )
        }
      },
      DELETE: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const ip = getClientIp(request)
        if (!rateLimit(`skills:delete:${ip}`, 10, 60_000)) {
          return rateLimitResponse()
        }
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id') || ''
          const confirm = url.searchParams.get('confirm') || ''
          if (confirm !== id) {
            return json(
              { ok: false, error: 'Delete requires matching confirm parameter' },
              { status: 400 },
            )
          }
          return json(await deleteWorkspaceSkill(id))
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 400 },
          )
        }
      },
    },
  },
})
