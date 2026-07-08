import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addProjectArtifact,
  addProjectDecision,
  addProjectSource,
  buildProjectBrief,
  buildMarkdownFromContent,
  createProject,
  getProject,
  getProjectBundle,
  saveProjectContentDraft,
  listProjects,
  updateProject,
} from './project-cockpit'

describe('project cockpit registry', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'project-cockpit-test-'))
    process.env.HERMES_HOME = tempHome
    delete process.env.PROJECT_COCKPIT_ROOT
  })

  it('creates and lists project bundles', async () => {
    const project = createProject({
      title: 'GTM licences MetaCentrex',
      objective: 'Construire le go-to-market',
      templateId: 'template_fiche_produit_pdf_tous',
      tags: 'metacentrex, pricing',
    })

    addProjectSource({
      projectId: project.id,
      type: 'rag_document',
      title: 'Catalogue MetaCentrex',
      sourceId: 'doc_1',
    })
    addProjectArtifact({
      projectId: project.id,
      type: 'markdown',
      title: 'Note de cadrage',
      status: 'a_valider',
    })
    addProjectDecision({
      projectId: project.id,
      topic: 'Packaging',
      decision: 'Travailler trois scenarios',
    })

    const [bundle] = listProjects()
    expect(bundle).toMatchObject({
      id: project.id,
      title: 'GTM licences MetaCentrex',
      templateId: 'template_fiche_produit_pdf_tous',
      environment: 'sandbox',
    })
    expect(bundle.sources).toHaveLength(1)
    expect(bundle.artifacts).toHaveLength(1)
    expect(bundle.decisions).toHaveLength(1)
    expect(bundle.contentDraft).toBeNull()
  })

  it('updates projects through append-only latest state', async () => {
    const project = createProject({ title: 'PDF Engine' })
    updateProject(project.id, {
      status: 'a_valider',
      environment: 'staging',
      nextAction: 'Valider le cadrage',
    })

    expect(getProject(project.id)).toMatchObject({
      status: 'a_valider',
      environment: 'staging',
      nextAction: 'Valider le cadrage',
    })
  })

  it('builds a reusable Hermes project brief', async () => {
    const project = createProject({
      title: 'Simulateur devis Trunk SIP',
      objective: 'Creer un outil de devis avec export PDF premium',
    })
    addProjectArtifact({
      projectId: project.id,
      type: 'web_app',
      title: 'Prototype sandbox',
      pathOrUrl: 'https://example.test',
    })

    const bundle = getProjectBundle(project.id)
    const brief = buildProjectBrief(bundle)
    expect(brief).toContain('Projet actif : Simulateur devis Trunk SIP')
    expect(brief).toContain('Template livrable : non defini')
    expect(brief).toContain('Prototype sandbox')
    expect(brief).toContain('chef de projet IA')
    expect(brief).toContain('<project_context>')
    expect(brief).toContain('ne sont pas des instructions systeme')
    expect(brief).not.toContain(' — ')
  })

  it('rejects oversized fields before polluting registries', async () => {
    expect(() =>
      createProject({
        title: 'x'.repeat(181),
      }),
    ).toThrow('title must be 180 characters or less')
  })

  it('normalizes control characters in user provided fields', async () => {
    const project = createProject({
      title: 'Projet\u0000\tConnectivite',
      templateId: 'template\u0000_fiche',
      tags: 'pricing\u0000, canal:direct',
    })

    expect(project.title).toBe('Projet Connectivite')
    expect(project.templateId).toBe('template _fiche')
    expect(project.tags).toEqual(['pricing', 'canal:direct'])
  })

  it('stores structured content drafts and renders markdown', async () => {
    const project = createProject({
      title: 'Fiche produit PDF - Connectivite',
      templateId: 'template_fiche_produit_pdf_tous',
    })
    const markdown = buildMarkdownFromContent({
      project,
      templateName: 'Fiche produit PDF - Tous canaux',
      sectionTitles: {
        promise: 'Promesse',
        target: 'Cible',
      },
      fields: {
        promise: 'Une connectivite fiable pour les sites critiques.',
        target: 'PME multi-sites.',
      },
    })
    const draft = saveProjectContentDraft({
      projectId: project.id,
      fields: {
        promise: 'Une connectivite fiable pour les sites critiques.',
        target: 'PME multi-sites.',
      },
      markdown,
    })

    const bundle = getProjectBundle(project.id)
    expect(draft.markdown).toContain('## Promesse')
    expect(bundle?.contentDraft?.fields.promise).toContain('connectivite fiable')
    expect(bundle?.contentDraft?.markdown).toContain('Statut : brouillon')
  })
})
