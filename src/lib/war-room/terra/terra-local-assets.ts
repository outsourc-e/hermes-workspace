import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import type { Dirent } from 'node:fs'

export type TerraModelAssetPreview = {
  kind: 'embedded' | 'generated' | 'none'
  dataUrl?: string
  source?: string
  note?: string
}

export type TerraModelAsset = {
  id: string
  name: string
  path: string
  displayPath: string
  directory: string
  rootLabel: string
  sizeBytes: number
  sizeLabel: string
  modifiedAtMs: number
  modifiedLabel: string
  preview: TerraModelAssetPreview
}

export type TerraModelAssetScanResult = {
  ok: true
  scannedAtMs: number
  query: string
  limit: number
  totalMatches: number
  assets: Array<TerraModelAsset>
  roots: Array<{ label: string; path: string; exists: boolean }>
  errors: Array<string>
}

export type TerraModelAssetScanOptions = {
  roots?: Array<string>
  query?: string
  limit?: number
  maxDepth?: number
  nowMs?: number
  includePreviews?: boolean
}

export type TerraDiscoveredPrinter = {
  printerId: string
  name: string
  model?: string
  vendor?: string
  host?: string
  firmwareVersion?: string
  serialNumber?: string
  cameraUrl?: string
  cameraRequestMode?: 'configured-url' | 'elegoo-mqtt-on-demand' | 'unavailable'
  source: 'elegoo-slicer'
}

export type TerraPrinterReadOnlyStatus = {
  ok: true
  configured: boolean
  name: string
  profile: string
  state: 'not_configured' | 'configured' | 'ready' | 'unreachable'
  message: string
  lastCheckedAtMs: number
  cameraUrl?: string
  snapshotUrl?: string
  statusUrl?: string
  cameraRequestMode: 'configured-url' | 'elegoo-mqtt-on-demand' | 'unavailable'
  source: 'env' | 'config-file' | 'elegoo-slicer' | 'default'
  configPath?: string
  host?: string
  printerId?: string
  serialNumber?: string
  firmwareVersion?: string
  discoveredPrinters?: Array<TerraDiscoveredPrinter>
  discoveryNotes: Array<string>
  metrics: {
    queueState?: string
    jobName?: string
    progressPercent?: number
    progressSource?: string
    printLifecycle?: 'idle' | 'printing' | 'paused' | 'completed' | 'error' | 'unknown'
    elapsedSeconds?: number
    remainingSeconds?: number
    totalSeconds?: number
    bedTempC?: number
    nozzleTempC?: number
  }
  lockedActions: Array<string>
  error?: string
}

export type TerraPrintQaPacket = {
  ok: true
  mode: 'read_only_camera_packet'
  checkedAtMs: number
  printer: TerraPrinterReadOnlyStatus
  model?: {
    name?: string
    path?: string
    expectedPreviewAvailable: boolean
  }
  frame: {
    captured: boolean
    sourceUrl?: string
    contentType?: string
    bytes?: number
    width?: number
    height?: number
    error?: string
  }
  verdict: 'blocked' | 'ready_for_visual_analysis'
  note: string
  lockedActions: Array<string>
}

export type TerraPrintQaRequest = {
  modelName?: string
  modelPath?: string
  expectedPreviewAvailable?: boolean
}

export type TerraPrintQaResult = TerraPrintQaPacket | { ok: false; status: number; error: string }

export type TerraSlicerProfileKind = 'machine' | 'process' | 'filament'

export type TerraSlicerProfile = {
  id: string
  kind: TerraSlicerProfileKind
  name: string
  path: string
  displayPath: string
  source: string
  nozzleMm?: number
  material?: string
  color?: string
  default?: boolean
}

export type TerraWorkflowStep = {
  id: 'web-model-search' | 'choose-model' | 'choose-material' | 'calibration' | 'slice-plan' | 'send-to-printer' | 'print-progress' | 'record-print' | 'post-print-qa' | 'agent-memory'
  label: string
  state: 'ready' | 'available' | 'locked' | 'blocked' | 'unknown'
  live: boolean
  locked: boolean
  requiresApproval: boolean
  source: string
  note: string
}

export type TerraWorkbenchCapability = {
  id: string
  label: string
  category: 'library' | 'slicer' | 'printer' | 'camera' | 'agent' | 'safety'
  state: TerraWorkflowStep['state']
  live: boolean
  locked: boolean
  source: string
  evidence: Array<string>
  note: string
}

export type TerraAgentSkillBinding = {
  name: string
  label: string
  category: 'routing' | 'cad' | 'organic' | 'mechanism' | 'slicer' | 'library'
  state: 'ready' | 'missing'
  path?: string
  source: 'hermes-skill'
  use: string
}

export type TerraAgentProfile = {
  id: 'terra'
  label: 'Terra'
  role: string
  memory: {
    source: 'obsidian'
    vaultPath: string
    memoryNotePath: string
    exists: boolean
  }
  skills: Array<TerraAgentSkillBinding>
  currentFocus: {
    stationId: 'terra-modeling-studio' | 'terra-model-hunt' | 'terra-printer-control'
    label: string
    reason: string
  }
  guardrails: Array<string>
}

export type TerraWorkbenchCapabilities = {
  ok: true
  scannedAtMs: number
  slicer: {
    appInstalled: boolean
    appPath: string
    executablePath?: string
    bundleIdentifier?: string
    version?: string
    dataDir: string
    configPath?: string
    selectedMachine?: string
    selectedPrinterId?: string
    cliAvailable: boolean
    cliEvidence: string
    settings: {
      bedLeveling: boolean
      heatedBedLeveling: boolean
      flowCalibration: boolean
      timelapse: boolean
      uploadAndPrint: boolean
      autoRefill: boolean
      bedType?: string
    }
    selectedMachineProfile?: TerraSlicerProfile
    profiles: {
      machines: Array<TerraSlicerProfile>
      processes: Array<TerraSlicerProfile>
      filaments: Array<TerraSlicerProfile>
    }
    profileCounts: {
      machines: number
      processes: number
      filaments: number
    }
    machine: {
      model?: string
      bedSizeMm?: [number, number]
      zHeightMm?: number
      nozzleMm?: number
      gcodeFlavor?: string
      defaultFilament?: string
      defaultProcess?: string
      supportsMultiFilament: boolean
      supportsWanNetwork: boolean
      supportsBedMeshCalibration: boolean
      supportsFilamentChange: boolean
      hostType?: string
    }
  }
  printer: TerraPrinterReadOnlyStatus
  modelLibrary: {
    totalMatches: number
    previewed: number
    embeddedPreviews: number
    generatedPreviews: number
    roots: TerraModelAssetScanResult['roots']
    errors: Array<string>
  }
  obsidian: {
    vaultPath: string
    memoryNotePath: string
    exists: boolean
  }
  agent: TerraAgentProfile
  workflow: Array<TerraWorkflowStep>
  capabilities: Array<TerraWorkbenchCapability>
}

export type TerraSlicePlanRequest = {
  modelPath?: string
  machineProfilePath?: string
  processProfilePath?: string
  filamentProfilePath?: string
  flowCalibration?: boolean
  bedLeveling?: boolean
  timelapse?: boolean
  capturePrint?: boolean
}

export type TerraSlicePlanResult =
  | {
      ok: true
      mode: 'dry_run_plan'
      createdAtMs: number
      slicerExecutable: string
      outputDirectory: string
      outputFile: string
      command: Array<string>
      commandPreview: string
      selected: {
        modelPath: string
        machineProfilePath: string
        processProfilePath: string
        filamentProfilePath: string
      }
      toggles: {
        flowCalibration: boolean
        bedLeveling: boolean
        timelapse: boolean
        capturePrint: boolean
      }
      lockedActions: Array<string>
      note: string
    }
  | { ok: false; status: number; error: string }

type PrinterConfig = {
  name?: string
  profile?: string
  cameraUrl?: string
  snapshotUrl?: string
  statusUrl?: string
  cameraRequestMode?: 'configured-url' | 'elegoo-mqtt-on-demand' | 'unavailable'
  host?: string
  printerId?: string
  serialNumber?: string
  firmwareVersion?: string
  discoveredPrinters?: Array<TerraDiscoveredPrinter>
  source?: 'env' | 'config-file' | 'elegoo-slicer' | 'default'
  configPath?: string
  discoveryNotes?: Array<string>
}

type ZipEntry = {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const SKIPPED_DIRS = new Set([
  '.git',
  '.Trash',
  '.cache',
  'node_modules',
  'Library',
  'Applications',
  'dist',
  'build',
  '.next',
])

const DEFAULT_MODEL_ROOT_NAMES = ['Downloads', 'HermesFactory', 'Documents', 'Desktop', '3D', 'Models', 'Prints']
const DEFAULT_LIMIT = 120
const DEFAULT_MAX_DEPTH = 10
const MAX_EMBEDDED_PREVIEW_BYTES = 350_000
const MAX_MODEL_XML_BYTES = 4_000_000

const TERRA_AGENT_SKILL_SOURCES: Array<Omit<TerraAgentSkillBinding, 'state' | 'path' | 'source'>> = [
  {
    name: 'dlv-3d-print-design-synthesis',
    label: '3D route chooser',
    category: 'routing',
    use: 'Chooses CAD / OpenSCAD / Blender / STEP / slicer path before work starts.',
  },
  {
    name: 'cad',
    label: 'STEP-first CAD',
    category: 'cad',
    use: 'Parametric CAD, assemblies, measurements, and STEP outputs.',
  },
  {
    name: 'openscad-3d-print-factory',
    label: 'OpenSCAD factory + model hunt',
    category: 'cad',
    use: 'Fast reproducible functional parts plus the free/trending printable-model discovery workflow.',
  },
  {
    name: 'hermes-factory-cad',
    label: 'Hermes Factory CAD',
    category: 'cad',
    use: 'Premium local printable geometry and ElegooSlicer handoff flow.',
  },
  {
    name: 'blender-organic-3d-print-cad',
    label: 'Organic Blender sculpt',
    category: 'organic',
    use: 'Reference-driven organic or sellable exterior printed models.',
  },
  {
    name: 'fdm-modular-mechanisms',
    label: 'FDM mechanisms',
    category: 'mechanism',
    use: 'Snap fits, pegs, hinges, drawers, tolerances, and coupon gates.',
  },
  {
    name: 'gcode',
    label: 'G-code validation',
    category: 'slicer',
    use: 'Dry-run/inspect/validate generated G-code without printer upload/start.',
  },
  {
    name: 'step-parts',
    label: 'STEP parts catalog',
    category: 'library',
    use: 'Finds verified off-the-shelf CAD parts before making placeholders.',
  },
]

function homeDir() {
  return process.env.HOME || os.homedir() || '/Users/mac'
}

function expandHome(value: string) {
  if (value === '~') return homeDir()
  if (value.startsWith('~/')) return path.join(homeDir(), value.slice(2))
  return value
}

function envRoots() {
  const raw = process.env.TERRA_3MF_ROOTS || process.env.HERMES_TERRA_3MF_ROOTS
  if (!raw) return []
  return raw
    .split(path.delimiter)
    .map((item) => expandHome(item.trim()))
    .filter(Boolean)
}

function defaultRoots() {
  const home = homeDir()
  return [
    ...envRoots(),
    ...DEFAULT_MODEL_ROOT_NAMES.map((name) => path.join(home, name)),
  ]
}

function safeLimit(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(300, Math.floor(value as number)))
}

