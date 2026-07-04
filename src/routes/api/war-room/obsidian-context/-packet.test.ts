import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { Route as PacketRoute } from './packet'

vi.mock('../../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

type PacketHandlers = typeof PacketRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}

const packetHandlers = (PacketRoute as PacketHandlers).options.server.handlers
const mockIsAuthenticated = vi.mocked(isAuthenticated)
let tempDirs: Array<string> = []

function post(body: unknown) {
  return new Request('http://localhost/api/war-room/obsidian-context/packet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function writeVaultNote(root: string, relativePath: string, text: string) {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, text, 'utf8')
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  const storeDir = await tempDir('workspace-kernel-obsidian-api-')
  const vaultDir = await tempDir('workspace-obsidian-api-vault-')
  process.env.WORKSPACE_KERNEL_STORE_DIR = storeDir
  process.env.WORKSPACE_OBSIDIAN_VAULT_DIR = vaultDir
  await writeVaultNote(vaultDir, 'wiki/hot.md', [
    '# Hot Cache',
    'Decision: Workspace reads scoped Obsidian context only.',
    'Safety: local-only, usageAllowed:false, workerSpawnAllowed:false.',
  ].join('\n'))
})

afterEach(async () => {
  delete process.env.WORKSPACE_KERNEL_STORE_DIR
  delete process.env.WORKSPACE_OBSIDIAN_VAULT_DIR
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('/api/war-room/obsidian-context/packet', () => {
  it('requires auth and returns no-store', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await packetHandlers.POST({ request: post({ mission: 'Attach context.' }) })

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('creates and persists a local obsidian-context-packet artifact event', async () => {
    const response = await packetHandlers.POST({
      request: post({
        mission: 'Attach context for local product-search work.',
        mode: 'etsy-workspace',
        targetRoomId: 'etsy-market-lab',
        targetStationId: 'etsy-loki-product-hunt',
      }),
    })
    const body = await response.json() as {
      ok: boolean
      packet: { sourceNotes: Array<{ status: string }>; localOnly: true; writebackAllowed: false }
      event: { type: string }
      telemetry: { agentId: string; artifactKind: string; stationId: string }
      state: { runs: Array<{ artifacts: Array<{ kind: string; dataOrigin: string }> }>; events: Array<{ type: string; artifactId?: string }> }
      localOnly: boolean
      usageAllowed: boolean
      workerSpawnAllowed: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
      writebackAllowed: boolean
      lockedActions: Array<string>
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.ok).toBe(true)
    expect(body.packet.sourceNotes.some((source) => source.status === 'loaded')).toBe(true)
    expect(body.packet).toMatchObject({ localOnly: true, writebackAllowed: false })
    expect(body.event.type).toBe('artifact.created')
    expect(body.telemetry).toMatchObject({
      agentId: 'loki',
      artifactKind: 'obsidian-context-packet',
      stationId: 'etsy-loki-product-hunt',
    })
    expect(body.state.runs[0].artifacts[0]).toMatchObject({
      kind: 'obsidian-context-packet',
      dataOrigin: 'local-only',
    })
    expect(body.state.events.some((event) => event.type === 'artifact.created')).toBe(true)
    expect(body).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
      writebackAllowed: false,
    })
    expect(body.lockedActions.join(' ')).toContain('Obsidian vault writeback')
  })

  it('keeps live-risk mission text locked and never unlocks live actions', async () => {
    const response = await packetHandlers.POST({
      request: post({
        mission: 'Publish and upload this Etsy draft after reading Obsidian.',
        mode: 'etsy-workspace',
      }),
    })
    const body = await response.json() as {
      ok: boolean
      packet: { mission: string; forbiddenActions: Array<string> }
      event: { type: string }
      telemetry: { artifactKind: string }
      usageAllowed: boolean
      workerSpawnAllowed: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
      writebackAllowed: boolean
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.packet.mission).toContain('Publish and upload')
    expect(body.event.type).toBe('artifact.created')
    expect(body.telemetry.artifactKind).toBe('obsidian-context-packet')
    expect(body.packet.forbiddenActions.join(' ')).toContain('live Etsy upload')
    expect(body).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
      writebackAllowed: false,
    })
  })
})
