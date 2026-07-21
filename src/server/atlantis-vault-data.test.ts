import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { getAtlantisVaultSnapshot } from './atlantis-vault-data'

const poseidonFiles = [
  'portrait.png',
  'idle.png',
  'work-standing.png',
  'talk-standing.png',
  'carry-packet.png',
  'wait-approval.png',
  'sleep.png',
  'walk-north.png',
  'walk-north-east.png',
  'walk-east.png',
  'walk-south-east.png',
  'walk-south.png',
  'walk-south-west.png',
  'walk-west.png',
  'walk-north-west.png',
]

let tempDirs: Array<string> = []

async function tempProjectRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlantis-vault-data-'))
  tempDirs.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('getAtlantisVaultSnapshot', () => {
  it('builds Atlantis from real store readbacks and reports Workspace Core fallback honestly', async () => {
    const projectRoot = await tempProjectRoot()
    const poseidonDir = path.join(projectRoot, 'public', 'war-room', 'living-v3', 'agents', 'poseidon')
    await mkdir(poseidonDir, { recursive: true })
    await Promise.all(poseidonFiles.map((fileName) => writeFile(path.join(poseidonDir, fileName), 'fixture')))
    await writeFile(path.join(poseidonDir, 'ASSET_LIFECYCLE.json'), '{}')
    await mkdir(path.join(projectRoot, 'supabase', 'migrations'), { recursive: true })
    await writeFile(path.join(projectRoot, 'supabase', 'migrations', '001_workspace_core.sql'), '-- foundation exists')

    const snapshot = await getAtlantisVaultSnapshot({
      projectRoot,
      workspaceKernelRootDir: path.join(projectRoot, 'data', 'workspace-kernel'),
      etsyRoomRootDir: path.join(projectRoot, 'data', 'war-room', 'etsy-room'),
      councilRootDir: path.join(projectRoot, 'data', 'war-room-council'),
      obsidianVaultDir: path.join(projectRoot, 'obsidian'),
      nowMs: 10_000,
    })

    expect(snapshot.ok).toBe(true)
    expect(snapshot.schemaVersion).toBe('atlantis-vault-status-v1')
    expect(snapshot.source).toBe('server-real-readback')
    expect(snapshot.poseidon.agentId).toBe('poseidon')
    expect(snapshot.poseidon.visualStatus).toBe('poseidon-sea-pet-runtime-final')
    expect(snapshot.counts.poseidonRuntimeFiles).toBe(poseidonFiles.length)
    expect(snapshot.database.activeTruthStore).toBe('local-json')
    expect(snapshot.database.supabaseRuntimeConnected).toBe(false)
    expect(snapshot.database.workspaceCoreProvider).toBe('local-file')
    expect(snapshot.database.workspaceCoreStatus).toBe('fallback')
    expect(snapshot.database.workspaceCoreRunCount).toBe(0)
    expect(snapshot.database.workspaceCoreApprovalCount).toBe(0)
    expect(snapshot.database.supabaseFoundationPresent).toBe(true)
    expect(snapshot.database.supabaseMigrationFiles).toBe(1)
    expect(snapshot.safety.readOnly).toBe(true)
    expect(snapshot.safety.writebackAllowed).toBe(false)
    expect(snapshot.stores.map((store) => store.id)).toEqual(expect.arrayContaining([
      'workspace-kernel',
      'etsy-room-store',
      'council-board-store',
      'obsidian-allowlist',
      'poseidon-asset',
      'supabase-foundation',
    ]))
    expect(snapshot.flow.map((edge) => edge.id)).toEqual(expect.arrayContaining([
      'kernel-to-poseidon',
      'workspace-core-to-approval-spine',
      'etsy-to-vault',
      'obsidian-to-vault',
      'poseidon-asset-to-room',
    ]))
  })
})