function rootLabel(root: string) {
  const normalized = path.resolve(root)
  const home = homeDir()
  if (normalized.startsWith(path.join(home, 'Downloads'))) return 'Downloads'
  if (normalized.startsWith(path.join(home, 'HermesFactory'))) return 'HermesFactory'
  if (normalized.startsWith(path.join(home, 'Documents'))) return 'Documents'
  if (normalized.startsWith(path.join(home, 'Desktop'))) return 'Desktop'
  return path.basename(normalized) || normalized
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatDate(ms: number) {
  if (!Number.isFinite(ms)) return '--'
  return new Date(ms).toISOString().slice(0, 10)
}

function displayPath(filePath: string) {
  const home = homeDir()
  return filePath.startsWith(`${home}/`) ? `~/${filePath.slice(home.length + 1)}` : filePath
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function hermesSkillCandidatePaths(skillName: string) {
  const root = path.join(homeDir(), '.hermes', 'skills')
  return [
    path.join(root, skillName, 'SKILL.md'),
    path.join(root, 'productivity', skillName, 'SKILL.md'),
    path.join(root, 'creative', skillName, 'SKILL.md'),
    path.join(root, 'software-development', skillName, 'SKILL.md'),
    path.join(root, 'external', skillName, 'SKILL.md'),
  ]
}

async function findHermesSkillPath(skillName: string) {
  for (const candidate of hermesSkillCandidatePaths(skillName)) {
    if (await pathExists(candidate)) return candidate
  }
  return undefined
}

async function discoverTerraAgentSkills(): Promise<Array<TerraAgentSkillBinding>> {
  return Promise.all(TERRA_AGENT_SKILL_SOURCES.map(async (skill) => {
    const skillPath = await findHermesSkillPath(skill.name)
    return {
      ...skill,
      state: skillPath ? 'ready' : 'missing',
      path: skillPath ? displayPath(skillPath) : undefined,
      source: 'hermes-skill' as const,
    }
  }))
}

function terraAgentCurrentFocus(
  printer: TerraPrinterReadOnlyStatus,
  library: TerraModelAssetScanResult,
  slicerReady: boolean,
): TerraAgentProfile['currentFocus'] {
  const lifecycle = printer.metrics.printLifecycle ?? 'unknown'
  if (lifecycle === 'printing' || lifecycle === 'paused' || lifecycle === 'completed' || lifecycle === 'error') {
    return {
      stationId: 'terra-printer-control',
      label: 'Watching printer readback',
      reason: `Printer lifecycle is ${lifecycle}; Terra should stand at Printer Control.`,
    }
  }
  if ((printer.state === 'ready' || printer.state === 'configured') && printer.cameraRequestMode !== 'unavailable') {
    return {
      stationId: 'terra-printer-control',
      label: printer.state === 'ready' ? 'Checking live printer source' : 'Camera source ready for manual frame',
      reason: 'A read-only printer/camera source is configured, so Terra keeps one hand on Printer Control without opening a stream.',
    }
  }
  if (library.totalMatches <= 0) {
    return {
      stationId: 'terra-model-hunt',
      label: 'Looking for printable models',
      reason: 'No local .3mf models were indexed yet.',
    }
  }
  if (!slicerReady) {
    return {
      stationId: 'terra-modeling-studio',
      label: 'Preparing slicer profile path',
      reason: 'Model library exists, but slicer CLI/profile readiness is incomplete.',
    }
  }
  return {
    stationId: 'terra-modeling-studio',
    label: 'Ready to route 3D work',
    reason: 'Model library and slicer profile path are available; start from Modeling Studio.',
  }
}

function buildTerraAgentProfile(input: {
  obsidianPath: string
  memoryNotePath: string
  obsidianExists: boolean
  skills: Array<TerraAgentSkillBinding>
  currentFocus: TerraAgentProfile['currentFocus']
}): TerraAgentProfile {
  return {
    id: 'terra',
    label: 'Terra',
    role: '3D-printing room operator for model creation, model discovery, slicer readiness, print QA, printer readback, Obsidian memory, and skill routing.',
    memory: {
      source: 'obsidian',
      vaultPath: input.obsidianPath,
      memoryNotePath: input.memoryNotePath,
      exists: input.obsidianExists,
    },
    skills: input.skills,
    currentFocus: input.currentFocus,
    guardrails: [
      'No heat, movement, upload, print start, pause/resume/cancel, or slicer execution without explicit DLV approval and readback.',
      'Use Obsidian Terra Forge Workspace Memory as the persistent room anchor.',
      'Choose the right 3D skill path before modeling or slicing.',
      'Never fake print progress, camera QA, or slicer success.',
    ],
  }
}

async function walk3mfFiles(root: string, maxDepth: number, errors: Array<string>) {
  const files: Array<string> = []
  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return
    let entries: Array<Dirent>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (depth <= 1) errors.push(`${displayPath(dir)}: ${(error as Error).message}`)
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.') && depth > 0) continue
        await walk(fullPath, depth + 1)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.3mf')) {
        files.push(fullPath)
      }
    }
  }
  await walk(root, 0)
  return files
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 70_000); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return -1
}

function parseZipEntries(buffer: Buffer): Array<ZipEntry> {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0 || eocd + 22 > buffer.length) return []
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16)
  const entries: Array<ZipEntry> = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount && offset + 46 <= buffer.length; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function extractZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset
  if (offset < 0 || offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) return undefined
  const nameLength = buffer.readUInt16LE(offset + 26)
  const extraLength = buffer.readUInt16LE(offset + 28)
  const dataOffset = offset + 30 + nameLength + extraLength
  const dataEnd = dataOffset + entry.compressedSize
  if (dataOffset < 0 || dataEnd > buffer.length) return undefined
  const compressed = buffer.subarray(dataOffset, dataEnd)
  if (entry.method === 0) return Buffer.from(compressed)
  if (entry.method === 8) return zlib.inflateRawSync(compressed)
  return undefined
}

function previewEntryScore(entry: ZipEntry) {
  const name = entry.name.toLowerCase()
  if (!name.match(/\.(png|jpe?g|webp)$/)) return 10_000
  if (name.includes('plate_1_small')) return 0
  if (name.includes('thumbnail_small')) return 1
  if (name.includes('plate_1.png')) return 2
  if (name.includes('thumbnail_3mf')) return 3
  if (name.includes('top_1')) return 4
  if (name.includes('pick_1')) return 5
  if (name.includes('thumb')) return 6
  return 20
}

function mimeForPreviewPath(filePath: string) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

function attrNumber(source: string, name: string) {
  const match = source.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) ? value : 0
}

function safeSvgText(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char))
}

function generatedPlaceholderPreview(name: string, note = 'preview unavailable'): TerraModelAssetPreview {
  const title = safeSvgText(name.replace(/\.3mf$/i, '').slice(0, 64))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180"><title>${title}</title><defs><linearGradient id="bed" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#05090b"/><stop offset="1" stop-color="#0e1b1c"/></linearGradient><linearGradient id="part" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#78e8ff"/><stop offset="1" stop-color="#9cff8a"/></linearGradient><filter id="glow"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#78e8ff" flood-opacity=".16"/></filter></defs><rect width="280" height="180" rx="18" fill="url(#bed)"/><g opacity=".2" stroke="#78e8ff" stroke-width="1"><path d="M18 132H262M34 116H246M50 100H230M66 84H214"/><path d="M48 150 106 58M108 150 140 48M172 150 140 48M232 150 174 58"/></g><path d="M48 140 91 74 143 52 223 90 190 142Z" fill="#071315" stroke="#78e8ff" stroke-opacity=".42" stroke-width="2"/><g filter="url(#glow)"><path d="M78 124 123 62 184 86 151 146Z" fill="url(#part)" opacity=".24" stroke="#78e8ff" stroke-width="2.5"/><path d="M123 62 154 118 184 86" fill="#9cff8a" opacity=".16"/><circle cx="190" cy="76" r="18" fill="#78e8ff" opacity=".16" stroke="#78e8ff" stroke-opacity=".4"/><rect x="58" y="132" width="154" height="7" rx="3.5" fill="#9cff8a" opacity=".38"/></g><g opacity=".48"><circle cx="235" cy="34" r="4" fill="#9cff8a"/><circle cx="249" cy="34" r="4" fill="#78e8ff"/><circle cx="221" cy="34" r="4" fill="#ffd166"/></g></svg>`
  return {
    kind: 'generated',
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    source: 'generated-placeholder',
    note,
  }
}

