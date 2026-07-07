import { describe, expect, it } from 'vitest'
import {
  appendDstnyRagContextToMessage,
  buildDstnyRagPromptContext,
  normalizeDstnyRagSources,
  shouldUseDstnyRag,
  type DstnyRagContext,
} from './dstny-rag'

describe('dstny rag helpers', () => {
  it('enables retrieval for Dstny business questions and explicit source requests', () => {
    expect(shouldUseDstnyRag('Quels sont les tarifs MetaCentrex ?')).toBe(true)
    expect(shouldUseDstnyRag('Réponds avec sources sur cette offre')).toBe(true)
    expect(shouldUseDstnyRag('Bonjour')).toBe(false)
    expect(shouldUseDstnyRag('Sans RAG, aide-moi à reformuler')).toBe(false)
  })

  it('normalizes heterogeneous RAG search payloads into bounded sources', () => {
    const sources = normalizeDstnyRagSources({
      results: [
        {
          text: 'Le Socle Entreprise inclut le groupement et les règles de routage.',
          score: 0.82,
          metadata: {
            title: 'Catalogue MetaCentrex',
            document_id: 'doc_1',
            chunk_id: 'chunk_1',
            project: 'metacentrex_alianza',
            product: 'metacentrex',
            canal: 'operateur',
          },
        },
      ],
    })

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      id: 'S1',
      title: 'Catalogue MetaCentrex',
      documentId: 'doc_1',
      chunkId: 'chunk_1',
      collection: 'metacentrex_alianza',
      channel: 'operateur',
    })
  })

  it('builds a source contract and prepends it to the user message', () => {
    const context: DstnyRagContext = {
      status: 'partial',
      query: 'pricing',
      elapsedMs: 12,
      sources: [
        {
          id: 'S1',
          title: 'Pricing',
          documentId: 'doc_1',
          chunkId: 'chunk_1',
          collection: 'pricing',
          product: 'metacentrex',
          channel: 'operateur',
          documentDate: '2026-01-01',
          version: 'v1',
          score: 0.8,
          excerpt: 'Prix partenaire wholesale.',
        },
      ],
    }

    const prompt = buildDstnyRagPromptContext(context)
    expect(prompt).toContain('[S1]')
    expect(prompt).toContain('Ne melange pas Direct')
    expect(appendDstnyRagContextToMessage('Question', context)).toContain('Question utilisateur:')
  })
})
