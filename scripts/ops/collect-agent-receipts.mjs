#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { aggregateReceipts, loadReceiptsFromDir } from '../../src/lib/ops/agent-work-receipts.ts'

const repoRoot = process.cwd()
const args = process.argv.slice(2)
const receiptsDir = path.resolve(repoRoot, args[0] || process.env.AI_OS_RECEIPTS_DIR || 'scripts/ops/sample-receipts')
const outputPath = path.resolve(repoRoot, args[1] || 'tmp/ops/normalized-ops-state.sample.json')
const generatedAt = process.env.AI_OS_GENERATED_AT || '2026-07-04T12:00:00.000Z'

const receipts = await loadReceiptsFromDir(receiptsDir)
const state = aggregateReceipts(receipts, { receiptsDir, generatedAt })
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ receipts: receipts.length, outputPath, sections: Object.fromEntries(Object.entries(state.sections).map(([key, value]) => [key, value.length])), topActions: state.daily_ops_review_contract.top_actions.length }, null, 2))
