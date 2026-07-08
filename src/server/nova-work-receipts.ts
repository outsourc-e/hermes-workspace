import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  
  
  appendNovaFabricEvent
} from './nova-fabric-store'
import type {NovaFabricEventInput, NovaFabricEventRecord} from './nova-fabric-store';

/**
 * Server-side work receipts.
 *
 * Receipts are only ever derived from evidence the server can observe
 * itself: local git state, the PR URL env, vitest's own JSON report
 * artifact on disk, and the build output's mtime. Browser claims are
 * never accepted as receipt evidence.
 */

export type WorkObservation = {
  timestamp: string
  git: { branch: string; headHash: string; headSubject: string } | null
  prUrl: string | null
  vitest: {
    mtimeMs: number
    passed: number
    failed: number
    total: number
  } | null
  buildMtimeMs: number | null
}

export type WorkStateMarker = {
  headHash: string | null
  prUrl: string | null
  vitestMtimeMs: number | null
  buildMtimeMs: number | null
  updatedAt: string
}

export type WorkReceiptPlan = {
  receipts: Array<NovaFabricEventInput>
  nextMarker: WorkStateMarker
}

const PROVENANCE = 'Mission Control server work scan'

function markerFilePath(): string {
  return (
    process.env.NOVA_WORK_STATE_FILE ??
    path.join(process.cwd(), '.runtime', 'nova-work-state.json')
  )
}

function vitestReportPath(): string {
  return (
    process.env.NOVA_VITEST_REPORT_FILE ??
    path.join(process.cwd(), '.runtime', 'last-vitest.json')
  )
}

function buildArtifactPath(): string {
  return (
    process.env.NOVA_BUILD_ARTIFACT ?? path.join(process.cwd(), 'dist')
  )
}

export function planWorkReceipts(
  observed: WorkObservation,
  prior: WorkStateMarker | null,
): WorkReceiptPlan {
  const nextMarker: WorkStateMarker = {
    headHash: observed.git?.headHash ?? prior?.headHash ?? null,
    prUrl: observed.prUrl ?? prior?.prUrl ?? null,
    vitestMtimeMs: observed.vitest?.mtimeMs ?? prior?.vitestMtimeMs ?? null,
    buildMtimeMs: observed.buildMtimeMs ?? prior?.buildMtimeMs ?? null,
    updatedAt: observed.timestamp,
  }

  if (prior === null) {
    return { receipts: [], nextMarker }
  }

  const receipts: Array<NovaFabricEventInput> = []

  if (observed.git && observed.git.headHash !== prior.headHash) {
    receipts.push({
      title: `Commit detected: ${observed.git.headSubject}`,
      summary: `Branch ${observed.git.branch} moved to ${observed.git.headHash}.`,
      eventKind: 'work-receipt',
      verificationState: 'tool-verified',
      provenance: PROVENANCE,
      sourceLinks: [
        { label: 'Branch', value: observed.git.branch, kind: 'note' },
      ],
      receiptLinks: [
        { label: 'Git commit', value: observed.git.headHash, kind: 'receipt' },
      ],
    })
  }

  if (observed.prUrl && observed.prUrl !== prior.prUrl) {
    receipts.push({
      title: `PR linked: ${observed.prUrl}`,
      summary: `Pull request URL observed by the server for branch ${observed.git?.branch ?? 'unknown'}.`,
      eventKind: 'work-receipt',
      verificationState: 'tool-verified',
      provenance: PROVENANCE,
      receiptLinks: [
        { label: 'Pull request', value: observed.prUrl, kind: 'url' },
      ],
    })
  }

  if (
    observed.vitest &&
    observed.vitest.mtimeMs > (prior.vitestMtimeMs ?? -1)
  ) {
    const { passed, failed, total } = observed.vitest
    const failedRun = failed > 0
    receipts.push({
      title: failedRun
        ? `Test run failed: ${failed} failing`
        : 'Test run completed',
      summary: `Vitest report artifact: ${passed}/${total} passed${failedRun ? `, ${failed} failed` : ''}.`,
      eventKind: 'work-receipt',
      verificationState: 'tool-verified',
      provenance: PROVENANCE,
      sourceLinks: [
        { label: 'Vitest report', value: vitestReportPath(), kind: 'file' },
      ],
    })
  }

  if (
    observed.buildMtimeMs !== null &&
    observed.buildMtimeMs > (prior.buildMtimeMs ?? -1)
  ) {
    receipts.push({
      title: 'Build completed',
      summary: 'Build output artifact changed on disk.',
      eventKind: 'work-receipt',
      verificationState: 'tool-verified',
      provenance: PROVENANCE,
      sourceLinks: [
        { label: 'Build output', value: buildArtifactPath(), kind: 'file' },
      ],
    })
  }

  return { receipts, nextMarker }
}

