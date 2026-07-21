import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ObsidianContextAccessError,
  buildObsidianContextPacket,
  loadAllowlistedObsidianContextSources,
  resolveAllowlistedObsidianNotePath,
} from './obsidian-context'

let tempDirs: Array<string> = []

async function tempVault() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'workspace-obsidian-context-'))
  tempDirs.push(dir)
  return dir
}

async function writeVaultNote(root: string, relativePath: string, text: string) {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, text, 'utf8')
}

afterEach(async () => {
  delete process.env.WORKSPACE_OBSIDIAN_VAULT_DIR
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('server-only Obsidian context reader', () => {
  it('loads allowlisted markdown and redacts secret-like lines', async () => {
    const vault = await tempVault()
    await writeVaultNote(vault, 'wiki/hot.md', [
      '# Hot Cache',
      'Decision: use scoped Obsidian context.',
      'apiKey: should never leave the vault reader.',
      'Safety: local-only and frozen.',
    ].join('\n'))

    const sources = await loadAllowlistedObsidianContextSources({
      vaultDir: vault,
      relativePaths: ['wiki/hot.md'],
    })

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      status: 'loaded',
      relativePath: 'wiki/hot.md',
      kind: 'hot-cache',
      title: 'Hot Cache',
    })
    expect(sources[0].content).toContain('Decision: use scoped Obsidian context.')
    expect(sources[0].content).not.toContain('apiKey')
  })

  it('marks missing allowlisted notes without crashing', async () => {
    const vault = await tempVault()
    const packet = await buildObsidianContextPacket({
      vaultDir: vault,
      nowMs: 3000,
      targetRoomId: 'etsy-market-lab',
      targetStationId: 'etsy-loki-product-hunt',
    })

    expect(packet.sourceNotes.length).toBeGreaterThan(0)
    expect(packet.sourceNotes.every((source) => source.status === 'missing')).toBe(true)
    expect(packet.blocker).toContain('No allowlisted Obsidian notes loaded')
  })

  it('fails closed for traversal, arbitrary notes, non-markdown, and raw directories', () => {
    const vault = '/tmp/workspace-obsidian-context-vault'
    expect(() => resolveAllowlistedObsidianNotePath('../secret.md', { vaultDir: vault })).toThrow(ObsidianContextAccessError)
    expect(() => resolveAllowlistedObsidianNotePath('wiki/not-allowlisted.md', { vaultDir: vault })).toThrow(ObsidianContextAccessError)
    expect(() => resolveAllowlistedObsidianNotePath('wiki/hot.txt', { vaultDir: vault })).toThrow(ObsidianContextAccessError)
    expect(() => resolveAllowlistedObsidianNotePath('.raw/inbox/source.md', { vaultDir: vault })).toThrow(ObsidianContextAccessError)
  })

  it('returns blocked sources instead of reading client-supplied arbitrary paths', async () => {
    const vault = await tempVault()
    const sources = await loadAllowlistedObsidianContextSources({
      vaultDir: vault,
      relativePaths: ['../secret.md'],
    })

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ status: 'blocked' })
    expect(sources[0].excerpt).toContain('allowlisted')
  })
})
