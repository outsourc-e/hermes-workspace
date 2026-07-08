import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { getProjectBundle } from './project-cockpit'
import { prepareProductSheetProject } from './dstny-agent-actions'

describe('dstny agent actions', () => {
  beforeEach(() => {
    process.env.HERMES_HOME = mkdtempSync(join(tmpdir(), 'dstny-agent-actions-'))
    delete process.env.PROJECT_COCKPIT_ROOT
  })

  it('prepares a product sheet project from a simple business request', () => {
    const result = prepareProductSheetProject({
      request: 'Crée-moi une fiche produit SIP Trunk pour les ambassadeurs',
    })

    expect(result.project.title).toContain('SIP Trunk')
    expect(result.project.templateId).toBe('template_fiche_produit_pdf_ambassadeur')
    expect(result.project.tags).toContain('siptrunk')
    expect(result.project.tags).toContain('canal:ambassadeur')
    expect(result.markdown).toContain('raccorder la téléphonie')
    expect(result.brief).toContain('Projet actif')

    const bundle = getProjectBundle(result.project.id)
    expect(bundle?.sources[0]?.title).toBe('Expression de besoin initiale')
    expect(bundle?.artifacts[0]?.title).toContain('Brouillon fiche produit')
    expect(bundle?.decisions[0]?.topic).toBe('Mode de production')
    expect(bundle?.contentDraft?.fields.promise).toContain('raccorder la téléphonie')
  })

  it('updates an existing project instead of forcing a new one', () => {
    const first = prepareProductSheetProject({
      product: 'Connectivité FTTO',
      channel: 'direct',
    })
    const second = prepareProductSheetProject({
      projectId: first.project.id,
      request: 'Adapter la fiche pour les opérateurs en marque blanche',
    })

    expect(second.project.id).toBe(first.project.id)
    expect(second.project.templateId).toBe('template_fiche_produit_pdf_operateur')
    expect(second.project.tags).toContain('canal:operateur')
    expect(second.markdown).toContain('marque blanche')
  })
})