function generatedGeometryPreview(xml: string, name: string): TerraModelAssetPreview {
  const vertices: Array<{ x: number; y: number; z: number; px: number; py: number }> = []
  const vertexRegex = /<[^>]*vertex\b([^>]*)>/gi
  let vertexMatch: RegExpExecArray | null
  while ((vertexMatch = vertexRegex.exec(xml)) && vertices.length < 25_000) {
    const attrs = vertexMatch[1]
    const x = attrNumber(attrs, 'x')
    const y = attrNumber(attrs, 'y')
    const z = attrNumber(attrs, 'z')
    vertices.push({ x, y, z, px: (x - y) * 0.72, py: (x + y) * 0.34 - z * 0.86 })
  }
  if (vertices.length < 3) return generatedPlaceholderPreview(name, 'no model vertices found')

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.px)
    maxX = Math.max(maxX, vertex.px)
    minY = Math.min(minY, vertex.py)
    maxY = Math.max(maxY, vertex.py)
  }
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const scale = Math.min(220 / width, 128 / height)
  const mapPoint = (index: number) => {
    const vertex = vertices.at(index)
    if (!vertex) return '0,0'
    const x = 140 + (vertex.px - (minX + width / 2)) * scale
    const y = 92 + (vertex.py - (minY + height / 2)) * scale
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }

  const triangleRegex = /<[^>]*triangle\b([^>]*)>/gi
  const triangles: Array<{ sort: number; points: string }> = []
  let triangleMatch: RegExpExecArray | null
  let seen = 0
  while ((triangleMatch = triangleRegex.exec(xml)) && seen < 20_000) {
    seen += 1
    if (seen % Math.max(1, Math.floor(20_000 / 900)) !== 0 && triangles.length > 900) continue
    const attrs = triangleMatch[1]
    const v1 = Math.floor(attrNumber(attrs, 'v1'))
    const v2 = Math.floor(attrNumber(attrs, 'v2'))
    const v3 = Math.floor(attrNumber(attrs, 'v3'))
    if (!vertices[v1] || !vertices[v2] || !vertices[v3]) continue
    const sort = (vertices[v1].x + vertices[v1].y + vertices[v1].z + vertices[v2].x + vertices[v2].y + vertices[v2].z + vertices[v3].x + vertices[v3].y + vertices[v3].z) / 3
    triangles.push({ sort, points: `${mapPoint(v1)} ${mapPoint(v2)} ${mapPoint(v3)}` })
  }

  const sampled = triangles
    .sort((a, b) => a.sort - b.sort)
    .slice(-950)
    .map((triangle, index) => `<polygon points="${triangle.points}" fill="${index % 3 === 0 ? '#78e8ff' : index % 3 === 1 ? '#9cff8a' : '#3aa8ff'}" fill-opacity=".22" stroke="#d9f6e7" stroke-opacity=".18" stroke-width=".45"/>`)
    .join('')
  const body = sampled || vertices.slice(0, 900).map((vertex) => {
    const cx = 140 + (vertex.px - (minX + width / 2)) * scale
    const cy = 92 + (vertex.py - (minY + height / 2)) * scale
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.1" fill="#78e8ff" opacity=".42"/>`
  }).join('')
  const title = safeSvgText(name.replace(/\.3mf$/i, '').slice(0, 64))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180"><title>${title}</title><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#05090b"/><stop offset="1" stop-color="#0f1f20"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#78e8ff" flood-opacity=".16"/></filter></defs><rect width="280" height="180" rx="18" fill="url(#bg)"/><g opacity=".18" stroke="#78e8ff" stroke-width="1"><path d="M18 132H262M34 116H246M50 100H230M66 84H214"/><path d="M48 150 106 58M108 150 140 48M172 150 140 48M232 150 174 58"/></g><ellipse cx="140" cy="137" rx="96" ry="13" fill="#78e8ff" opacity=".08"/><g filter="url(#shadow)">${body}</g><path d="M46 142H234" stroke="#9cff8a" stroke-opacity=".38" stroke-width="3" stroke-linecap="round"/><g opacity=".46"><circle cx="235" cy="34" r="4" fill="#9cff8a"/><circle cx="249" cy="34" r="4" fill="#78e8ff"/><circle cx="221" cy="34" r="4" fill="#ffd166"/></g></svg>`
  return {
    kind: 'generated',
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    source: '3D/3dmodel.model',
    note: `generated from ${vertices.length} vertices`,
  }
}

async function create3mfPreview(filePath: string, name: string): Promise<TerraModelAssetPreview> {
  try {
    const buffer = await fs.readFile(filePath)
    const entries = parseZipEntries(buffer)
    const previewEntry = entries
      .filter((entry) => previewEntryScore(entry) < 10_000 && entry.uncompressedSize <= MAX_EMBEDDED_PREVIEW_BYTES)
      .sort((a, b) => previewEntryScore(a) - previewEntryScore(b) || a.uncompressedSize - b.uncompressedSize)
      .at(0)
    if (previewEntry) {
      const image = extractZipEntry(buffer, previewEntry)
      if (image?.length) {
        return {
          kind: 'embedded',
          dataUrl: `data:${mimeForPreviewPath(previewEntry.name)};base64,${image.toString('base64')}`,
          source: previewEntry.name,
        }
      }
    }

    const modelEntry = entries
      .filter((entry) => entry.name.toLowerCase().endsWith('.model') && entry.uncompressedSize <= MAX_MODEL_XML_BYTES)
      .sort((a, b) => (a.name === '3D/3dmodel.model' ? -1 : 0) - (b.name === '3D/3dmodel.model' ? -1 : 0) || a.uncompressedSize - b.uncompressedSize)
      .at(0)
    if (modelEntry) {
      const model = extractZipEntry(buffer, modelEntry)
      if (model?.length) return generatedGeometryPreview(model.toString('utf8'), name)
    }
    return generatedPlaceholderPreview(name, 'no embedded thumbnail or readable 3MF model')
  } catch (error) {
    return generatedPlaceholderPreview(name, (error as Error).message)
  }
}

export async function scanTerraModelAssets(options: TerraModelAssetScanOptions = {}): Promise<TerraModelAssetScanResult> {
  const scannedAtMs = options.nowMs ?? Date.now()
  const query = (options.query ?? '').trim().toLowerCase()
  const limit = safeLimit(options.limit)
  const maxDepth = Math.max(1, Math.min(16, Math.floor(options.maxDepth ?? DEFAULT_MAX_DEPTH)))
  const includePreviews = options.includePreviews !== false
  const roots = Array.from(new Set((options.roots?.length ? options.roots : defaultRoots()).map((item) => path.resolve(expandHome(item)))))
  const errors: Array<string> = []
  const rootReadback: TerraModelAssetScanResult['roots'] = []
  const candidatePaths = new Set<string>()

  for (const root of roots) {
    const exists = await pathExists(root)
    rootReadback.push({ label: rootLabel(root), path: displayPath(root), exists })
    if (!exists) continue
    for (const filePath of await walk3mfFiles(root, maxDepth, errors)) {
      candidatePaths.add(path.resolve(filePath))
    }
  }

  const assetsWithoutPreviews: Array<Omit<TerraModelAsset, 'preview'>> = []
  for (const filePath of candidatePaths) {
    try {
      const stats = await fs.stat(filePath)
      const name = path.basename(filePath)
      const dir = path.dirname(filePath)
      assetsWithoutPreviews.push({
        id: Buffer.from(filePath).toString('base64url'),
        name,
        path: filePath,
        displayPath: displayPath(filePath),
        directory: displayPath(dir),
        rootLabel: rootLabel(filePath),
        sizeBytes: stats.size,
        sizeLabel: formatBytes(stats.size),
        modifiedAtMs: stats.mtimeMs,
        modifiedLabel: formatDate(stats.mtimeMs),
      })
    } catch (error) {
      errors.push(`${displayPath(filePath)}: ${(error as Error).message}`)
    }
  }

  const filtered = assetsWithoutPreviews
    .filter((asset) => !query || `${asset.name} ${asset.displayPath}`.toLowerCase().includes(query))
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs || a.name.localeCompare(b.name))

  const limited = filtered.slice(0, limit)
  const assets: Array<TerraModelAsset> = includePreviews
    ? await Promise.all(limited.map(async (asset) => ({ ...asset, preview: await create3mfPreview(asset.path, asset.name) })))
    : limited.map((asset) => ({ ...asset, preview: { kind: 'none' as const } }))

  return {
    ok: true,
    scannedAtMs,
    query,
    limit,
    totalMatches: filtered.length,
    assets,
    roots: rootReadback,
    errors: errors.slice(0, 12),
  }
}

async function readPrinterConfigFile(): Promise<{ config: PrinterConfig; path?: string }> {
  const candidates = [
    path.join(homeDir(), '.hermes', 'terra-printer.json'),
    path.join(homeDir(), '.config', 'hermes', 'terra-printer.json'),
  ]
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8')
      const parsed = JSON.parse(raw) as PrinterConfig
      return { config: { ...parsed, source: 'config-file', configPath: candidate }, path: candidate }
    } catch {
      // Missing or invalid local config is non-fatal. The UI will show what is missing.
    }
  }
  return { config: {} }
}

