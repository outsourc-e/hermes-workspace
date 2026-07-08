import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTemplate, listTemplates } from './dstny-templates'

describe('Dstny template library', () => {
  beforeEach(() => {
    process.env.HERMES_HOME = mkdtempSync(join(tmpdir(), 'dstny-templates-test-'))
    delete process.env.TEMPLATE_LIBRARY_ROOT
  })

  it('lists default product sheet templates', () => {
    const templates = listTemplates()
    expect(templates.map((template) => template.id)).toEqual(
      expect.arrayContaining([
        'template_fiche_produit_pdf_tous',
        'template_fiche_produit_pdf_direct',
        'template_fiche_produit_pdf_ambassadeur',
        'template_fiche_produit_pdf_operateur',
      ]),
    )
    expect(templates[0].sections.length).toBeGreaterThan(3)
  })

  it('exposes prompts and blocking quality rules', () => {
    const template = getTemplate('template_fiche_produit_pdf_operateur')
    expect(template?.prompts.pricing).toContain('prix public')
    expect(template?.qualityRules.some((rule) => rule.severity === 'blocking')).toBe(true)
  })
})
