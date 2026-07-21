#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const REPO_NAME = 'hermes-workspace'
const RESCUE_ROOT = path.join(os.homedir(), 'hermes-rescue', 'workspace-packet-contracts-v1')
const MAX_GIT_BUFFER = 128 * 1024 * 1024

const ALLOWED_PATHS = [
  'scripts/capture-workspace-packet-checkpoint.mjs',
  'docs/plans/workspace-packet-contracts-v1/HANDOFF.md',
  'src/lib/workspace-kernel/index.ts',
  'src/lib/workspace-kernel/packets/types.ts',
  'src/lib/workspace-kernel/packets/types.test.ts',
  'src/lib/workspace-kernel/packets/schemas.ts',
  'src/lib/workspace-kernel/packets/schemas.test.ts',
  'src/lib/workspace-kernel/packets/canonical-json.ts',
  'src/lib/workspace-kernel/packets/canonical-json.test.ts',
  'src/lib/workspace-kernel/packets/factory.ts',
  'src/lib/workspace-kernel/packets/factory.test.ts',
  'src/lib/workspace-kernel/packets/lifecycle.ts',
  'src/lib/workspace-kernel/packets/lifecycle.test.ts',
  'src/lib/workspace-kernel/packets/ack.ts',
  'src/lib/workspace-kernel/packets/ack.test.ts',
  'src/lib/workspace-kernel/packets/packet-store.ts',
  'src/lib/workspace-kernel/packets/packet-store.test.ts',
  'src/lib/workspace-kernel/packets/run-bridge.ts',
  'src/lib/workspace-kernel/packets/run-bridge.test.ts',
  'src/lib/workspace-kernel/packets/review-hardening.test.ts',
  'src/lib/workspace-kernel/packets/index.ts',
  'src/lib/workspace-kernel/packets/domain/execution-plan.ts',
  'src/lib/workspace-kernel/packets/domain/execution-plan.test.ts',
  'src/lib/workspace-kernel/packets/domain/run-readback.ts',
  'src/lib/workspace-kernel/packets/domain/run-readback.test.ts',
  'src/lib/workspace-kernel/contracts.ts',
  'src/lib/workspace-kernel/reducer.ts',
  'src/lib/workspace-kernel/reducer.test.ts',
  'src/lib/workspace-kernel/mission-spine.ts',
  'src/lib/workspace-kernel/mission-spine.test.ts',
  'src/lib/workspace-kernel/motion.ts',
  'src/lib/workspace-kernel/motion.test.ts',
  'src/routes/api/war-room/workspace-kernel/packets.ts',
  'src/routes/api/war-room/workspace-kernel/-packets.test.ts',
  'src/routes/api/war-room/workspace-kernel/packet-handoff.ts',
  'src/routes/api/war-room/workspace-kernel/-packet-handoff.test.ts',
  'src/routes/api/war-room/workspace-kernel/route-action.ts',
  'src/routes/api/war-room/workspace-kernel/-route-action.test.ts',
  'src/routes/api/war-room/workspace-kernel/resolve-run.ts',
  'src/routes/api/war-room/workspace-kernel/events.ts',
  'src/routes/api/war-room/workspace-kernel/state.ts',
  'src/routes/api/war-room/workspace-kernel/-state-events.test.ts',
  'src/lib/workspace-kernel/adapters/hermes-event-ingress.ts',
  'src/lib/war-room/body/etsy-live-backend.ts',
  'src/lib/workspace-kernel/packets/domain/opportunity.ts',
  'src/lib/workspace-kernel/packets/domain/opportunity.test.ts',
  'src/lib/workspace-kernel/packets/adapters/goblin-opportunity-v1.ts',
  'src/lib/workspace-kernel/packets/adapters/goblin-opportunity-v1.test.ts',
  'src/lib/war-room/goblin/goblin-opportunity-packet.ts',
  'src/lib/war-room/goblin/goblin-opportunity-packet.test.ts',
  'src/lib/workspace-kernel/packets/domain/evidence-allowed-claims.ts',
  'src/lib/workspace-kernel/packets/domain/evidence-allowed-claims.test.ts',
  'src/lib/workspace-kernel/packets/domain/supplier-evidence.ts',
  'src/lib/workspace-kernel/packets/domain/listing-ready-draft.ts',
  'src/lib/workspace-kernel/packets/domain/supplier-listing.test.ts',
  'src/lib/workspace-kernel/packets/adapters/etsy-room-v1.ts',
  'src/lib/workspace-kernel/packets/vertical-slice.test.ts',
  'src/lib/workspace-kernel/packets/domain/asset-production.ts',
  'src/lib/workspace-kernel/packets/domain/asset-production.test.ts',
  'src/lib/workspace-kernel/packets/domain/print-ready.ts',
  'src/lib/workspace-kernel/packets/domain/print-ready.test.ts',
  'src/lib/workspace-kernel/packets/domain/context.ts',
  'src/lib/workspace-kernel/packets/domain/context.test.ts',
  'src/lib/workspace-kernel/packets/adapters/obsidian-context-v1.ts',
  'src/lib/workspace-kernel/packets/adapters/obsidian-context-v1.test.ts',
  'src/lib/workspace-kernel/context-packet.ts',
  'src/lib/workspace-kernel/context-packet.test.ts',
  'src/lib/workspace-kernel/packets/domain/cost-risk-lock.ts',
  'src/lib/workspace-kernel/packets/domain/cost-risk-lock.test.ts',
  'src/lib/workspace-kernel/packets/approval-grant.ts',
  'src/lib/workspace-kernel/packets/approval-grant.test.ts',
  'src/lib/workspace-kernel/packets/approval-grant-store.ts',
  'src/lib/workspace-kernel/packets/approval-grant-store.test.ts',
  'src/lib/workspace-kernel/packets/domain/roster-availability.ts',
  'src/lib/workspace-kernel/packets/domain/roster-availability.test.ts',
  'src/lib/workspace-kernel/packets/domain/code-automation.ts',
  'src/lib/workspace-kernel/packets/domain/code-automation.test.ts',
  'src/lib/workspace-kernel/packets/domain/strategic-decision.ts',
  'src/lib/workspace-kernel/packets/domain/strategic-decision.test.ts',
  'src/lib/workspace-kernel/packets/strategic-decision-authorization.ts',
  'src/lib/workspace-kernel/packets/strategic-decision-authorization.test.ts',
  'src/lib/workspace-kernel/packets/domain/delivery.ts',
  'src/lib/workspace-kernel/packets/domain/delivery.test.ts',
  'src/lib/workspace-kernel/packets/delivery-reconciliation.ts',
  'src/lib/workspace-kernel/packets/delivery-reconciliation.test.ts',
  'src/lib/workspace-kernel/packets/contract-registry.test.ts',
  'src/lib/workspace-kernel/packets/test-fixtures.ts',
  'scripts/verify-workspace-packet-contracts.mjs',
  'package.json',
  'src/lib/war-room/body/council-discussion-store.ts',
  'src/lib/war-room/terra/terra-local-assets.ts',
  'src/screens/war-room/living-v3/GoblinAnalyticsShell.tsx',
  'src/screens/war-room/living-v3/TerraModelPrintStudio.tsx',
  // Milestone D — additive DB mirror, Packet rail, and retired-profile routing guards.
  'supabase/migrations/20260718200627_workspace_packet_contracts_v1.sql',
  'src/server/workspace-core-db.ts',
  'src/server/workspace-packet-db.ts',
  'src/server/workspace-packet-db.test.ts',
  'src/server/workspace-packet-db.integration.test.ts',
  'src/lib/workspace-kernel/adapters/living-v3.ts',
  'src/lib/workspace-kernel/adapters/living-v3.test.ts',
  'src/screens/war-room/living-v3/PacketHandoffRail.tsx',
  'src/screens/war-room/living-v3/PacketHandoffRail.test.tsx',
  'src/screens/war-room/living-v3/packet-handoff-rail.css',
  'src/screens/war-room/living-v3/LivingWarRoomV3.tsx',
  'src/lib/war-room/body/worker-profiles.ts',
  'src/lib/war-room/body/worker-profiles.test.ts',
  'src/lib/war-room/body/runtime.ts',
  'src/lib/war-room/body/runtime.test.ts',
  'src/lib/war-room/body/capabilities.ts',
  'src/lib/war-room/body/station-manifest.ts',
  'src/lib/war-room/body/station-manifest.test.ts',
  'src/lib/war-room/body/living-v3-body-adapter.test.ts',
  'src/lib/war-room/living-v3/living-v3-contract.ts',
  'src/lib/war-room/living-v3/living-v3-contract.test.ts',
]

