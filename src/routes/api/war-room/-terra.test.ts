import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../server/auth-middleware'
import { Route as AssetsRoute } from './terra-assets'
import { Route as PrinterRoute } from './terra-printer'
import { Route as PrinterFrameRoute } from './terra-printer-frame'
import { Route as CapabilitiesRoute } from './terra-capabilities'
import { Route as ModelSearchRoute } from './terra-model-search'
import { Route as SlicePlanRoute } from './terra-slice-plan'
import { Route as PrintQaRoute } from './terra-print-qa'

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

type AssetsHandlers = typeof AssetsRoute & { options: { server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } } } }
type PrinterHandlers = typeof PrinterRoute & { options: { server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } } } }
type PrinterFrameHandlers = typeof PrinterFrameRoute & { options: { server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } } } }
type CapabilitiesHandlers = typeof CapabilitiesRoute & { options: { server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } } } }
type ModelSearchHandlers = typeof ModelSearchRoute & { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }
type SlicePlanHandlers = typeof SlicePlanRoute & { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }
type PrintQaHandlers = typeof PrintQaRoute & { options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } } }

const assetsHandler = (AssetsRoute as AssetsHandlers).options.server.handlers.GET
const printerHandler = (PrinterRoute as PrinterHandlers).options.server.handlers.GET
const printerFrameHandler = (PrinterFrameRoute as PrinterFrameHandlers).options.server.handlers.GET
const capabilitiesHandler = (CapabilitiesRoute as CapabilitiesHandlers).options.server.handlers.GET
const modelSearchHandler = (ModelSearchRoute as ModelSearchHandlers).options.server.handlers.POST
const slicePlanHandler = (SlicePlanRoute as SlicePlanHandlers).options.server.handlers.POST
const printQaHandler = (PrintQaRoute as PrintQaHandlers).options.server.handlers.POST
const mockIsAuthenticated = vi.mocked(isAuthenticated)
const tempDirs: Array<string> = []
const originalHome = process.env.HOME
const servers: Array<http.Server> = []

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terra-route-test-'))
  tempDirs.push(dir)
  return dir
}

function u16(value: number) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(value, 0)
  return b
}

function u32(value: number) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(value >>> 0, 0)
  return b
}

function makeStoredZip(entries: Array<{ name: string; data: Buffer | string }>) {
  const locals: Array<Buffer> = []
  const centrals: Array<Buffer> = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data])
    const central = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const cd = Buffer.concat(centrals)
  return Buffer.concat([...locals, cd, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cd.length), u32(offset), u16(0)])
}

function minimal3mfModel() {
  return '<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="5"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>'
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function writeFakeHermesSkill(relativeDir: string, name: string) {
  const skillPath = path.join(process.env.HOME || os.tmpdir(), '.hermes', 'skills', relativeDir, 'SKILL.md')
  fs.mkdirSync(path.dirname(skillPath), { recursive: true })
  fs.writeFileSync(skillPath, `---\nname: ${name}\n---\n# ${name}\n`)
  return skillPath
}

function writeFakeElegooFixture(root: string) {
  const app = path.join(root, 'ElegooSlicer.app')
  const base = path.join(root, 'ElegooSlicerData')
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true })
  fs.mkdirSync(path.join(app, 'Contents'), { recursive: true })
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'ElegooSlicer'), '#!/bin/sh\necho elegoo\n')
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key><string>1.5.1.6</string><key>CFBundleIdentifier</key><string>com.elegoo3d.test</string></dict></plist>')
  const machine = {
    type: 'machine',
    name: 'Elegoo Centauri Carbon 2 0.4 nozzle',
    from: 'system',
    nozzle_diameter: ['0.4'],
    printer_model: 'Elegoo Centauri Carbon 2',
    printable_area: ['0x0', '256x0', '256x256', '0x256'],
    printable_height: '256',
    default_filament_profile: ['Elegoo PLA @ECC2'],
    default_print_profile: '0.20mm Standard @Elegoo CC2 0.4 nozzle',
    gcode_flavor: 'klipper',
    host_type: 'elegoolink',
    support_multi_filament: '1',
    support_wan_network: '1',
    machine_pause_gcode: 'M600',
    machine_start_gcode: 'BED_MESH_CALIBRATE\nG28',
  }
  writeJson(path.join(base, 'ElegooSlicer.conf'), {
    print: { bed_leveling: '1', flow_cali: '1', timelapse: '1' },
    recent: { printsend_selected_printer_id: 'lan_test', printsend_timelapse: '1', printsend_upload_and_print: '1', printsend_auto_refill: '1' },
    presets: { machine: 'Elegoo Centauri Carbon 2 0.4 nozzle' },
  })
  writeJson(path.join(base, 'user', 'printer_list.json'), {
    lan_test: { printerName: 'Test CC2', printerModel: 'Elegoo Centauri Carbon 2', vendor: 'Elegoo', host: '127.0.0.1', firmwareVersion: 'test-fw' },
  })
  writeJson(path.join(base, 'system', 'Elegoo', 'machine', 'ECC2', 'Elegoo Centauri Carbon 2 0.4 nozzle.json'), machine)
  writeJson(path.join(base, 'system', 'Elegoo', 'process', 'ECC2', '0.20mm Standard @Elegoo CC2 0.4 nozzle.json'), { type: 'process', name: '0.20mm Standard @Elegoo CC2 0.4 nozzle', from: 'system' })
  writeJson(path.join(base, 'system', 'Elegoo', 'filament', 'ECC2', 'Elegoo PLA @ECC2.json'), { type: 'filament', name: 'Elegoo PLA @ECC2', from: 'system', filament_type: ['PLA'], filament_colour: ['#ffffff'] })
  return { app, base }
}

