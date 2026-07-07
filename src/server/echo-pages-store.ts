/**
 * Persistent store for Echo Studio pages.
 *
 * Echo Studio turns a natural-language prompt into a workspace tool/page by
 * saving a spec here and dispatching a build mission to the swarm builder.
 * Specs persist to `.runtime/echo-pages.json` (same runtime dir as swarm
 * missions) so the Manage tab survives restarts. Writes are atomic.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { resolve } from 'node:path'

export type EchoPageStatus = 'draft' | 'building' | 'ready' | 'failed'

export type EchoPage = {
  id: string
  title: string
  prompt: string
  status: EchoPageStatus
  createdAt: number
  updatedAt: number
  missionId: string | null
  note: string | null
}

type EchoStore = { version: 1; pages: Array<EchoPage> }

function storePath(): string {
  return join(resolve(process.cwd()), '.runtime', 'echo-pages.json')
}

function readStore(): EchoStore {
  const path = storePath()
  if (!existsSync(path)) return { version: 1, pages: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<EchoStore>
    return { version: 1, pages: Array.isArray(parsed.pages) ? parsed.pages : [] }
  } catch {
    return { version: 1, pages: [] }
  }
}

function writeStore(store: EchoStore): void {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, path)
}

function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'page'
  )
}

export function listEchoPages(): Array<EchoPage> {
  return readStore().pages.sort((a, b) => b.createdAt - a.createdAt)
}

export function createEchoPage(input: {
  id?: string
  title: string
  prompt: string
  now: number
}): EchoPage {
  const store = readStore()
  const base = slugify(input.id || input.title)
  let id = base
  let n = 2
  while (store.pages.some((p) => p.id === id)) id = `${base}-${n++}`
  const page: EchoPage = {
    id,
    title: input.title.trim(),
    prompt: input.prompt.trim(),
    status: 'draft',
    createdAt: input.now,
    updatedAt: input.now,
    missionId: null,
    note: null,
  }
  store.pages.push(page)
  writeStore(store)
  return page
}

export function updateEchoPage(
  id: string,
  patch: Partial<Pick<EchoPage, 'status' | 'missionId' | 'note'>>,
  now: number,
): EchoPage | null {
  const store = readStore()
  const page = store.pages.find((p) => p.id === id)
  if (!page) return null
  if (patch.status !== undefined) page.status = patch.status
  if (patch.missionId !== undefined) page.missionId = patch.missionId
  if (patch.note !== undefined) page.note = patch.note
  page.updatedAt = now
  writeStore(store)
  return page
}

export function deleteEchoPage(id: string): boolean {
  const store = readStore()
  const before = store.pages.length
  store.pages = store.pages.filter((p) => p.id !== id)
  if (store.pages.length === before) return false
  writeStore(store)
  return true
}
