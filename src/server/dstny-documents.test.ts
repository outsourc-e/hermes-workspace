import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempHome: string
let originalHermesHome: string | undefined
let originalClaudeHome: string | undefined
let originalDocumentRoot: string | undefined
let originalDocumentRegistry: string | undefined

async function loadModule() {
  vi.resetModules()
  return await import('./dstny-documents')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'dstny-documents-test-'))
  originalHermesHome = process.env.HERMES_HOME
  originalClaudeHome = process.env.CLAUDE_HOME
  originalDocumentRoot = process.env.DSTNY_DOCUMENT_ROOT
  originalDocumentRegistry = process.env.DSTNY_DOCUMENT_REGISTRY
  process.env.HERMES_HOME = tempHome
  delete process.env.CLAUDE_HOME
  delete process.env.DSTNY_DOCUMENT_ROOT
  delete process.env.DSTNY_DOCUMENT_REGISTRY
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  if (originalClaudeHome === undefined) delete process.env.CLAUDE_HOME
  else process.env.CLAUDE_HOME = originalClaudeHome
  if (originalDocumentRoot === undefined) delete process.env.DSTNY_DOCUMENT_ROOT
  else process.env.DSTNY_DOCUMENT_ROOT = originalDocumentRoot
  if (originalDocumentRegistry === undefined) delete process.env.DSTNY_DOCUMENT_REGISTRY
  else process.env.DSTNY_DOCUMENT_REGISTRY = originalDocumentRegistry
  vi.resetModules()
})

function writeSampleFile(name = 'sample.pdf') {
  const filePath = join(tempHome, name)
  writeFileSync(filePath, 'PDF-ish content for Dstny')
  return filePath
}

describe('dstny-documents registry', () => {
  it('creates an append-only document record with required metadata', async () => {
    const mod = await loadModule()
    const filePath = writeSampleFile('Meta Centrex offer.pdf')
    const doc = mod.createDstnyDocumentRecord({
      title: 'MetaCentrex offer',
      filePath,
      collection: 'metacentrex_alianza',
      product: 'metacentrex',
      channel: 'operateur',
      docType: 'contrat',
      businessStatus: 'actif',
      confidence: 'moyen',
      keywords: 'metacentrex, alianza, metacentrex',
    })

    expect(doc.id).toMatch(/^doc_[a-f0-9]{16}$/)
    expect(doc.storedName).toBe('Meta-Centrex-offer.pdf')
    expect(doc.sizeBytes).toBeGreaterThan(0)
    expect(doc.checksumSha256).toHaveLength(64)
    expect(doc.keywords).toEqual(['metacentrex', 'alianza'])
    expect(mod.getDstnyDocumentRegistryPath()).toBe(join(tempHome, 'documents', 'dstny-documents.jsonl'))
  })

  it('collapses later updates by id while preserving immutable file fields', async () => {
    const mod = await loadModule()
    const filePath = writeSampleFile()
    const created = mod.createDstnyDocumentRecord({
      title: 'Original title',
      filePath,
      collection: 'dstny_catalogues',
      channel: 'direct',
      docType: 'catalogue',
      businessStatus: 'brouillon',
      confidence: 'faible',
    })

    const updated = mod.updateDstnyDocumentRecord(created.id, {
      title: 'Updated title',
      businessStatus: 'valide',
      ingestionStatus: 'indexed',
      ragDocId: 'rag_123',
      filePath: '/tmp/should-not-change',
    } as never)

    expect(updated?.title).toBe('Updated title')
    expect(updated?.businessStatus).toBe('valide')
    expect(updated?.filePath).toBe(created.filePath)
    expect(mod.getDstnyDocumentRecord(created.id)?.ragDocId).toBe('rag_123')
    expect(mod.listDstnyDocuments()).toHaveLength(1)
  })

  it('filters documents by collection, product, status, and search query', async () => {
    const mod = await loadModule()
    const one = writeSampleFile('one.pdf')
    const two = writeSampleFile('two.pdf')
    mod.createDstnyDocumentRecord({
      title: 'Alianza pricing',
      filePath: one,
      collection: 'pricing',
      product: 'alianza',
      channel: 'operateur',
      docType: 'pricing',
      businessStatus: 'actif',
      confidence: 'fort',
      supplier: 'Alianza',
    })
    mod.createDstnyDocumentRecord({
      title: 'Mobile benchmark',
      filePath: two,
      collection: 'concurrence',
      product: 'mobile',
      channel: 'tous',
      docType: 'benchmark',
      businessStatus: 'actif',
      confidence: 'moyen',
    })

    expect(mod.listDstnyDocuments({ collection: 'pricing' })).toHaveLength(1)
    expect(mod.listDstnyDocuments({ product: 'mobile' })).toHaveLength(1)
    expect(mod.listDstnyDocuments({ q: 'alianza' }).map((doc) => doc.title)).toEqual(['Alianza pricing'])
  })

  it('excludes archived documents by default', async () => {
    const mod = await loadModule()
    const filePath = writeSampleFile()
    const doc = mod.createDstnyDocumentRecord({
      title: 'Archived doc',
      filePath,
      collection: 'livrables_valides',
      channel: 'interne',
      docType: 'livrable',
      businessStatus: 'actif',
      confidence: 'fort',
    })
    mod.updateDstnyDocumentRecord(doc.id, { businessStatus: 'archive', ingestionStatus: 'archived' })

    expect(mod.listDstnyDocuments()).toHaveLength(0)
    expect(mod.listDstnyDocuments({ includeArchived: true })).toHaveLength(1)
  })

  it('rejects invalid metadata values', async () => {
    const mod = await loadModule()
    const filePath = writeSampleFile()
    expect(() => mod.createDstnyDocumentRecord({
      title: 'Bad channel',
      filePath,
      collection: 'pricing',
      channel: 'invalid',
      docType: 'pricing',
      businessStatus: 'actif',
      confidence: 'fort',
    } as never)).toThrow(/channel must be one of/)
  })
})
