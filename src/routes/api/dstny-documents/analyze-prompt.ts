import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getDstnyDocumentRecord } from '../../../server/dstny-documents'
import {
  buildDstnyRagPromptContext,
  getDstnyRagDocumentSources,
} from '../../../server/dstny-rag'

function buildPrompt(title: string, context: string): string {
  return [
    `Analyse le document Dstny suivant : ${title}`,
    '',
    'Objectif : produire une synthese exploitable par Xavier DEMARET, PMM solo.',
    '',
    'Structure attendue :',
    '## Diagnostic Flash',
    "- L'enjeu prioritaire du document.",
    '',
    "## L'Angle Strategique",
    '- Ce que cela change pour le business, le produit, le pricing ou le go-to-market.',
    '',
    '## Plan "Solo"',
    '- 3 actions concretes, priorisees et realisables en moins de 4 heures.',
    '',
    '## Le "Fast-Forward" IA',
    '- Le livrable directement copiable : tableau, email, battle card, matrice ou note de decision.',
    '',
    '## Risque & Next Step',
    '- Les incertitudes, sources a citer, points a valider et prochaine action.',
    '',
    'Contraintes :',
    '- Repondre en francais France.',
    '- Distinguer fait valide, hypothese, interpretation et recommandation.',
    '- Ne pas inventer de source.',
    '- Signaler toute donnee incomplete ou ancienne.',
    '- Ne jamais comparer directement prix wholesale operateur et prix client final.',
    '',
    context,
  ].join('\n')
}

export const Route = createFileRoute('/api/dstny-documents/analyze-prompt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const id = url.searchParams.get('id')?.trim() || ''
        if (!id) return json({ ok: false, error: 'id is required' }, { status: 400 })
        const document = getDstnyDocumentRecord(id)
        if (!document) {
          return json({ ok: false, error: 'Document not found' }, { status: 404 })
        }

        const ragSources =
          document.ingestionStatus === 'indexed'
            ? getDstnyRagDocumentSources({
                title: document.title,
                ragDocId: document.ragDocId,
                collection: document.ragCollection || document.collection,
              })
            : []
        const ragContext = ragSources.length
          ? buildDstnyRagPromptContext({
              status: 'reliable',
              query: document.title,
              sources: ragSources,
              elapsedMs: 0,
            })
          : ''

        const context = [
          'Metadonnees disponibles :',
          `- Collection : ${document.collection}`,
          `- Produit : ${document.product || 'non renseigne'}`,
          `- Canal : ${document.channel}`,
          `- Type : ${document.docType}`,
          `- Statut : ${document.businessStatus}`,
          `- Confiance : ${document.confidence}`,
          `- Source fichier : ${document.originalName}`,
          `- Date document : ${document.documentDate || 'non renseignee'}`,
          `- Resume existant : ${document.summary || 'non renseigne'}`,
          `- Statut RAG : ${document.ingestionStatus}`,
          `- RAG doc_id : ${document.ragDocId || 'non renseigne'}`,
          '',
          ragContext
            ? 'Extraits du document selectionne a utiliser en priorite :'
            : document.ingestionStatus === 'indexed'
              ? 'Le document est marque indexe, mais aucun extrait deterministe n a ete retrouve. Signale ce probleme et demande une reindexation.'
              : 'Le document n est pas encore indexe : demande son indexation ou analyse le fichier fourni si accessible dans la conversation.',
          ragContext,
        ].join('\n')

        return json({
          ok: true,
          document,
          prompt: buildPrompt(document.title, context),
        })
      },
    },
  },
})
