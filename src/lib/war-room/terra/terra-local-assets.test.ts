import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTerraPrinterReadOnlyStatus, scanTerraModelAssets } from './terra-local-assets'

const tempDirs: Array<string> = []
const originalHome = process.env.HOME

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terra-assets-test-'))
  tempDirs.push(dir)
  return dir
}

function zipDateParts() {
  return { time: 0, date: 0 }
}

function writeUInt32LE(value: number) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

function writeUInt16LE(value: number) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value >>> 0, 0)
  return buffer
}

function makeStoredZip(entries: Array<{ name: string; data: Buffer | string }>) {
  const locals: Array<Buffer> = []
  const centrals: Array<Buffer> = []
  let offset = 0
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const name = Buffer.from(entry.name)
    const { time, date } = zipDateParts()
    const local = Buffer.concat([
      writeUInt32LE(0x04034b50),
      writeUInt16LE(20),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(time),
      writeUInt16LE(date),
      writeUInt32LE(0),
      writeUInt32LE(data.length),
      writeUInt32LE(data.length),
      writeUInt16LE(name.length),
      writeUInt16LE(0),
      name,
      data,
    ])
    const central = Buffer.concat([
      writeUInt32LE(0x02014b50),
      writeUInt16LE(20),
      writeUInt16LE(20),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(time),
      writeUInt16LE(date),
      writeUInt32LE(0),
      writeUInt32LE(data.length),
      writeUInt32LE(data.length),
      writeUInt16LE(name.length),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt32LE(0),
      writeUInt32LE(offset),
      name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralDirectory = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    writeUInt32LE(0x06054b50),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(entries.length),
    writeUInt16LE(entries.length),
    writeUInt32LE(centralDirectory.length),
    writeUInt32LE(offset),
    writeUInt16LE(0),
  ])
  return Buffer.concat([...locals, centralDirectory, eocd])
}

function minimal3mfModel() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="30" y="0" z="0"/><vertex x="0" y="30" z="0"/><vertex x="0" y="0" z="20"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="2" v3="3"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
}

beforeEach(() => {
  process.env.HOME = makeTempDir()
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  process.env.HOME = originalHome
  delete process.env.TERRA_PRINTER_NAME
  delete process.env.TERRA_PRINTER_CAMERA_URL
  delete process.env.TERRA_PRINTER_STATUS_URL
})