const PROTECTED_MAP_PATHS = [
  'src/lib/war-room/living-v3/living-v3-contract.ts',
  'src/screens/war-room/living-v3/LivingWarRoomV3.tsx',
  'src/screens/war-room/living-v3/living-war-room-v3.css',
  'src/lib/war-room/body/worker-profiles.ts',
  'src/lib/war-room/body/live-agent-context-packets.ts',
]

const GENERATED_PATHS = ['src/routeTree.gen.ts']

function argumentValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function safeLabel(value) {
  if (!value || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(value)) {
    throw new Error('A safe --label value is required (letters, numbers, hyphens; max 64).')
  }
  return value
}

function git(repoRoot, args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: MAX_GIT_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trimEnd()
  } catch (error) {
    if (options.allowFailure) return ''
    const detail = error?.stderr?.toString?.().trim() || error?.message || String(error)
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function timestampForPath(date) {
  return date.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z')
}

async function main() {
  const label = safeLabel(argumentValue('--label'))
  const repoRoot = process.cwd()
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  if (packageJson.name !== REPO_NAME) {
    throw new Error(`Run from ${REPO_NAME} root. Found package ${String(packageJson.name)}.`)
  }

  const createdAt = new Date()
  const rescueDir = path.join(RESCUE_ROOT, `${timestampForPath(createdAt)}-${label}`)
  if (await exists(rescueDir)) throw new Error(`Refusing to overwrite existing rescue directory: ${rescueDir}`)

  await mkdir(path.join(rescueDir, 'files'), { recursive: true })

  const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const head = git(repoRoot, ['rev-parse', 'HEAD'])
  const upstream = git(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFailure: true }) || null
  const divergenceText = upstream
    ? git(repoRoot, ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { allowFailure: true })
    : ''
  const [behind = '0', ahead = '0'] = divergenceText.split(/\s+/)
  const status = git(repoRoot, ['status', '--short', '--untracked-files=all'], { allowFailure: true })
  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard'], { allowFailure: true })
  const trackedDiff = git(repoRoot, ['diff', '--binary', '--no-ext-diff'], { allowFailure: true })

  const files = []
  for (const relativePath of ALLOWED_PATHS) {
    const sourcePath = path.join(repoRoot, relativePath)
    if (!(await exists(sourcePath))) {
      files.push({ path: relativePath, state: 'MISSING_BEFORE' })
      continue
    }
    const bytes = await readFile(sourcePath)
    const destinationPath = path.join(rescueDir, 'files', relativePath)
    await mkdir(path.dirname(destinationPath), { recursive: true })
    await copyFile(sourcePath, destinationPath)
    files.push({
      path: relativePath,
      state: 'COPIED',
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    })
  }

  const protectedMapFiles = []
  for (const relativePath of PROTECTED_MAP_PATHS) {
    const sourcePath = path.join(repoRoot, relativePath)
    if (!(await exists(sourcePath))) {
      protectedMapFiles.push({ path: relativePath, state: 'MISSING_BEFORE' })
      continue
    }
    const bytes = await readFile(sourcePath)
    const destinationPath = path.join(rescueDir, 'protected-map-files', relativePath)
    await mkdir(path.dirname(destinationPath), { recursive: true })
    await copyFile(sourcePath, destinationPath)
    protectedMapFiles.push({
      path: relativePath,
      state: 'COPIED',
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    })
  }

  const generatedFiles = []
  for (const relativePath of GENERATED_PATHS) {
    const sourcePath = path.join(repoRoot, relativePath)
    if (!(await exists(sourcePath))) {
      generatedFiles.push({ path: relativePath, state: 'MISSING_BEFORE' })
      continue
    }
    const bytes = await readFile(sourcePath)
    const destinationPath = path.join(rescueDir, 'generated-files', relativePath)
    await mkdir(path.dirname(destinationPath), { recursive: true })
    await copyFile(sourcePath, destinationPath)
    generatedFiles.push({
      path: relativePath,
      state: 'COPIED',
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    })
  }

  const manifest = {
    schemaVersion: 'workspace-packet-checkpoint-v1',
    label,
    createdAt: createdAt.toISOString(),
    repoRoot,
    rescueDir,
    git: {
      branch,
      head,
      upstream,
      behind: Number.parseInt(behind, 10) || 0,
      ahead: Number.parseInt(ahead, 10) || 0,
      statusEntryCount: status ? status.split('\n').length : 0,
      untrackedEntryCount: untracked ? untracked.split('\n').length : 0,
    },
    allowedPaths: ALLOWED_PATHS,
    files,
    protectedMapPaths: PROTECTED_MAP_PATHS,
    protectedMapFiles,
    generatedPaths: GENERATED_PATHS,
    generatedFiles,
  }

  await Promise.all([
    writeFile(path.join(rescueDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    writeFile(path.join(rescueDir, 'git-status.txt'), status ? `${status}\n` : '', 'utf8'),
    writeFile(path.join(rescueDir, 'untracked-paths.txt'), untracked ? `${untracked}\n` : '', 'utf8'),
    writeFile(path.join(rescueDir, 'tracked-diff.patch'), trackedDiff ? `${trackedDiff}\n` : '', 'utf8'),
    writeFile(
      path.join(rescueDir, 'README.md'),
      [
        '# Workspace Packet Contracts checkpoint',
        '',
        `- Label: \`${label}\``,
        `- Created: \`${createdAt.toISOString()}\``,
        `- Repository: \`${repoRoot}\``,
        `- Branch/HEAD: \`${branch}\` / \`${head}\``,
        `- Allowed paths: \`${ALLOWED_PATHS.length}\``,
        `- Protected map paths: \`${PROTECTED_MAP_PATHS.length}\``,
        `- Generated paths: \`${GENERATED_PATHS.length}\``,
        '- This checkpoint is evidence and recovery material. Restore only explicitly approved paths; never reset the repository wholesale.',
        '',
      ].join('\n'),
      'utf8',
    ),
  ])

  process.stdout.write(`${JSON.stringify({ ok: true, rescueDir, manifest: path.join(rescueDir, 'manifest.json') })}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
