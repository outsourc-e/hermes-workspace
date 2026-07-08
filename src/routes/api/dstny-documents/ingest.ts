import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getDstnyDocumentRecord,
  updateDstnyDocumentRecord,
} from '../../../server/dstny-documents'
import { requireJsonContentType } from '../../../server/rate-limit'

const execFileAsync = promisify(execFile)

function ingestCommand(): string {
  return (
    process.env.DSTNY_RAG_INGEST_COMMAND?.trim() ||
    '/home/node/.hermes/bin/dstny-rag-ingest-file'
  )
}

function parseRagIngestStdout(stdout: string): {
  docId: string | null
  chunks: number | null
} {
  try {
    const parsed = JSON.parse(stdout) as { doc_id?: unknown; chunks?: unknown }
    return {
      docId: typeof parsed.doc_id === 'string' ? parsed.doc_id : null,
      chunks: typeof parsed.chunks === 'number' ? parsed.chunks : null,
    }
  } catch {
    return { docId: null, chunks: null }
  }
}

export const Route = createFileRoute('/api/dstny-documents/ingest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        let id = ''
        try {
          const body = (await request.json().catch(() => ({}))) as { id?: unknown }
          id = typeof body.id === 'string' ? body.id.trim() : ''
          if (!id) return json({ ok: false, error: 'id is required' }, { status: 400 })

          const document = getDstnyDocumentRecord(id)
          if (!document) {
            return json({ ok: false, error: 'Document not found' }, { status: 404 })
          }

          updateDstnyDocumentRecord(id, { ingestionStatus: 'ingesting', lastError: null })
          const args = [
            document.filePath,
            '--collection',
            document.collection,
            '--title',
            document.title,
            '--channel',
            document.channel,
            '--doc-type',
            document.docType,
            '--status',
            document.businessStatus,
            '--confidence',
            document.confidence,
          ]
          if (document.product) args.push('--product', document.product)
          for (const keyword of document.keywords) {
            args.push('--tag', keyword)
          }

          const result = await execFileAsync(ingestCommand(), args, {
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
          })
          const ragResult = parseRagIngestStdout(result.stdout?.toString() || '')
          const updated = updateDstnyDocumentRecord(id, {
            ingestionStatus: 'indexed',
            ragDocId: ragResult.docId,
            ragCollection: document.collection,
            ingestedAt: new Date().toISOString(),
            lastError: null,
          })

          return json({
            ok: true,
            document: updated,
            rag: ragResult,
            stdout: result.stdout?.toString() || '',
            stderr: result.stderr?.toString() || '',
          })
        } catch (error) {
          if (id) {
            updateDstnyDocumentRecord(id, {
              ingestionStatus: 'error',
              lastError:
                error instanceof Error
                  ? error.message
                  : 'Failed to ingest Dstny document',
            })
          }
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to ingest Dstny document',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
