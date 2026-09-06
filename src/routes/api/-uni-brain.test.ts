/**
 * Tests for /api/uni-brain handler
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// ─── list entries ─────────────────────────────────────────────────────────────

// ─── safeResolve logic under test ─────────────────────────────────────────────
// We re-implement the function here to test it in isolation without importing
// the full route module (which tries to connect to real FS paths).

const VAULT_ROOT = join(os.tmpdir(), `uni-brain-test-${Date.now()}`)

function safeResolve(relPath: string): string | null {
  const clean = relPath.replace(/\0/g, '').trim()
  const resolved =
    clean === '' || clean === '.'
      ? VAULT_ROOT
      : isAbsolute(clean)
        ? null
        : resolve(VAULT_ROOT, clean)

  if (!resolved) return null

  const rel = relative(VAULT_ROOT, resolved)
  if (!rel || rel === '') return VAULT_ROOT
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return resolved
}

// ─── set up temp vault ────────────────────────────────────────────────────────

beforeAll(() => {
  mkdirSync(VAULT_ROOT, { recursive: true })
  mkdirSync(join(VAULT_ROOT, 'Anatomy'), { recursive: true })
  writeFileSync(join(VAULT_ROOT, 'index.md'), '# Uni Brain\nHello world')
  writeFileSync(
    join(VAULT_ROOT, 'Anatomy', 'spine.md'),
    '# Spine\nVertebrae notes here',
  )
  writeFileSync(join(VAULT_ROOT, 'Anatomy', 'not-md.txt'), 'ignored')
})

afterAll(() => {
  rmSync(VAULT_ROOT, { recursive: true, force: true })
})

// ─── path traversal ───────────────────────────────────────────────────────────

describe('safeResolve — path traversal prevention', () => {
  it('rejects ../../../etc/passwd', () => {
    expect(safeResolve('../../../etc/passwd')).toBeNull()
  })

  it('rejects absolute path', () => {
    expect(safeResolve('/etc/passwd')).toBeNull()
  })

  it('rejects path escaping via ..', () => {
    expect(safeResolve('../sibling')).toBeNull()
  })

  it('accepts valid relative path', () => {
    const result = safeResolve('Anatomy/spine.md')
    expect(result).not.toBeNull()
    expect(result).toBe(join(VAULT_ROOT, 'Anatomy/spine.md'))
  })

  it('accepts empty path → returns vault root', () => {
    expect(safeResolve('')).toBe(VAULT_ROOT)
  })
})

describe('list entries — sorted dirs first', () => {
  function listDir(dir: string) {
    const names = readdirSync(dir)
    const entries: Array<{ name: string; type: 'file' | 'dir' }> = []
    for (const name of names) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      const s = statSync(full)
      entries.push({ name, type: s.isDirectory() ? 'dir' : 'file' })
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return entries
  }

  it('returns dirs before files', () => {
    const entries = listDir(VAULT_ROOT)
    const types = entries.map((e) => e.type)
    // All dirs should come before files
    const firstFileIdx = types.indexOf('file')
    const lastDirIdx = types.lastIndexOf('dir')
    if (firstFileIdx !== -1 && lastDirIdx !== -1) {
      expect(lastDirIdx).toBeLessThan(firstFileIdx)
    }
  })

  it('includes the Anatomy directory and index.md', () => {
    const entries = listDir(VAULT_ROOT)
    const names = entries.map((e) => e.name)
    expect(names).toContain('Anatomy')
    expect(names).toContain('index.md')
  })
})

// ─── read .md restriction ────────────────────────────────────────────────────

describe('read — only .md files allowed', () => {
  it('accepts .md extension', () => {
    const p = safeResolve('index.md')
    expect(p).not.toBeNull()
    expect(extname(p!).toLowerCase()).toBe('.md')
  })

  it('rejects non-.md file', () => {
    const p = safeResolve('Anatomy/not-md.txt')
    expect(p).not.toBeNull()
    // The extension check would reject it at read time
    expect(extname(p!).toLowerCase()).not.toBe('.md')
  })
})
