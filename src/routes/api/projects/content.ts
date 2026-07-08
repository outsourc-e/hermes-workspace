import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getTemplate } from '../../../server/dstny-templates'
import {
  addProjectArtifact,
  buildMarkdownFromContent,
  getProject,
  getProjectContentDraft,
  saveProjectContentDraft,
  type SaveProjectContentDraftInput,
} from '../../../server/project-cockpit'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/projects/content')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const projectId = url.searchParams.get('projectId')?.trim() || ''
        if (!projectId) return json({ ok: false, error: 'projectId is required' }, { status: 400 })
        const draft = getProjectContentDraft(projectId)
        return json({ ok: true, draft })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as SaveProjectContentDraftInput & {
            action?: 'save' | 'generate_markdown'
            createArtifact?: boolean
          }
          const project = getProject(body.projectId)
          if (!project) return json({ ok: false, error: 'Project not found' }, { status: 404 })

          let markdown = body.markdown
          const template = getTemplate(body.templateId || project.templateId || '')
          if (body.action === 'generate_markdown') {
            const sectionTitles = Object.fromEntries(
              (template?.sections || []).map((section) => [section.id, section.title]),
            )
            markdown = buildMarkdownFromContent({
              project,
              templateName: template?.name,
              sectionTitles,
              fields: body.fields || {},
            })
          }

          const draft = saveProjectContentDraft({
            ...body,
            templateId: body.templateId || project.templateId,
            markdown,
          })

          const artifact = body.createArtifact && markdown
            ? addProjectArtifact({
                projectId: project.id,
                type: 'markdown',
                title: `Brouillon Markdown - ${draft.version}`,
                pathOrUrl: 'Contenu enregistré dans le Studio contenu',
                status: 'brouillon',
                version: draft.version,
                producedBy: 'Hermes Document Studio',
              })
            : null

          return json({ ok: true, draft, artifact })
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : 'Failed to save content draft' },
            { status: 400 },
          )
        }
      },
    },
  },
})