beforeEach(() => {
  mockIsAuthenticated.mockReturnValue(true)
  process.env.HOME = makeTempDir()
})

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  process.env.HOME = originalHome
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.TERRA_3MF_ROOTS
  delete process.env.TERRA_PRINTER_CAMERA_URL
  delete process.env.TERRA_PRINTER_STATUS_URL
  delete process.env.TERRA_PRINTER_NAME
  delete process.env.TERRA_ELEGOO_SLICER_BASE
  delete process.env.TERRA_ELEGOO_SLICER_APP
  delete process.env.TERRA_OBSIDIAN_VAULT
})

describe('/api/war-room/terra assets/printer', () => {
  it('requires auth for Terra asset scan', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await assetsHandler({ request: new Request('http://localhost/api/war-room/terra-assets') })
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns local 3MF assets with previews from configured safe roots without cache', async () => {
    const dir = makeTempDir()
    process.env.TERRA_3MF_ROOTS = dir
    fs.writeFileSync(path.join(dir, 'terra-test.3mf'), makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))

    const response = await assetsHandler({ request: new Request('http://localhost/api/war-room/terra-assets?limit=10&q=terra-test') })
    const body = await response.json() as { ok: boolean; assets: Array<{ name: string; preview: { dataUrl?: string } }>; totalMatches: number }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.ok).toBe(true)
    expect(body.totalMatches).toBe(1)
    expect(body.assets[0].name).toBe('terra-test.3mf')
    expect(body.assets[0].preview.dataUrl).toMatch(/^data:image\//)
  })

  it('returns read-only printer status without opening the camera stream and keeps machine actions locked', async () => {
    let cameraRequests = 0
    const server = http.createServer((_request, response) => {
      cameraRequests += 1
      response.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
      response.write('--frame\r\nContent-Type: image/jpeg\r\n\r\n')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    servers.push(server)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No server address')
    process.env.TERRA_PRINTER_CAMERA_URL = `http://127.0.0.1:${address.port}/stream`
    process.env.TERRA_PRINTER_NAME = 'Route Test Printer'

    const response = await printerHandler({ request: new Request('http://localhost/api/war-room/terra-printer') })
    const body = await response.json() as { ok: boolean; configured: boolean; state: string; cameraUrl: string; message: string; discoveryNotes: Array<string>; lockedActions: Array<string> }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.configured).toBe(true)
    expect(body.state).toBe('configured')
    expect(body.cameraUrl).toContain('127.0.0.1')
    expect(body.message).toContain('will not open the stream')
    expect(body.discoveryNotes).toEqual(expect.arrayContaining(['camera stream probe skipped by default; use manual frame endpoint only']))
    expect(cameraRequests).toBe(0)
    expect(body.lockedActions).toEqual(expect.arrayContaining(['printer_start', 'printer_heat']))
  })

  it('normalizes read-only printer progress metrics without sending machine commands', async () => {
    const server = http.createServer((request, response) => {
      if (request.url?.startsWith('/status')) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ result: { status: { print_stats: { state: 'printing', filename: 'owl.3mf', print_duration: 120 }, virtual_sdcard: { progress: 0.42 }, heater_bed: { temperature: 61.2 }, extruder: { temperature: 211.4 } } } }))
        return
      }
      response.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
      response.write('--frame\r\nContent-Type: image/jpeg\r\n\r\n')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    servers.push(server)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No server address')
    process.env.TERRA_PRINTER_CAMERA_URL = `http://127.0.0.1:${address.port}/stream`
    process.env.TERRA_PRINTER_STATUS_URL = `http://127.0.0.1:${address.port}/status`

    const response = await printerHandler({ request: new Request('http://localhost/api/war-room/terra-printer') })
    const body = await response.json() as { ok: boolean; metrics: { progressPercent: number; progressSource: string; printLifecycle: string; jobName: string; bedTempC: number; nozzleTempC: number }; lockedActions: Array<string> }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.metrics.progressPercent).toBe(42)
    expect(body.metrics.progressSource).toBe('read-only status JSON')
    expect(body.metrics.printLifecycle).toBe('printing')
    expect(body.metrics.jobName).toBe('owl.3mf')
    expect(body.metrics.bedTempC).toBe(61.2)
    expect(body.metrics.nozzleTempC).toBe(211.4)
    expect(body.lockedActions).toEqual(expect.arrayContaining(['printer_start', 'printer_cancel']))
  })

  it('proxies a read-only JPEG frame from the discovered printer camera', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
      response.write(Buffer.concat([
        Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'),
        jpeg,
        Buffer.from('\r\n'),
      ]))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    servers.push(server)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No server address')
    process.env.TERRA_PRINTER_CAMERA_URL = `http://127.0.0.1:${address.port}/stream`

    const response = await printerFrameHandler({ request: new Request('http://localhost/api/war-room/terra-printer-frame') })
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(body).toEqual(jpeg)
  })

  it('creates a read-only Terra print QA camera packet without approving the print', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
      response.write(Buffer.concat([
        Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'),
        jpeg,
        Buffer.from('\r\n'),
      ]))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    servers.push(server)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No server address')
    process.env.TERRA_PRINTER_CAMERA_URL = `http://127.0.0.1:${address.port}/stream`

    const response = await printQaHandler({
      request: new Request('http://localhost/api/war-room/terra-print-qa', {
        method: 'POST',
        body: JSON.stringify({ modelName: 'owl.3mf', expectedPreviewAvailable: true }),
      }),
    })
    const body = await response.json() as { ok: boolean; verdict: string; frame: { captured: boolean; bytes: number }; model: { name: string; expectedPreviewAvailable: boolean }; lockedActions: Array<string> }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.verdict).toBe('ready_for_visual_analysis')
    expect(body.frame.captured).toBe(true)
    expect(body.frame.bytes).toBe(4)
    expect(body.model.name).toBe('owl.3mf')
    expect(body.model.expectedPreviewAvailable).toBe(true)
    expect(body.lockedActions).toEqual(expect.arrayContaining(['qa_pass_auto_approve', 'printer_stop']))
  })

  it('returns a live Terra capability matrix from ElegooSlicer profiles and local assets', async () => {
    const dir = makeTempDir()
    const { app, base } = writeFakeElegooFixture(dir)
    const vault = path.join(dir, 'Hermes Second Brain')
    fs.mkdirSync(vault, { recursive: true })
    process.env.TERRA_ELEGOO_SLICER_APP = app
    process.env.TERRA_ELEGOO_SLICER_BASE = base
    process.env.TERRA_OBSIDIAN_VAULT = vault
    process.env.TERRA_3MF_ROOTS = dir
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
      response.write('--frame\r\nContent-Type: image/jpeg\r\n\r\n')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    servers.push(server)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No server address')
    process.env.TERRA_PRINTER_CAMERA_URL = `http://127.0.0.1:${address.port}/stream`
    writeFakeHermesSkill('productivity/dlv-3d-print-design-synthesis', 'dlv-3d-print-design-synthesis')
    writeFakeHermesSkill('gcode', 'gcode')
    fs.writeFileSync(path.join(dir, 'terra-live.3mf'), makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))

    const response = await capabilitiesHandler({ request: new Request('http://localhost/api/war-room/terra-capabilities') })
    const body = await response.json() as { ok: boolean; slicer: { cliAvailable: boolean; selectedMachine: string; profileCounts: { filaments: number }; machine: { supportsBedMeshCalibration: boolean } }; modelLibrary: { totalMatches: number }; workflow: Array<{ id: string; state: string }>; obsidian: { exists: boolean }; agent: { memory: { exists: boolean; memoryNotePath: string }; skills: Array<{ name: string; state: string }>; currentFocus: { stationId: string } } }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.slicer.cliAvailable).toBe(true)
    expect(body.slicer.selectedMachine).toBe('Elegoo Centauri Carbon 2 0.4 nozzle')
    expect(body.slicer.profileCounts.filaments).toBeGreaterThan(0)
    expect(body.slicer.machine.supportsBedMeshCalibration).toBe(true)
    expect(body.modelLibrary.totalMatches).toBe(1)
    expect(body.workflow.find((step) => step.id === 'web-model-search')?.state).toBe('available')
    expect(body.workflow.find((step) => step.id === 'send-to-printer')?.state).toBe('locked')
    expect(body.obsidian.exists).toBe(true)
    expect(body.agent.memory.exists).toBe(true)
    expect(body.agent.memory.memoryNotePath).toContain('Terra Forge Workspace Memory.md')
    expect(body.agent.skills.find((skill) => skill.name === 'dlv-3d-print-design-synthesis')?.state).toBe('ready')
    expect(body.agent.skills.find((skill) => skill.name === 'gcode')?.state).toBe('ready')
    expect(body.agent.currentFocus.stationId).toBe('terra-printer-control')
  })

  it('searches internet model candidates read-only with Printables proof and locked printer actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        searchPrints2: {
          totalCount: 1,
          items: [{
            id: 123,
            name: 'Desk cable clip',
            slug: 'desk-cable-clip',
            datePublished: '2026-06-01T00:00:00Z',
            likesCount: 20,
            downloadCount: 420,
            ratingAvg: 4.8,
            price: 0,
            aiGenerated: false,
            image: { filePath: 'image/path/card.jpg', imageWidth: 800, imageHeight: 600 },
            category: { nameEn: 'Household' },
            license: { abbreviation: 'CC BY', name: 'Creative Commons Attribution' },
          }],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const response = await modelSearchHandler({
      request: new Request('http://localhost/api/war-room/terra-model-search', {
        method: 'POST',
        body: JSON.stringify({ query: 'cable clip', limit: 6 }),
      }),
    })
    const body = await response.json() as { ok: boolean; status: string; candidates: Array<{ title: string; sourceUrl: string; imageUrl: string; license: string; proof: Array<string> }>; lockedActions: Array<string>; skillBasis: string }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.ok).toBe(true)
    expect(body.status).toBe('completed')
    expect(body.candidates[0].title).toBe('Desk cable clip')
    expect(body.candidates[0].sourceUrl).toContain('printables.com/model/123-desk-cable-clip')
    expect(body.candidates[0].imageUrl).toContain('media.printables.com/image/path/card.jpg')
    expect(body.candidates[0].license).toContain('CC BY')
    expect(body.candidates[0].proof).toContain('No file download or printer action')
    expect(body.lockedActions).toEqual(expect.arrayContaining(['download_model_file', 'printer_start']))
    expect(body.skillBasis).toContain('free-trending-printable-model-discovery')
  })

  it('builds a no-execute Terra slice plan and keeps printer actions locked', async () => {
    const dir = makeTempDir()
    const { app, base } = writeFakeElegooFixture(dir)
    process.env.TERRA_ELEGOO_SLICER_APP = app
    process.env.TERRA_ELEGOO_SLICER_BASE = base
    process.env.TERRA_3MF_ROOTS = dir
    const modelPath = path.join(dir, 'slice-me.3mf')
    const machineProfilePath = path.join(base, 'system', 'Elegoo', 'machine', 'ECC2', 'Elegoo Centauri Carbon 2 0.4 nozzle.json')
    const processProfilePath = path.join(base, 'system', 'Elegoo', 'process', 'ECC2', '0.20mm Standard @Elegoo CC2 0.4 nozzle.json')
    const filamentProfilePath = path.join(base, 'system', 'Elegoo', 'filament', 'ECC2', 'Elegoo PLA @ECC2.json')
    fs.writeFileSync(modelPath, makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))

    const response = await slicePlanHandler({
      request: new Request('http://localhost/api/war-room/terra-slice-plan', {
        method: 'POST',
        body: JSON.stringify({ modelPath, machineProfilePath, processProfilePath, filamentProfilePath, flowCalibration: true, bedLeveling: true, timelapse: true, capturePrint: true }),
      }),
    })
    const body = await response.json() as { ok: boolean; mode: string; commandPreview: string; lockedActions: Array<string>; outputFile: string }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.mode).toBe('dry_run_plan')
    expect(body.commandPreview).toContain('--slice')
    expect(body.commandPreview).toContain('--load-settings')
    expect(body.outputFile).toContain('workspace-sliced.3mf')
    expect(body.lockedActions).toEqual(expect.arrayContaining(['execute_slice', 'printer_upload', 'printer_start']))
  })
})