function envPrinterConfig(): PrinterConfig {
  const config: PrinterConfig = {
    name: process.env.TERRA_PRINTER_NAME || process.env.HERMES_TERRA_PRINTER_NAME,
    profile: process.env.TERRA_PRINTER_PROFILE || process.env.HERMES_TERRA_PRINTER_PROFILE,
    cameraUrl: process.env.TERRA_PRINTER_CAMERA_URL || process.env.HERMES_TERRA_PRINTER_CAMERA_URL,
    snapshotUrl: process.env.TERRA_PRINTER_SNAPSHOT_URL || process.env.HERMES_TERRA_PRINTER_SNAPSHOT_URL,
    statusUrl: process.env.TERRA_PRINTER_STATUS_URL || process.env.HERMES_TERRA_PRINTER_STATUS_URL,
  }
  config.cameraRequestMode = config.cameraUrl || config.snapshotUrl ? 'configured-url' : undefined
  return Object.values(config).some(Boolean) ? { ...config, source: 'env' } : config
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function readJsonFile(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function readElegooSlicerPrinterConfig(): Promise<PrinterConfig> {
  const base = elegooSlicerBaseDir()
  const notes: Array<string> = []
  const printerListPath = path.join(base, 'user', 'printer_list.json')
  const confPath = path.join(base, 'ElegooSlicer.conf')
  const tabStatePath = path.join(base, 'user', 'printer_tab_state.json')
  const printerList = await readJsonFile(printerListPath)
  if (!isRecord(printerList)) return { discoveryNotes: ['ElegooSlicer printer list not found.'] }

  const conf = await readJsonFile(confPath)
  const tabState = await readJsonFile(tabStatePath)
  const selectedFromConf = isRecord(conf) && isRecord(conf.print) ? stringValue(conf.print.printsend_selected_printer_id) : undefined
  const selectedFromTab = isRecord(tabState) && Array.isArray(tabState.tabs)
    ? stringValue((tabState.tabs.find((tab) => isRecord(tab) && stringValue(tab.printerId)) as Record<string, unknown> | undefined)?.printerId)
    : undefined
  const selectedId = selectedFromConf ?? selectedFromTab
  const discoveredPrinters: Array<TerraDiscoveredPrinter> = Object.entries(printerList)
    .filter(([, value]) => isRecord(value))
    .map(([printerId, value]) => {
      const record = value as Record<string, unknown>
      const host = stringValue(record.host)
      const serialNumber = stringValue(record.serialNumber) ?? stringValue(record.mainboardId)
      const cameraRequestMode = host && serialNumber && stringValue(record.accessCode)
        ? 'elegoo-mqtt-on-demand' as const
        : 'unavailable' as const
      return {
        printerId,
        name: stringValue(record.printerName) ?? stringValue(record.name) ?? printerId,
        model: stringValue(record.printerModel),
        vendor: stringValue(record.vendor),
        host,
        firmwareVersion: stringValue(record.firmwareVersion),
        serialNumber,
        cameraRequestMode,
        source: 'elegoo-slicer' as const,
      }
    })
  const selected = discoveredPrinters.find((printer) => printer.printerId === selectedId) ?? discoveredPrinters.find((printer) => printer.host) ?? discoveredPrinters.at(0)
  if (!selected) return { discoveryNotes: ['ElegooSlicer printer list is empty.'] }
  if (selected.host) notes.push(`ElegooSlicer discovered ${selected.name} at ${selected.host}.`)
  if (selected.cameraRequestMode === 'elegoo-mqtt-on-demand') notes.push('Camera URL must be requested from the printer via Elegoo MQTT; no static port or stream URL is assumed.')
  if (selectedId) notes.push(`Selected printer: ${selectedId}.`)

  return {
    name: selected.name,
    profile: selected.model ? `${selected.model} via ElegooSlicer read-only LAN discovery` : 'ElegooSlicer read-only LAN discovery',
    host: selected.host,
    printerId: selected.printerId,
    serialNumber: selected.serialNumber,
    firmwareVersion: selected.firmwareVersion,
    cameraRequestMode: selected.cameraRequestMode,
    discoveredPrinters,
    source: 'elegoo-slicer',
    configPath: printerListPath,
    discoveryNotes: notes,
  }
}

function firstNumber(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}

function firstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function getByPath(source: unknown, dottedPath: string) {
  return dottedPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, source)
}

function normalizeProgressPercent(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return undefined
  const raw = value as number
  const percent = raw >= 0 && raw <= 1 ? raw * 100 : raw
  return Math.max(0, Math.min(100, Math.round(percent * 10) / 10))
}

function normalizeLifecycle(state?: string, progress?: number): TerraPrinterReadOnlyStatus['metrics']['printLifecycle'] {
  const value = state?.toLowerCase() ?? ''
  if (/complete|completed|finish|finished|done|success/.test(value)) return 'completed'
  if (/pause|paused/.test(value)) return 'paused'
  if (/error|fail|failed|alarm|cancel|cancelled|abort/.test(value)) return 'error'
  if (/print|printing|busy|running|work/.test(value)) return 'printing'
  if (Number.isFinite(progress ?? NaN) && (progress as number) >= 99.5) return 'completed'
  if (Number.isFinite(progress ?? NaN) && (progress as number) > 0) return 'printing'
  if (/idle|standby|ready|camera online/.test(value)) return 'idle'
  return 'unknown'
}

function parsePrinterPayload(payload: unknown): TerraPrinterReadOnlyStatus['metrics'] {
  const queueState = firstString(
    getByPath(payload, 'state.text'),
    getByPath(payload, 'result.status.print_stats.state'),
    getByPath(payload, 'status.print_stats.state'),
    getByPath(payload, 'print_stats.state'),
    getByPath(payload, 'printer.status'),
    getByPath(payload, 'current_print.state'),
    getByPath(payload, 'state'),
    getByPath(payload, 'status'),
  )
  const progressPercent = normalizeProgressPercent(firstNumber(
    getByPath(payload, 'progress.completion'),
    getByPath(payload, 'result.status.virtual_sdcard.progress'),
    getByPath(payload, 'status.virtual_sdcard.progress'),
    getByPath(payload, 'virtual_sdcard.progress'),
    getByPath(payload, 'current_print.progress'),
    getByPath(payload, 'print.progress'),
    getByPath(payload, 'progress'),
  ))
  const elapsedSeconds = firstNumber(
    getByPath(payload, 'result.status.print_stats.print_duration'),
    getByPath(payload, 'status.print_stats.print_duration'),
    getByPath(payload, 'print_stats.print_duration'),
    getByPath(payload, 'current_print.elapsed'),
    getByPath(payload, 'elapsed'),
  )
  const totalSeconds = firstNumber(
    getByPath(payload, 'current_print.total_time'),
    getByPath(payload, 'print.total_time'),
    getByPath(payload, 'totalTime'),
    getByPath(payload, 'total_time'),
  )
  const remainingSeconds = firstNumber(
    getByPath(payload, 'current_print.remaining'),
    getByPath(payload, 'print.remaining'),
    getByPath(payload, 'remainingTime'),
    getByPath(payload, 'remaining_time'),
  ) ?? (Number.isFinite(totalSeconds ?? NaN) && Number.isFinite(elapsedSeconds ?? NaN) ? Math.max(0, (totalSeconds as number) - (elapsedSeconds as number)) : undefined)
  return {
    queueState,
    jobName: firstString(
      getByPath(payload, 'job.file.name'),
      getByPath(payload, 'result.status.print_stats.filename'),
      getByPath(payload, 'status.print_stats.filename'),
      getByPath(payload, 'print_stats.filename'),
      getByPath(payload, 'current_print.filename'),
      getByPath(payload, 'jobName'),
      getByPath(payload, 'file'),
    ),
    progressPercent,
    progressSource: progressPercent !== undefined ? 'read-only status JSON' : undefined,
    printLifecycle: normalizeLifecycle(queueState, progressPercent),
    elapsedSeconds,
    remainingSeconds,
    totalSeconds,
    bedTempC: firstNumber(
      getByPath(payload, 'temperature.bed.actual'),
      getByPath(payload, 'result.status.heater_bed.temperature'),
      getByPath(payload, 'status.heater_bed.temperature'),
      getByPath(payload, 'heater_bed.temperature'),
      getByPath(payload, 'bedTemp'),
      getByPath(payload, 'bed_temp'),
    ),
    nozzleTempC: firstNumber(
      getByPath(payload, 'temperature.tool0.actual'),
      getByPath(payload, 'result.status.extruder.temperature'),
      getByPath(payload, 'status.extruder.temperature'),
      getByPath(payload, 'extruder.temperature'),
      getByPath(payload, 'nozzleTemp'),
      getByPath(payload, 'nozzle_temp'),
    ),
  }
}

async function fetchPrinterMetrics(statusUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1600)
  try {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      return { state: 'unreachable' as const, metrics: {}, error: `HTTP ${response.status}` }
    }
    const payload = await response.json()
    return { state: 'ready' as const, metrics: parsePrinterPayload(payload) }
  } catch (error) {
    return { state: 'unreachable' as const, metrics: {}, error: (error as Error).message }
  } finally {
    clearTimeout(timeout)
  }
}

async function probeCamera(cameraUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1700)
  try {
    const response = await fetch(cameraUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'image/jpeg,multipart/x-mixed-replace,*/*' },
    })
    const contentType = response.headers.get('content-type') ?? ''
    return {
      ready: response.ok || contentType.includes('image') || contentType.includes('multipart'),
      error: response.ok ? undefined : `HTTP ${response.status}`,
      contentType,
    }
  } catch (error) {
    return { ready: false, error: (error as Error).message, contentType: '' }
  } finally {
    controller.abort()
    clearTimeout(timeout)
  }
}

function mergePrinterConfig(...configs: Array<PrinterConfig>): PrinterConfig {
  return configs.reduce<PrinterConfig>((merged, config) => ({
    ...merged,
    ...Object.fromEntries(
      Object.entries(config as Record<string, unknown>)
        .filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ) as PrinterConfig,
    discoveryNotes: [...(merged.discoveryNotes ?? []), ...(config.discoveryNotes ?? [])],
    discoveredPrinters: config.discoveredPrinters ?? merged.discoveredPrinters,
  }), {})
}

