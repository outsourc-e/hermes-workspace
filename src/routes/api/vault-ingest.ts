/**
 * POST /api/vault-ingest — drop a file into the knowledge vault.
 *
 * Body: { name: string, contentBase64: string }
 * Saves the raw file under vault/inbox/, writes a companion markdown note
 * (metadata + text excerpt for text-like files) so the RAG index picks it
 * up, then kicks an async index refresh.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { refreshRagIndex } from '../../server/rag-index'

const MAX_BYTES = 25 * 1024 * 1024
const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.jsonl', '.csv', '.ts', '.tsx', '.js', '.mjs',
  '.py', '.sh', '.yaml', '.yml', '.toml', '.html', '.css', '.log',
])

function vaultInboxDir(): string {
  const vault =
    process.env.HERMES_KNOWLEDGE_VAULT || join(homedir(), 'workspace', 'vault')
  return join(vault, 'inbox')
}

function sanitizeName(name: string): string {
  const base = basename(name).replace(/[^\w.\- ]+/g, '_').trim()
  return base || `file-${Date.now()}`
}

export const Route = createFileRoute('/api/vault-ingest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { name?: unknown; contentBase64?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const rawName = typeof body.name === 'string' ? body.name : ''
        const b64 =
          typeof body.contentBase64 === 'string' ? body.contentBase64 : ''
        if (!rawName || !b64) {
          return json(
            { ok: false, error: 'name and contentBase64 required' },
            { status: 400 },
          )
        }
        let buffer: Buffer
        try {
          buffer = Buffer.from(b64, 'base64')
        } catch {
          return json({ ok: false, error: 'Bad base64' }, { status: 400 })
        }
        if (!buffer.length || buffer.length > MAX_BYTES) {
          return json(
            { ok: false, error: `File must be 1 byte – ${MAX_BYTES} bytes` },
            { status: 400 },
          )
        }

        const dir = vaultInboxDir()
        mkdirSync(dir, { recursive: true })
        let name = sanitizeName(rawName)
        if (existsSync(join(dir, name))) {
          const ext = extname(name)
          name = `${name.slice(0, name.length - ext.length)}-${Date.now().toString(36)}${ext}`
        }
        const filePath = join(dir, name)
        writeFileSync(filePath, buffer)

        // Companion note makes the drop searchable even for binary files.
        const ext = extname(name).toLowerCase()
        const isText = TEXT_EXTENSIONS.has(ext)
        const excerpt = isText
          ? buffer.toString('utf8').slice(0, 4000)
          : '(binary file — no text excerpt)'
        const notePath = join(dir, `${name}.note.md`)
        // .md drops are indexed directly; everything else gets the note.
        if (ext !== '.md') {
          writeFileSync(
            notePath,
            [
              `# Inbox drop: ${name}`,
              '',
              `- ingested: ${new Date().toISOString()}`,
              `- size: ${buffer.length} bytes`,
              `- original name: ${rawName.slice(0, 200)}`,
              '',
              '## Content excerpt',
              '',
              excerpt,
              '',
            ].join('\n'),
            'utf8',
          )
        }

        // Refresh the semantic index in the background — don't block the drop.
        void refreshRagIndex(true).catch(() => {})

        return json({ ok: true, saved: filePath, indexed: true })
      },
    },
  },
})