describe('Terra local assets', () => {
  it('scans 3MF files read-only with stable display metadata', async () => {
    const dir = makeTempDir()
    const nested = path.join(dir, 'nested')
    fs.mkdirSync(nested)
    fs.writeFileSync(path.join(dir, 'older.3mf'), makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))
    fs.writeFileSync(path.join(nested, 'newer.3MF'), makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))
    fs.writeFileSync(path.join(dir, 'ignore.stl'), 'stl')

    const result = await scanTerraModelAssets({ roots: [dir], limit: 10, nowMs: 10 })

    expect(result.ok).toBe(true)
    expect(result.totalMatches).toBe(2)
    expect(result.assets.map((asset) => asset.name).sort()).toEqual(['newer.3MF', 'older.3mf'])
    expect(result.assets[0].displayPath).toContain('.3')
    expect(result.assets[0].preview.dataUrl).toMatch(/^data:image\//)
    expect(result.roots[0]).toMatchObject({ exists: true })
  })

  it('uses embedded 3MF thumbnail images when present', async () => {
    const dir = makeTempDir()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    fs.writeFileSync(path.join(dir, 'thumb.3mf'), makeStoredZip([
      { name: 'Metadata/plate_1_small.png', data: png },
      { name: '3D/3dmodel.model', data: minimal3mfModel() },
    ]))

    const result = await scanTerraModelAssets({ roots: [dir], query: 'thumb', limit: 1 })

    expect(result.assets[0].preview.kind).toBe('embedded')
    expect(result.assets[0].preview.source).toBe('Metadata/plate_1_small.png')
    expect(result.assets[0].preview.dataUrl).toContain('data:image/png;base64')
  })

  it('generates geometry previews when no embedded thumbnail exists', async () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'geometry.3mf'), makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))

    const result = await scanTerraModelAssets({ roots: [dir], query: 'geometry', limit: 1 })

    expect(result.assets[0].preview.kind).toBe('generated')
    expect(result.assets[0].preview.source).toBe('3D/3dmodel.model')
    expect(result.assets[0].preview.dataUrl).toContain('data:image/svg+xml;base64')
  })

  it('filters 3MF files by query and limit', async () => {
    const dir = makeTempDir()
    fs.writeFileSync(path.join(dir, 'piggo-v15.3mf'), makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))
    fs.writeFileSync(path.join(dir, 'comb.3mf'), makeStoredZip([{ name: '3D/3dmodel.model', data: minimal3mfModel() }]))

    const result = await scanTerraModelAssets({ roots: [dir], query: 'piggo', limit: 1 })

    expect(result.totalMatches).toBe(1)
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0].name).toBe('piggo-v15.3mf')
  })

  it('keeps printer connector read-only and not configured without local URL config or slicer discovery', async () => {
    const status = await getTerraPrinterReadOnlyStatus(123)

    expect(status.ok).toBe(true)
    expect(status.configured).toBe(false)
    expect(status.state).toBe('not_configured')
    expect(status.lockedActions).toEqual(expect.arrayContaining(['printer_start', 'printer_heat', 'printer_cancel']))
  })

  it('discovers Elegoo camera access through MQTT without guessing a static port 8080 URL', async () => {
    const slicerBase = path.join(process.env.HOME as string, 'Library', 'Application Support', 'ElegooSlicer')
    const userDir = path.join(slicerBase, 'user')
    fs.mkdirSync(userDir, { recursive: true })
    fs.writeFileSync(path.join(userDir, 'printer_list.json'), JSON.stringify({
      'printer-test': {
        printerName: 'Test Centauri',
        printerModel: 'Centauri Carbon 2',
        host: '192.0.2.10',
        mainboardId: 'TEST-SERIAL',
        accessCode: 'test-only-code',
      },
    }))
    fs.writeFileSync(path.join(slicerBase, 'ElegooSlicer.conf'), JSON.stringify({
      print: { printsend_selected_printer_id: 'printer-test' },
    }))

    const status = await getTerraPrinterReadOnlyStatus(321)

    expect(status.configured).toBe(true)
    expect(status.state).toBe('configured')
    expect(status.source).toBe('elegoo-slicer')
    expect(status.cameraRequestMode).toBe('elegoo-mqtt-on-demand')
    expect(status.cameraUrl).toBeUndefined()
    expect(status.metrics.queueState).toBe('camera available on demand')
    expect(status.discoveryNotes.join(' ')).toContain('no static port or stream URL is assumed')
  })

  it('reports configured live camera URL without enabling side effects', async () => {
    let cameraRequests = 0
    const server = http.createServer((_request, response) => {
      cameraRequests += 1
      response.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
      response.write('--frame\r\nContent-Type: image/jpeg\r\n\r\n')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server address')
    process.env.TERRA_PRINTER_CAMERA_URL = `http://127.0.0.1:${address.port}/`
    process.env.TERRA_PRINTER_NAME = 'Test Printer'

    const status = await getTerraPrinterReadOnlyStatus(456)
    server.close()

    expect(status.configured).toBe(true)
    expect(status.state).toBe('configured')
    expect(status.name).toBe('Test Printer')
    expect(status.cameraUrl).toContain('127.0.0.1')
    expect(status.metrics.queueState).toBe('camera configured manual frame only')
    expect(status.message).toContain('will not open the stream')
    expect(cameraRequests).toBe(0)
    expect(status.lockedActions).toContain('printer_upload')
  })
})