export async function getTerraPrinterReadOnlyStatus(nowMs = Date.now()): Promise<TerraPrinterReadOnlyStatus> {
  const env = envPrinterConfig()
  const file = await readPrinterConfigFile()
  const elegoo = await readElegooSlicerPrinterConfig()
  const config = mergePrinterConfig(elegoo, file.config, env)
  const source = config.source ?? 'default'
  const name = config.name || 'Elegoo Centauri Carbon 2'
  const profile = config.profile || 'read-only printer connector'
  const cameraRequestMode = config.cameraRequestMode
    ?? (config.cameraUrl || config.snapshotUrl ? 'configured-url' : 'unavailable')
  const configured = Boolean(config.statusUrl || cameraRequestMode !== 'unavailable')
  const lockedActions = ['printer_upload', 'printer_start', 'printer_pause', 'printer_cancel', 'printer_heat', 'printer_axis_move', 'printer_settings_change']
  const discoveryNotes = config.discoveryNotes ?? []

  if (!configured) {
    return {
      ok: true,
      configured: false,
      name,
      profile,
      state: 'not_configured',
      message: 'No camera/status URL found. Terra checked env, local config, and ElegooSlicer discovery.',
      lastCheckedAtMs: nowMs,
      cameraRequestMode,
      source,
      configPath: file.path ? displayPath(file.path) : displayPath(path.join(homeDir(), '.hermes', 'terra-printer.json')),
      host: config.host,
      printerId: config.printerId,
      serialNumber: config.serialNumber,
      firmwareVersion: config.firmwareVersion,
      discoveredPrinters: config.discoveredPrinters,
      discoveryNotes,
      metrics: {},
      lockedActions,
    }
  }

  const status = config.statusUrl ? await fetchPrinterMetrics(config.statusUrl) : { state: 'configured' as const, metrics: {} as TerraPrinterReadOnlyStatus['metrics'] }
  const cameraProbeEnabled = (process.env.TERRA_PRINTER_STATUS_PROBE_CAMERA || process.env.HERMES_TERRA_PRINTER_STATUS_PROBE_CAMERA) === '1'
  const cameraProbe = cameraProbeEnabled && config.cameraUrl ? await probeCamera(config.cameraUrl) : undefined
  const hasManualCameraSource = cameraRequestMode !== 'unavailable'
  const state = status.state === 'ready' || cameraProbe?.ready
    ? 'ready' as const
    : status.state === 'unreachable' || cameraProbe?.error
      ? 'unreachable' as const
      : hasManualCameraSource
        ? 'configured' as const
        : status.state
  const statusMetrics: TerraPrinterReadOnlyStatus['metrics'] = status.metrics
  const metrics = {
    ...statusMetrics,
    queueState: statusMetrics.queueState ?? (cameraProbe?.ready
      ? 'camera online'
      : cameraRequestMode === 'elegoo-mqtt-on-demand'
        ? 'camera available on demand'
        : hasManualCameraSource
          ? 'camera configured manual frame only'
          : undefined),
    printLifecycle: statusMetrics.printLifecycle ?? normalizeLifecycle(statusMetrics.queueState ?? (cameraProbe?.ready ? 'camera online' : undefined), statusMetrics.progressPercent),
  }
  const error = 'error' in status ? status.error : cameraProbe?.error

  return {
    ok: true,
    configured: true,
    name,
    profile,
    state,
    message: state === 'ready'
      ? 'Live read-only printer status connected. Camera remains manual-frame only.'
      : state === 'configured' && cameraRequestMode === 'elegoo-mqtt-on-demand'
        ? 'Printer discovered. Camera requires one explicit MQTT request; no static stream URL is assumed.'
        : state === 'configured' && hasManualCameraSource
          ? 'Printer camera source is configured, but Workspace will not open the stream until you choose Connect camera.'
        : state === 'unreachable'
          ? 'Printer discovered, but the read-only status endpoint is unreachable right now.'
          : 'Printer read-only config is present. Waiting for status response.',
    lastCheckedAtMs: nowMs,
    cameraUrl: config.cameraUrl,
    snapshotUrl: config.snapshotUrl,
    statusUrl: config.statusUrl,
    cameraRequestMode,
    source,
    configPath: config.configPath ? displayPath(config.configPath) : file.path ? displayPath(file.path) : undefined,
    host: config.host,
    printerId: config.printerId,
    serialNumber: config.serialNumber,
    firmwareVersion: config.firmwareVersion,
    discoveredPrinters: config.discoveredPrinters,
    discoveryNotes: [
      ...discoveryNotes,
      ...(cameraRequestMode === 'elegoo-mqtt-on-demand'
        ? ['camera remains disconnected by default; a manual request asks Elegoo MQTT for the current VideoUrl']
        : hasManualCameraSource && !cameraProbeEnabled
          ? ['camera stream probe skipped by default; use manual frame endpoint only', 'configured camera URL is not proof of a reachable frame until manual readback succeeds']
          : []),
      ...(cameraProbe?.contentType ? [`camera content-type: ${cameraProbe.contentType}`] : []),
    ],
    metrics,
    lockedActions,
    error,
  }
}

function elegooSlicerBaseDir() {
  return expandHome(process.env.TERRA_ELEGOO_SLICER_BASE || process.env.HERMES_TERRA_ELEGOO_SLICER_BASE || '~/Library/Application Support/ElegooSlicer')
}

function elegooSlicerAppPath() {
  return expandHome(process.env.TERRA_ELEGOO_SLICER_APP || process.env.HERMES_TERRA_ELEGOO_SLICER_APP || '/Applications/ElegooSlicer.app')
}

function elegooSlicerExecutablePath(appPath = elegooSlicerAppPath()) {
  return path.join(appPath, 'Contents', 'MacOS', 'ElegooSlicer')
}

function obsidianVaultPath() {
  return expandHome(process.env.TERRA_OBSIDIAN_VAULT || process.env.HERMES_OBSIDIAN_VAULT || '~/Documents/Hermes Second Brain')
}

function boolSetting(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function firstArrayString(value: unknown) {
  if (Array.isArray(value)) return stringValue(value[0])
  return stringValue(value)
}

function firstNumericString(value: unknown) {
  const raw = firstArrayString(value)
  if (!raw) return undefined
  const number = Number(raw)
  return Number.isFinite(number) ? number : undefined
}

function profileId(filePath: string) {
  return Buffer.from(filePath).toString('base64url')
}

function profileDisplayPath(filePath: string) {
  const base = elegooSlicerBaseDir()
  const relative = path.relative(base, filePath)
  return relative && !relative.startsWith('..') ? `ElegooSlicer/${relative}` : displayPath(filePath)
}

function parseProfileMaterial(record: Record<string, unknown>) {
  const direct = firstArrayString(record.filament_type) ?? firstArrayString(record.filament_vendor) ?? firstArrayString(record.filament_notes)
  if (direct) return direct
  const name = stringValue(record.name)
  return name?.match(/\b(PLA\+?|PETG|TPU|ASA|ABS|PAHT-CF|PA-CF|PET-CF|PETG-CF|PLA-CF)\b/i)?.[1]
}

function normalizeSlicerProfile(kind: TerraSlicerProfileKind, filePath: string, data: unknown, selectedName?: string): TerraSlicerProfile | undefined {
  if (!isRecord(data)) return undefined
  const name = stringValue(data.name) ?? path.basename(filePath, '.json')
  const profile: TerraSlicerProfile = {
    id: profileId(filePath),
    kind,
    name,
    path: filePath,
    displayPath: profileDisplayPath(filePath),
    source: stringValue(data.from) ?? (filePath.includes('/system/') ? 'system' : 'user'),
    default: selectedName ? name === selectedName || path.basename(filePath, '.json') === selectedName : undefined,
  }
  const nozzle = firstNumericString(data.nozzle_diameter) ?? firstNumericString(data.printer_variant)
  if (nozzle) profile.nozzleMm = nozzle
  const material = parseProfileMaterial(data)
  if (material) profile.material = material
  const color = firstArrayString(data.default_filament_colour) ?? firstArrayString(data.filament_colour) ?? firstArrayString(data.filament_colors)
  if (color) profile.color = color.split(',')[0]
  return profile
}

async function readJsonProfiles(kind: TerraSlicerProfileKind, dir: string, selectedName?: string, max = 60) {
  const profiles: Array<TerraSlicerProfile> = []
  async function walk(current: string, depth: number) {
    if (depth > 3) return
    let entries: Array<Dirent>
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const data = await readJsonFile(fullPath)
        const profile = normalizeSlicerProfile(kind, fullPath, data, selectedName)
        if (profile) profiles.push(profile)
      }
    }
  }
  await walk(dir, 0)
  profiles.sort((a, b) => Number(Boolean(b.default)) - Number(Boolean(a.default)) || a.name.localeCompare(b.name))
  return { count: profiles.length, profiles: profiles.slice(0, max) }
}

function readPlistString(source: string, key: string) {
  const match = source.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))
  return match?.[1]
}

async function readElegooAppInfo() {
  const appPath = elegooSlicerAppPath()
  const executablePath = elegooSlicerExecutablePath(appPath)
  const infoPath = path.join(appPath, 'Contents', 'Info.plist')
  const appInstalled = await pathExists(appPath)
  const cliAvailable = await pathExists(executablePath)
  try {
    const plist = await fs.readFile(infoPath, 'utf8')
    return {
      appInstalled,
      appPath,
      executablePath: cliAvailable ? executablePath : undefined,
      cliAvailable,
      version: readPlistString(plist, 'CFBundleShortVersionString'),
      bundleIdentifier: readPlistString(plist, 'CFBundleIdentifier'),
    }
  } catch {
    return { appInstalled, appPath, executablePath: cliAvailable ? executablePath : undefined, cliAvailable }
  }
}

async function readElegooConf() {
  const configPath = path.join(elegooSlicerBaseDir(), 'ElegooSlicer.conf')
  const data = await readJsonFile(configPath)
  return { configPath, data: isRecord(data) ? data : {} }
}

function selectedElegooFamily(selectedMachine?: string) {
  if (!selectedMachine) return 'ECC2'
  if (/Carbon 2|CC2|ECC2/i.test(selectedMachine)) return 'ECC2'
  if (/Centauri Carbon|ECC/i.test(selectedMachine)) return 'ECC'
  if (/Centauri|EC/i.test(selectedMachine)) return 'EC'
  return 'ECC2'
}

function parseBedSize(printableArea: unknown): [number, number] | undefined {
  if (!Array.isArray(printableArea)) return undefined
  const points = printableArea.map((item) => stringValue(item)?.split('x').map(Number)).filter((point): point is Array<number> => Boolean(point && point.length === 2 && point.every(Number.isFinite)))
  if (!points.length) return undefined
  return [Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1]))]
}

function buildMachineFacts(machineProfile?: TerraSlicerProfile, machineRecord?: Record<string, unknown>) {
  const startGcode = stringValue(machineRecord?.machine_start_gcode) ?? ''
  return {
    model: stringValue(machineRecord?.printer_model) ?? machineProfile?.name,
    bedSizeMm: parseBedSize(machineRecord?.printable_area),
    zHeightMm: firstNumericString(machineRecord?.printable_height),
    nozzleMm: machineProfile?.nozzleMm ?? firstNumericString(machineRecord?.nozzle_diameter),
    gcodeFlavor: stringValue(machineRecord?.gcode_flavor),
    defaultFilament: firstArrayString(machineRecord?.default_filament_profile),
    defaultProcess: stringValue(machineRecord?.default_print_profile),
    supportsMultiFilament: boolSetting(machineRecord?.support_multi_filament),
    supportsWanNetwork: boolSetting(machineRecord?.support_wan_network),
    supportsBedMeshCalibration: startGcode.includes('BED_MESH_CALIBRATE') || Boolean(machineRecord?.bed_mesh_min),
    supportsFilamentChange: Boolean(stringValue(machineRecord?.change_filament_gcode) || stringValue(machineRecord?.machine_pause_gcode)),
    hostType: stringValue(machineRecord?.host_type),
  }
}

function stepState(ready: boolean, blockedState: TerraWorkflowStep['state'] = 'blocked'): TerraWorkflowStep['state'] {
  return ready ? 'ready' : blockedState
}

