#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import process from 'node:process'

const gates = [
  {
    label: 'Workspace Packet contract tests',
    command: 'pnpm',
    args: ['exec', 'vitest', 'run', 'src/lib/workspace-kernel/packets'],
  },
  {
    label: 'Workspace Packet ESLint',
    command: 'pnpm',
    args: ['exec', 'eslint', 'src/lib/workspace-kernel/packets'],
  },
]

for (const gate of gates) {
  process.stdout.write(`\n[qa:packet-contracts] ${gate.label}\n`)
  const result = spawnSync(gate.command, gate.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: '1',
      NO_COLOR: process.env.NO_COLOR ?? '1',
    },
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`[qa:packet-contracts] ${gate.label} could not start:`, result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`[qa:packet-contracts] ${gate.label} failed with exit ${String(result.status)}.`)
    process.exit(result.status ?? 1)
  }
}

console.log('\n[qa:packet-contracts] PASS')
