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
  buildStarterContentFields,
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
    expect(bundle?.contentDraft?.markdown).toContain('\n## Promesse\n')
  })

  it('preserves markdown line breaks and does not duplicate sources section', async () => {
    const project = createProject({
      title: 'Fiche produit PDF - Mobile',
      templateId: 'template_fiche_produit_pdf_tous',
    })
    const markdown = buildMarkdownFromContent({
      project,
      templateName: 'Fiche produit PDF - Tous canaux',
      sectionTitles: {
        benefits: 'Bénéfices',
        sources: 'Sources et limites',
      },
      fields: {
        benefits: '- Bénéfice 1\n- Bénéfice 2',
        sources: '- Source produit à rattacher\n- Statut : brouillon',
      },
    })
    const draft = saveProjectContentDraft({
      projectId: project.id,
      fields: {
        benefits: '- Bénéfice 1\n- Bénéfice 2',
        sources: '- Source produit à rattacher\n- Statut : brouillon',
      },
      markdown,
    })

    expect(draft.fields.benefits).toContain('\n- Bénéfice 2')
    expect(draft.markdown).toContain('\n- Bénéfice 2')
    expect((draft.markdown?.match(/## Sources et limites/g) || [])).toHaveLength(1)
  })

  it('suggests business starter content by product family and channel', async () => {
    const project = createProject({
      title: 'Fiche produit PDF - Connectivité FTTO',
      templateId: 'template_fiche_produit_pdf_operateur',
      tags: 'fiche_produit_pdf, connectivite, canal:operateur',
    })
    const fields = buildStarterContentFields({
      project,
      template: {
        id: 'template_fiche_produit_pdf_operateur',
        name: 'Fiche produit PDF - Opérateur / Marque blanche',
        channel: 'operateur',
        sections: [
          { id: 'promise', title: 'Promesse', purpose: '', required: true },
          { id: 'target', title: 'Cible', purpose: '', required: true },
          { id: 'benefits', title: 'Bénéfices', purpose: '', required: true },
          { id: 'pricing', title: 'Pricing', purpose: '', required: true },
        ],
      },
    })

    expect(fields.promise).toContain('connectivité')
    expect(fields.target).toContain('marque blanche')
    expect(fields.benefits).toContain('catalogue')
    expect(fields.pricing).toContain('source tarifaire active')
  })

  it('suggests starter content for mobile, sip trunk and teams families', async () => {
    const sections = [
      { id: 'promise', title: 'Promesse', purpose: '', required: true },
      { id: 'target', title: 'Cible', purpose: '', required: true },
      { id: 'benefits', title: 'Bénéfices', purpose: '', required: true },
      { id: 'offer', title: 'Offre', purpose: '', required: true },
    ]

    const mobile = createProject({
      title: 'Fiche produit PDF - Mobile Pro',
      tags: 'mobile, canal:ambassadeur',
    })
    const sip = createProject({
      title: 'Fiche produit PDF - SIP Trunk',
      tags: 'siptrunk, canal:direct',
    })
    const teams = createProject({
      title: 'Fiche produit PDF - Call2Teams',
      tags: 'teams, canal:operateur',
    })

    expect(buildStarterContentFields({ project: mobile, template: { id: 't', name: 't', channel: 'ambassadeur', sections } }).promise).toContain('brique utile')
    expect(buildStarterContentFields({ project: sip, template: { id: 't', name: 't', channel: 'direct', sections } }).promise).toContain('raccorder la téléphonie')
    expect(buildStarterContentFields({ project: teams, template: { id: 't', name: 't', channel: 'operateur', sections } }).promise).toContain('Microsoft Teams')
  })

  it('uses mobile-specific objections for mobile product sheets', async () => {
    const project = createProject({
      title: 'Fiche produit PDF - Mobile',
      tags: 'mobile, canal:tous',
    })
    const fields = buildStarterContentFields({
      project,
      template: {
        id: 'template_fiche_produit_pdf_tous',
        name: 'Fiche produit PDF - Tous canaux',
        channel: 'tous',
        sections: [
          { id: 'objections', title: 'Objections et réponses', purpose: '', required: true },
        ],
      },
    })

    expect(fields.objections).toContain('couverture réseau')
    expect(fields.objections).toContain('roaming')
    expect(fields.objections).not.toContain('accès moins cher')
    expect(fields.objections).not.toContain('débit')
  })
})