async function discoverElegooSlicerProfiles() {
  const base = elegooSlicerBaseDir()
  const { configPath, data: conf } = await readElegooConf()
  const selectedMachine = firstString(getByPath(conf, 'presets.machine'), getByPath(conf, 'prepare.current_machine'), getByPath(conf, 'machine.name'))
  const selectedPrinterId = firstString(getByPath(conf, 'recent.printsend_selected_printer_id'), getByPath(conf, 'print.printsend_selected_printer_id'))
  const family = selectedElegooFamily(selectedMachine)
  const machineDir = path.join(base, 'system', 'Elegoo', 'machine', family)
  const processDir = path.join(base, 'system', 'Elegoo', 'process', family)
  const filamentDir = path.join(base, 'system', 'Elegoo', 'filament', family)
  const machines = await readJsonProfiles('machine', machineDir, selectedMachine, 18)
  const selectedMachineProfile = machines.profiles.find((profile) => profile.default) ?? machines.profiles.at(0)
  const selectedMachineRecord = selectedMachineProfile ? await readJsonFile(selectedMachineProfile.path) : undefined
  const machineRecord = isRecord(selectedMachineRecord) ? selectedMachineRecord : undefined
  const processes = await readJsonProfiles('process', processDir, stringValue(machineRecord?.default_print_profile), 32)
  const filaments = await readJsonProfiles('filament', filamentDir, firstArrayString(machineRecord?.default_filament_profile), 42)
  return {
    base,
    configPath,
    selectedMachine,
    selectedPrinterId,
    selectedMachineProfile,
    profiles: {
      machines: machines.profiles,
      processes: processes.profiles,
      filaments: filaments.profiles,
    },
    profileCounts: {
      machines: machines.count,
      processes: processes.count,
      filaments: filaments.count,
    },
    machine: buildMachineFacts(selectedMachineProfile, machineRecord),
    settings: {
      bedLeveling: boolSetting(getByPath(conf, 'print.bed_leveling')),
      heatedBedLeveling: boolSetting(getByPath(conf, 'recent.printsend_heated_bed_leveling')),
      flowCalibration: boolSetting(getByPath(conf, 'print.flow_cali')),
      timelapse: boolSetting(getByPath(conf, 'print.timelapse')) || boolSetting(getByPath(conf, 'recent.printsend_timelapse')),
      uploadAndPrint: boolSetting(getByPath(conf, 'recent.printsend_upload_and_print')),
      autoRefill: boolSetting(getByPath(conf, 'recent.printsend_auto_refill')),
      bedType: firstString(getByPath(conf, 'recent.printsend_bed_type')),
    },
  }
}

export async function getTerraWorkbenchCapabilities(nowMs = Date.now()): Promise<TerraWorkbenchCapabilities> {
  const [appInfo, slicer, printer, library, skills] = await Promise.all([
    readElegooAppInfo(),
    discoverElegooSlicerProfiles(),
    getTerraPrinterReadOnlyStatus(nowMs),
    scanTerraModelAssets({ limit: 180, includePreviews: true, nowMs }),
    discoverTerraAgentSkills(),
  ])
  const obsidianPath = obsidianVaultPath()
  const memoryNotePath = path.join(obsidianPath, '06 Hermes', 'Terra Forge Workspace Memory.md')
  const obsidianExists = await pathExists(obsidianPath)
  const modelReady = library.totalMatches > 0
  const filamentReady = slicer.profileCounts.filaments > 0
  const processReady = slicer.profileCounts.processes > 0
  const slicerReady = appInfo.cliAvailable && processReady && filamentReady
  const printerLive = printer.state === 'ready'
  const printerConfigured = printerLive || printer.state === 'configured'
  const progressLive = printer.metrics.progressPercent !== undefined || (printer.metrics.printLifecycle && printer.metrics.printLifecycle !== 'unknown')
  const cameraConfigured = Boolean(printer.cameraUrl || printer.snapshotUrl)
  const cameraLive = printerLive && cameraConfigured
  const workflow: Array<TerraWorkflowStep> = [
    { id: 'web-model-search', label: 'Find internet model', state: 'available', live: false, locked: false, requiresApproval: false, source: '/api/war-room/terra-model-search', note: 'Printables read-only search uses free/non-AI/popular filters from the model-discovery skill; no file download.' },
    { id: 'choose-model', label: 'Choose real model', state: stepState(modelReady), live: true, locked: false, requiresApproval: false, source: '/api/war-room/terra-assets', note: `${library.totalMatches} local .3mf files indexed.` },
    { id: 'choose-material', label: 'Choose filament/color', state: stepState(filamentReady), live: true, locked: false, requiresApproval: false, source: slicer.configPath, note: `${slicer.profileCounts.filaments} ${selectedElegooFamily(slicer.selectedMachine)} filament profiles.` },
    { id: 'calibration', label: 'Calibration toggles', state: slicer.machine.supportsBedMeshCalibration || slicer.settings.flowCalibration ? 'ready' : 'unknown', live: true, locked: false, requiresApproval: false, source: slicer.configPath, note: `bed mesh ${slicer.machine.supportsBedMeshCalibration ? 'supported' : 'unknown'} · flow ${slicer.settings.flowCalibration ? 'on' : 'off'} · timelapse ${slicer.settings.timelapse ? 'on' : 'off'}` },
    { id: 'slice-plan', label: 'Build slice dry-run plan', state: appInfo.cliAvailable && processReady ? 'ready' : 'blocked', live: true, locked: false, requiresApproval: false, source: appInfo.executablePath ?? appInfo.appPath, note: appInfo.cliAvailable ? 'ElegooSlicer CLI exists; Workspace creates a no-execute plan first.' : 'ElegooSlicer CLI executable not found.' },
    { id: 'send-to-printer', label: 'Upload / start print', state: printerConfigured ? 'locked' : 'blocked', live: printerLive, locked: true, requiresApproval: true, source: printer.source, note: printerConfigured ? 'Printer source exists, but upload/start remains approval-gated and no stream is opened.' : printer.message },
    { id: 'print-progress', label: 'Live progress / completion', state: progressLive ? 'ready' : printer.statusUrl ? 'unknown' : 'blocked', live: Boolean(progressLive), locked: false, requiresApproval: false, source: printer.statusUrl ?? printer.source, note: progressLive ? `${printer.metrics.progressPercent ?? '--'}% · ${printer.metrics.printLifecycle ?? 'unknown'}` : 'No verified read-only progress field exposed yet; Terra will not fake the meter.' },
    { id: 'record-print', label: 'Capture / timelapse', state: cameraLive ? 'ready' : cameraConfigured ? 'available' : 'blocked', live: cameraLive, locked: false, requiresApproval: false, source: '/api/war-room/terra-printer-frame', note: cameraLive ? 'Live JPEG frame proxy available.' : cameraConfigured ? 'Camera URL is configured for one manual frame on demand; Workspace does not open a stream.' : 'No camera URL discovered.' },
    { id: 'post-print-qa', label: 'Post-print camera QA', state: cameraLive ? 'ready' : cameraConfigured ? 'available' : 'blocked', live: cameraLive, locked: false, requiresApproval: false, source: '/api/war-room/terra-print-qa', note: cameraLive ? 'After completion, Terra captures a real frame and flags blank/blur/stringy failure risk.' : cameraConfigured ? 'Manual QA can request one frame only; no fake QA pass and no held stream.' : 'QA needs a camera URL.' },
    { id: 'agent-memory', label: 'Terra agent memory', state: obsidianExists ? 'ready' : 'blocked', live: true, locked: false, requiresApproval: false, source: memoryNotePath, note: obsidianExists ? 'Obsidian vault detected; Terra memory note can be maintained.' : 'Obsidian vault not found.' },
  ]
  const agent = buildTerraAgentProfile({
    obsidianPath,
    memoryNotePath,
    obsidianExists,
    skills,
    currentFocus: terraAgentCurrentFocus(printer, library, slicerReady),
  })
  const capabilities: Array<TerraWorkbenchCapability> = [
    { id: 'internet-model-hunt', label: 'Internet model hunt', category: 'library', state: 'available', live: false, locked: false, source: '/api/war-room/terra-model-search', evidence: ['Printables GraphQL', 'free models', 'aiGenerated=false', 'no downloads'], note: 'Terra can search source-backed printable model candidates before a local file is chosen.' },
    { id: 'local-model-library', label: 'Local model library', category: 'library', state: workflow[1].state, live: true, locked: false, source: '/api/war-room/terra-assets', evidence: [`${library.totalMatches} total`, `${library.assets.filter((asset) => asset.preview.kind === 'embedded').length} embedded previews`, `${library.assets.filter((asset) => asset.preview.kind === 'generated').length} generated previews`], note: 'Scans safe local roots and reads 3MF thumbnails/model geometry.' },
    { id: 'elegoo-slicer', label: 'ElegooSlicer app + CLI', category: 'slicer', state: appInfo.cliAvailable ? 'ready' : appInfo.appInstalled ? 'available' : 'blocked', live: true, locked: false, source: appInfo.appPath, evidence: [appInfo.version ? `version ${appInfo.version}` : 'version unknown', appInfo.bundleIdentifier ?? 'bundle unknown'], note: appInfo.cliAvailable ? 'CLI executable found for dry-run/slice integration.' : 'App found without verified CLI executable.' },
    { id: 'slicer-profiles', label: 'Machine / process / filament profiles', category: 'slicer', state: processReady && filamentReady ? 'ready' : 'blocked', live: true, locked: false, source: slicer.configPath, evidence: [`${slicer.profileCounts.machines} machines`, `${slicer.profileCounts.processes} processes`, `${slicer.profileCounts.filaments} filaments`], note: slicer.selectedMachine ?? 'No selected machine in config.' },
    { id: 'printer-live', label: 'Printer live status', category: 'printer', state: printerLive ? 'ready' : printer.state === 'configured' ? 'available' : 'blocked', live: printerLive, locked: false, source: printer.source, evidence: [printer.name, printer.firmwareVersion ? `firmware ${printer.firmwareVersion}` : 'firmware unknown', printer.metrics.queueState ?? printer.state], note: printer.message },
    { id: 'print-progress', label: 'Progress meter + completion', category: 'printer', state: progressLive ? 'ready' : printer.statusUrl ? 'unknown' : 'blocked', live: Boolean(progressLive), locked: false, source: printer.statusUrl ?? printer.source, evidence: [printer.metrics.progressPercent !== undefined ? `${printer.metrics.progressPercent}%` : 'percent missing', printer.metrics.printLifecycle ?? 'lifecycle unknown', printer.metrics.progressSource ?? 'source missing'], note: progressLive ? 'Meter is backed by read-only status data.' : 'No fake ETA/progress; waiting for verified status/MQTT source.' },
    { id: 'post-print-camera-qa', label: 'Post-print camera QA', category: 'camera', state: cameraLive ? 'ready' : cameraConfigured ? 'available' : 'blocked', live: cameraLive, locked: false, source: '/api/war-room/terra-print-qa', evidence: [cameraLive ? 'camera frame reachable' : cameraConfigured ? 'manual single-frame source configured' : 'camera URL missing', 'blank/dark/blur/stringing heuristics', 'shape match requires visual confirmation'], note: cameraLive ? 'Captures a real camera frame after completion/manual run and flags failure-risk signals.' : cameraConfigured ? 'Available as a one-frame manual check; Workspace never holds the stream open.' : 'Blocked until a camera URL exists; no fake QA pass.' },
    { id: 'machine-actions', label: 'Pause / resume / cancel / heat / upload', category: 'safety', state: printerConfigured ? 'locked' : 'blocked', live: printerLive, locked: true, source: 'approval gate', evidence: printer.lockedActions, note: 'Visible as real workflow actions, but no side effect runs without DLV approval and readback.' },
    { id: 'obsidian-memory', label: 'Obsidian 3D memory', category: 'agent', state: obsidianExists ? 'ready' : 'blocked', live: true, locked: false, source: memoryNotePath, evidence: [obsidianPath], note: 'Terra agent can anchor decisions/prints/profiles in the vault note.' },
  ]
  return {
    ok: true,
    scannedAtMs: nowMs,
    slicer: {
      appInstalled: appInfo.appInstalled,
      appPath: appInfo.appPath,
      executablePath: appInfo.executablePath,
      bundleIdentifier: appInfo.bundleIdentifier,
      version: appInfo.version,
      dataDir: slicer.base,
      configPath: displayPath(slicer.configPath),
      selectedMachine: slicer.selectedMachine,
      selectedPrinterId: slicer.selectedPrinterId,
      cliAvailable: appInfo.cliAvailable,
      cliEvidence: appInfo.cliAvailable ? 'Contents/MacOS/ElegooSlicer exists; --version/usage was verified during local discovery.' : 'CLI not found.',
      settings: slicer.settings,
      selectedMachineProfile: slicer.selectedMachineProfile,
      profiles: slicer.profiles,
      profileCounts: slicer.profileCounts,
      machine: slicer.machine,
    },
    printer,
    modelLibrary: {
      totalMatches: library.totalMatches,
      previewed: library.assets.filter((asset) => Boolean(asset.preview.dataUrl)).length,
      embeddedPreviews: library.assets.filter((asset) => asset.preview.kind === 'embedded').length,
      generatedPreviews: library.assets.filter((asset) => asset.preview.kind === 'generated').length,
      roots: library.roots,
      errors: library.errors,
    },
    obsidian: {
      vaultPath: obsidianPath,
      memoryNotePath,
      exists: obsidianExists,
    },
    agent,
    workflow,
    capabilities,
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function pathIsAllowed(filePath: string, roots: Array<string>): Promise<string | undefined> {
  const resolved = path.resolve(expandHome(filePath))
  for (const root of roots.map((item) => path.resolve(expandHome(item)))) {
    if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) return Promise.resolve(resolved)
  }
  return Promise.resolve(undefined)
}

export async function createTerraSlicePlan(request: TerraSlicePlanRequest, nowMs = Date.now()): Promise<TerraSlicePlanResult> {
  const appInfo = await readElegooAppInfo()
  if (!appInfo.cliAvailable || !appInfo.executablePath) return { ok: false, status: 409, error: 'ElegooSlicer CLI executable is not available.' }
  const modelPath = request.modelPath ? await pathIsAllowed(request.modelPath, defaultRoots()) : undefined
  if (!modelPath || !modelPath.toLowerCase().endsWith('.3mf') || !(await pathExists(modelPath))) return { ok: false, status: 400, error: 'Model must be an existing .3mf file under Terra safe roots.' }
  const base = elegooSlicerBaseDir()
  const profileRoots = [path.join(base, 'system'), path.join(base, 'user'), path.join(base, 'printers')]
  const machineProfilePath = request.machineProfilePath ? await pathIsAllowed(request.machineProfilePath, profileRoots) : undefined
  const processProfilePath = request.processProfilePath ? await pathIsAllowed(request.processProfilePath, profileRoots) : undefined
  const filamentProfilePath = request.filamentProfilePath ? await pathIsAllowed(request.filamentProfilePath, profileRoots) : undefined
  if (!machineProfilePath || !processProfilePath || !filamentProfilePath) return { ok: false, status: 400, error: 'Slice plan requires existing machine, process, and filament profiles from ElegooSlicer config roots.' }
  const outputDirectory = path.join(homeDir(), 'HermesFactory', 'terra-workspace', 'slice-plans')
  const outputFile = path.join(outputDirectory, `${path.basename(modelPath, '.3mf')}.workspace-sliced.3mf`)
  const command = [
    appInfo.executablePath,
    '--datadir', base,
    '--load-settings', `${machineProfilePath};${processProfilePath}`,
    '--load-filaments', filamentProfilePath,
    '--slice', '0',
    '--outputdir', outputDirectory,
    '--export-3mf', outputFile,
    modelPath,
  ]
  return {
    ok: true,
    mode: 'dry_run_plan',
    createdAtMs: nowMs,
    slicerExecutable: appInfo.executablePath,
    outputDirectory,
    outputFile,
    command,
    commandPreview: command.map(shellQuote).join(' '),
    selected: { modelPath, machineProfilePath, processProfilePath, filamentProfilePath },
    toggles: {
      flowCalibration: Boolean(request.flowCalibration),
      bedLeveling: Boolean(request.bedLeveling),
      timelapse: Boolean(request.timelapse),
      capturePrint: Boolean(request.capturePrint),
    },
    lockedActions: ['execute_slice', 'printer_upload', 'printer_start'],
    note: 'No slicer or printer side effect ran. This is a verified command plan; execution/upload/start require explicit approval and readback.',
  }
}

export type TerraPrinterCameraFrameResult =
  | { ok: true; frame: Buffer; contentType: string; sourceUrl: string }
  | { ok: false; status: number; error: string; sourceUrl?: string }

function findJpegFrame(buffer: Buffer) {
  const start = buffer.indexOf(Buffer.from([0xff, 0xd8]))
  if (start < 0) return undefined
  const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2)
  if (end < 0) return undefined
  return buffer.subarray(start, end + 2)
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2) break
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
    if (isStartOfFrame && offset + 8 < buffer.length) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + segmentLength
  }
  return {}
}

