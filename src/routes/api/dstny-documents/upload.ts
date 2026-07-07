import fs from 'node:fs/promises'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  createDstnyDocumentRecord,
  getDstnyDocumentRoot,
  sanitizeDstnyFileName,
  type CreateDstnyDocumentInput,
} from '../../../server/dstny-documents'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
} from '../../../server/rate-limit'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function formString(form: FormData, key: string): string | null {
  const value = form.get(key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredFormString(form: FormData, key: string): string {
  const value = formString(form, key)
  if (!value) throw new Error(`${key} is required`)
  return value
}

function titleFromFileName(originalName: string): string {
  const parsed = path.parse(originalName)
  const base = parsed.name || originalName || 'Document'
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferredTitle(form: FormData, originalName: string): string {
  const explicitTitle = formString(form, 'title')
  if (explicitTitle) return explicitTitle

  const baseTitle = titleFromFileName(originalName)
  const product = formString(form, 'product')
  const version = formString(form, 'version')
  const documentDate = formString(form, 'documentDate')
  const suffix = [product, version, documentDate].filter(Boolean).join(' - ')
  return suffix ? `${baseTitle} - ${suffix}` : baseTitle
}

function storedFileName(originalName: string): string {
  const parsed = path.parse(sanitizeDstnyFileName(originalName))
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const base = parsed.name || 'document'
  return `${base}-${suffix}${parsed.ext}`
}

export const Route = createFileRoute('/api/dstny-documents/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`dstny-documents-upload:${ip}`, 20, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const contentType = request.headers.get('content-type') || ''
          if (!contentType.includes('multipart/form-data')) {
            return json(
              { ok: false, error: 'multipart/form-data required' },
              { status: 400 },
            )
          }

          const form = await request.formData()
          const file = form.get('file')
          if (!(file instanceof File)) {
            return json({ ok: false, error: 'file is required' }, { status: 400 })
          }
          if (file.size <= 0) {
            return json({ ok: false, error: 'file is empty' }, { status: 400 })
          }
          if (file.size > MAX_UPLOAD_BYTES) {
            return json(
              { ok: false, error: 'file exceeds 50 MB limit' },
              { status: 413 },
            )
          }

          const root = getDstnyDocumentRoot()
          await fs.mkdir(root, { recursive: true })
          const storedName = storedFileName(file.name || 'document')
          const destination = path.join(root, storedName)
          const relative = path.relative(root, destination)
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return json({ ok: false, error: 'Invalid file name' }, { status: 400 })
          }

          const buffer = Buffer.from(await file.arrayBuffer())
          await fs.writeFile(destination, buffer)

          const originalName = file.name || storedName
          const input: CreateDstnyDocumentInput = {
            title: inferredTitle(form, originalName),
            filePath: destination,
            originalName,
            storedName,
            mimeType: file.type || 'application/octet-stream',
            collection: requiredFormString(form, 'collection') as CreateDstnyDocumentInput['collection'],
            product: formString(form, 'product'),
            channel: requiredFormString(form, 'channel') as CreateDstnyDocumentInput['channel'],
            docType: requiredFormString(form, 'docType') as CreateDstnyDocumentInput['docType'],
            businessStatus: requiredFormString(form, 'businessStatus') as CreateDstnyDocumentInput['businessStatus'],
            confidence: requiredFormString(form, 'confidence') as CreateDstnyDocumentInput['confidence'],
            documentDate: formString(form, 'documentDate'),
            supplier: formString(form, 'supplier'),
            owner: formString(form, 'owner'),
            version: formString(form, 'version'),
            summary: formString(form, 'summary'),
            keywords: formString(form, 'keywords'),
          }

          const document = createDstnyDocumentRecord(input)
          return json({ ok: true, document })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to upload Dstny document',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
