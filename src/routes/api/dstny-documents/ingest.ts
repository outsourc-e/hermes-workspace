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
          const updated = updateDstnyDocumentRecord(id, {
            ingestionStatus: 'indexed',
            ragCollection: document.collection,
            ingestedAt: new Date().toISOString(),
            lastError: null,
          })

          return json({
            ok: true,
            document: updated,
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