type ElegooMqttCameraConfig = {
  host: string
  sn: string
  username: string
  accessCode: string
}

type MqttEvent =
  | { type: 'connack'; returnCode: number }
  | { type: 'suback'; id: number }
  | { type: 'publish'; topic: string; payload: string; json?: unknown; qos: number; packetId?: number }
  | { type: 'other'; code: number }

function mqttString(value: string) {
  const data = Buffer.from(value)
  return Buffer.concat([Buffer.from([data.length >> 8, data.length & 255]), data])
}

function mqttRemainingLength(length: number) {
  const bytes: Array<number> = []
  let remaining = length
  do {
    let encoded = remaining % 128
    remaining = Math.floor(remaining / 128)
    if (remaining > 0) encoded |= 128
    bytes.push(encoded)
  } while (remaining > 0)
  return Buffer.from(bytes)
}

function mqttPacket(type: number, flags: number, body: Buffer) {
  return Buffer.concat([Buffer.from([(type << 4) | flags]), mqttRemainingLength(body.length), body])
}

function mqttConnectPacket(config: ElegooMqttCameraConfig, clientId: string) {
  const variableHeader = Buffer.concat([mqttString('MQTT'), Buffer.from([4, 0xc2, 0, 30])])
  const payload = Buffer.concat([mqttString(clientId), mqttString(config.username), mqttString(config.accessCode)])
  return mqttPacket(1, 0, Buffer.concat([variableHeader, payload]))
}

function mqttSubscribePacket(topic: string, id: number) {
  return mqttPacket(8, 2, Buffer.concat([Buffer.from([id >> 8, id & 255]), mqttString(topic), Buffer.from([1])]))
}

function mqttPublishPacket(topic: string, payload: Record<string, unknown>) {
  return mqttPacket(3, 0, Buffer.concat([mqttString(topic), Buffer.from(JSON.stringify(payload))]))
}

function mqttClientId() {
  const timePart = Date.now().toString(16).slice(-5)
  const randomPart = Math.random().toString(16).slice(2, 5)
  return `0hm${timePart}${randomPart}`.slice(0, 10)
}

async function readElegooMqttCameraConfig(): Promise<ElegooMqttCameraConfig | undefined> {
  const base = elegooSlicerBaseDir()
  const printerListPath = path.join(base, 'user', 'printer_list.json')
  const printerList = await readJsonFile(printerListPath)
  if (!isRecord(printerList)) return undefined
  const conf = await readJsonFile(path.join(base, 'ElegooSlicer.conf'))
  const selectedFromConf = isRecord(conf) && isRecord(conf.print) ? stringValue(conf.print.printsend_selected_printer_id) : undefined
  const selectedEntry = Object.entries(printerList)
    .filter(([, value]) => isRecord(value))
    .find(([printerId]) => printerId === selectedFromConf)
    ?? Object.entries(printerList).find(([, value]) => isRecord(value) && stringValue(value.host))
  if (!selectedEntry || !isRecord(selectedEntry[1])) return undefined
  const record = selectedEntry[1]
  const host = stringValue(record.host)
  const sn = stringValue(record.serialNumber) ?? stringValue(record.mainboardId)
  if (!host || !sn) return undefined
  return {
    host,
    sn,
    username: stringValue(record.username) ?? 'elegoo',
    accessCode: stringValue(record.accessCode) ?? '123456',
  }
}

function isOkElegooRegisterPayload(payload: unknown, clientId: string) {
  if (!isRecord(payload)) return false
  return payload.client_id === clientId && (payload.error === 'ok' || payload.error === 'already registered')
}

function extractElegooResult(payload: unknown) {
  if (!isRecord(payload)) return undefined
  return isRecord(payload.result) ? payload.result : undefined
}