function readMarker(): WorkStateMarker | null {
  try {
    const raw = fs.readFileSync(markerFilePath(), 'utf8')
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const parsed = value as Partial<WorkStateMarker>
    return {
      headHash: typeof parsed.headHash === 'string' ? parsed.headHash : null,
      prUrl: typeof parsed.prUrl === 'string' ? parsed.prUrl : null,
      vitestMtimeMs:
        typeof parsed.vitestMtimeMs === 'number' ? parsed.vitestMtimeMs : null,
      buildMtimeMs:
        typeof parsed.buildMtimeMs === 'number' ? parsed.buildMtimeMs : null,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

function writeMarker(marker: WorkStateMarker): void {
  const file = markerFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, JSON.stringify(marker, null, 2), 'utf8')
  fs.renameSync(temp, file)
}

function readGit(args: Array<string>): string | null {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 4000,
    }).trim()
  } catch {
    return null
  }
}

function readVitestArtifact(): WorkObservation['vitest'] {
  try {
    const file = vitestReportPath()
    const stat = fs.statSync(file)
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
      string,
      unknown
    >
    const total = parsed.numTotalTests
    const passed = parsed.numPassedTests
    const failed = parsed.numFailedTests
    if (
      typeof total !== 'number' ||
      typeof passed !== 'number' ||
      typeof failed !== 'number'
    ) {
      return null
    }
    return { mtimeMs: stat.mtimeMs, passed, failed, total }
  } catch {
    return null
  }
}

export function gatherWorkObservation(): WorkObservation {
  const branch = readGit(['rev-parse', '--abbrev-ref', 'HEAD'])
  const headHash = readGit(['rev-parse', '--short', 'HEAD'])
  const headSubject = readGit(['log', '-1', '--pretty=%s'])
  let buildMtimeMs: number | null = null
  try {
    buildMtimeMs = fs.statSync(buildArtifactPath()).mtimeMs
  } catch {
    buildMtimeMs = null
  }
  return {
    timestamp: new Date().toISOString(),
    git:
      branch && headHash
        ? { branch, headHash, headSubject: headSubject ?? '' }
        : null,
    prUrl: process.env.NOVA_GITHUB_PR_URL?.trim() || null,
    vitest: readVitestArtifact(),
    buildMtimeMs,
  }
}

export function scanAndRecordWorkReceipts(observation?: WorkObservation): {
  written: Array<NovaFabricEventRecord>
  marker: WorkStateMarker
} {
  const observed = observation ?? gatherWorkObservation()
  const prior = readMarker()
  const plan = planWorkReceipts(observed, prior)
  const written = plan.receipts.map((receipt) =>
    appendNovaFabricEvent(receipt),
  )
  writeMarker(plan.nextMarker)
  return { written, marker: plan.nextMarker }
}

export function recordBlockedExternalAction(input: {
  action: string
  reason: string
  target: string
}): NovaFabricEventRecord {
  return appendNovaFabricEvent({
    title: `External action blocked: ${input.action}`,
    summary: `${input.reason} Target system: ${input.target}.`,
    eventKind: 'boundary',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
    verificationState: 'tool-verified',
    provenance: 'Mission Control server boundary guard',
    sourceLinks: [
      { label: 'Target system', value: input.target, kind: 'note' },
    ],
  })
}