async function requestElegooMqttLivingVideoUrl() {
  const config = await readElegooMqttCameraConfig()
  if (!config) return undefined
  const clientId = mqttClientId()
  const registerTopic = `elegoo/${config.sn}/api_register`
  const registerResponseTopic = `elegoo/${config.sn}/${clientId}/register_response`
  const apiRequestTopic = `elegoo/${config.sn}/${clientId}/api_request`
  const apiResponseTopic = `elegoo/${config.sn}/${clientId}/api_response`
  let nextPacketId = 1
  let buffer = Buffer.alloc(0)
  const socket = net.connect({ host: config.host, port: 1883 })
  const waiters: Array<{
    predicate: (event: MqttEvent) => boolean
    resolve: (event: MqttEvent) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = []

  function cleanupWaiter(index: number) {
    const waiter = waiters.splice(index, 1).at(0)
    if (waiter) clearTimeout(waiter.timer)
  }

  function waitFor(predicate: (event: MqttEvent) => boolean, timeoutMs: number, label: string) {
    return new Promise<MqttEvent>((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter)
          if (index >= 0) waiters.splice(index, 1)
          reject(new Error(`Elegoo MQTT ${label} timed out`))
        }, timeoutMs),
      }
      waiters.push(waiter)
    })
  }

  function emit(event: MqttEvent) {
    for (let index = 0; index < waiters.length; index += 1) {
      const waiter = waiters[index]
      if (waiter.predicate(event)) {
        cleanupWaiter(index)
        waiter.resolve(event)
        return
      }
    }
  }

  function parsePackets() {
    while (buffer.length >= 2) {
      const first = buffer[0]
      let multiplier = 1
      let remainingLength = 0
      let position = 1
      let encoded = 0
      do {
        if (position >= buffer.length) return
        encoded = buffer[position++]
        remainingLength += (encoded & 127) * multiplier
        multiplier *= 128
      } while (encoded & 128)
      if (buffer.length < position + remainingLength) return
      const body = buffer.subarray(position, position + remainingLength)
      buffer = buffer.subarray(position + remainingLength)
      const type = first >> 4
      if (type === 2) {
        emit({ type: 'connack', returnCode: body.at(1) ?? 255 })
      } else if (type === 9 && body.length >= 2) {
        emit({ type: 'suback', id: body.readUInt16BE(0) })
      } else if (type === 3 && body.length >= 2) {
        const qos = (first & 0x06) >> 1
        const topicLength = body.readUInt16BE(0)
        const topic = body.subarray(2, 2 + topicLength).toString()
        let payloadOffset = 2 + topicLength
        let packetId: number | undefined
        if (qos > 0 && body.length >= payloadOffset + 2) {
          packetId = body.readUInt16BE(payloadOffset)
          payloadOffset += 2
          socket.write(Buffer.from([0x40, 0x02, packetId >> 8, packetId & 255]))
        }
        const payload = body.subarray(payloadOffset).toString()
        let json: unknown
        try { json = JSON.parse(payload) } catch { /* non-JSON MQTT payload */ }
        emit({ type: 'publish', topic, payload, json, qos, packetId })
      } else {
        emit({ type: 'other', code: type })
      }
    }
  }

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    parsePackets()
  })
  socket.on('error', (error) => {
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(`Elegoo MQTT socket error: ${error.message}`))
    }
  })

  try {
    socket.write(mqttConnectPacket(config, clientId))
    const connack = await waitFor((event) => event.type === 'connack', 4000, 'connect')
    if (connack.type !== 'connack' || connack.returnCode !== 0) throw new Error('Elegoo MQTT connection was refused')

    const registerSubId = nextPacketId++
    socket.write(mqttSubscribePacket(registerResponseTopic, registerSubId))
    await waitFor((event) => event.type === 'suback' && event.id === registerSubId, 4000, 'register subscribe')
    socket.write(mqttPublishPacket(registerTopic, { request_id: clientId, client_id: clientId }))
    const registerResponse = await waitFor((event) => event.type === 'publish' && event.topic === registerResponseTopic, 5000, 'register response')
    if (registerResponse.type !== 'publish' || !isOkElegooRegisterPayload(registerResponse.json, clientId)) throw new Error('Elegoo MQTT camera registration failed')

    const apiSubId = nextPacketId++
    socket.write(mqttSubscribePacket(apiResponseTopic, apiSubId))
    await waitFor((event) => event.type === 'suback' && event.id === apiSubId, 4000, 'api subscribe')

    socket.write(mqttPublishPacket(apiRequestTopic, { method: 1054, params: { enable: 1, Enable: 1 }, id: 1 }))
    const startResponse = await waitFor((event) => event.type === 'publish' && event.topic === apiResponseTopic && isRecord(event.json) && event.json.method === 1054, 6000, 'start video stream')
    const startResult = startResponse.type === 'publish' ? extractElegooResult(startResponse.json) : undefined
    const startErrorCode = firstNumber(startResult?.error_code)
    if (startErrorCode !== undefined && startErrorCode !== 0) throw new Error(`Elegoo StartVideoStream returned error_code ${startErrorCode}`)

    socket.write(mqttPublishPacket(apiRequestTopic, { method: 1042, id: 2 }))
    const videoResponse = await waitFor((event) => event.type === 'publish' && event.topic === apiResponseTopic && isRecord(event.json) && event.json.method === 1042, 6000, 'video URL response')
    const result = videoResponse.type === 'publish' ? extractElegooResult(videoResponse.json) : undefined
    const errorCode = firstNumber(result?.error_code)
    const url = stringValue(result?.url)
    if (errorCode !== undefined && errorCode !== 0) throw new Error(`Elegoo GetLivingVideoUrl returned error_code ${errorCode}`)
    if (!url) throw new Error('Elegoo GetLivingVideoUrl did not return a video URL')
    return { url, note: 'Elegoo MQTT returned a living video URL after StartVideoStream.' }
  } finally {
    for (const waiter of waiters.splice(0)) clearTimeout(waiter.timer)
    socket.destroy()
  }
}

export async function getTerraPrinterCameraFrame(): Promise<TerraPrinterCameraFrameResult> {
  const status = await getTerraPrinterReadOnlyStatus(Date.now())
  let mqttError: string | undefined
  const mqttVideo = status.source === 'elegoo-slicer'
    ? await requestElegooMqttLivingVideoUrl().catch((error: Error) => {
      mqttError = error.message
      return undefined
    })
    : undefined
  const mqttNote = mqttVideo?.note
  const sourceUrl = mqttVideo?.url ?? status.cameraUrl ?? status.snapshotUrl
  if (!sourceUrl) return { ok: false, status: 404, error: mqttError ? `No read-only printer camera URL discovered yet. MQTT: ${mqttError}` : 'No read-only printer camera URL discovered yet.' }

  const prefix = [mqttNote, mqttError ? `MQTT fallback: ${mqttError}` : undefined].filter(Boolean).join(' ')
  let lastError = 'Camera frame fetch failed.'
  let lastStatus = 502

  // A VideoUrl returned immediately after StartVideoStream can take a moment to accept
  // connections. Keep retries bounded and manual: this function is never polled.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 700))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      const response = await fetch(sourceUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'image/jpeg,multipart/x-mixed-replace,*/*' },
      })
      if (!response.ok || !response.body) {
        lastStatus = response.status || 502
        lastError = `Camera frame fetch failed: HTTP ${response.status}`
        continue
      }
      const contentType = response.headers.get('content-type') ?? ''
      const reader = response.body.getReader()
      const chunks: Array<Buffer> = []
      let total = 0
      while (total < 1_500_000) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = Buffer.from(value)
        chunks.push(chunk)
        total += chunk.length
        const joined = Buffer.concat(chunks, total)
        const frame = findJpegFrame(joined)
        if (frame) {
          try { await reader.cancel() } catch { /* noop */ }
          return { ok: true, frame: Buffer.from(frame), contentType: 'image/jpeg', sourceUrl }
        }
        if (contentType.includes('image/jpeg') && total > 64_000) {
          try { await reader.cancel() } catch { /* noop */ }
          return { ok: true, frame: joined, contentType: 'image/jpeg', sourceUrl }
        }
      }
      lastError = 'No JPEG frame found in printer camera stream.'
    } catch (error) {
      lastError = (error as Error).message
    } finally {
      controller.abort()
      clearTimeout(timeout)
    }
  }

  return { ok: false, status: lastStatus, error: `${prefix ? `${prefix} ` : ''}${lastError}`, sourceUrl }
}

export async function createTerraPrintQaPacket(request: TerraPrintQaRequest = {}, nowMs = Date.now()): Promise<TerraPrintQaResult> {
  const printer = await getTerraPrinterReadOnlyStatus(nowMs)
  const frame = await getTerraPrinterCameraFrame()
  const lockedActions = ['qa_pass_auto_approve', 'printer_stop', 'printer_retry', 'printer_remove_part']
  if (!frame.ok) {
    return {
      ok: true,
      mode: 'read_only_camera_packet',
      checkedAtMs: nowMs,
      printer,
      model: request.modelName || request.modelPath ? {
        name: request.modelName,
        path: request.modelPath,
        expectedPreviewAvailable: Boolean(request.expectedPreviewAvailable),
      } : undefined,
      frame: {
        captured: false,
        sourceUrl: frame.sourceUrl,
        error: frame.error,
      },
      verdict: 'blocked',
      note: 'Camera frame is unavailable, so Terra QA cannot visually inspect the print yet. No printer action was sent.',
      lockedActions,
    }
  }
  const dimensions = readJpegDimensions(frame.frame)
  return {
    ok: true,
    mode: 'read_only_camera_packet',
    checkedAtMs: nowMs,
    printer,
    model: request.modelName || request.modelPath ? {
      name: request.modelName,
      path: request.modelPath,
      expectedPreviewAvailable: Boolean(request.expectedPreviewAvailable),
    } : undefined,
    frame: {
      captured: true,
      sourceUrl: frame.sourceUrl,
      contentType: frame.contentType,
      bytes: frame.frame.length,
      ...dimensions,
    },
    verdict: 'ready_for_visual_analysis',
    note: 'Captured one read-only camera frame. UI-side visual heuristics can now flag blank camera, blur, extreme brightness/darkness, or stringy high-edge clutter. Semantic pass still requires DLV/Hermes visual confirmation.',
    lockedActions,
  }
}
