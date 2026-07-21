import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pureKernelFiles = [
  './contracts.ts',
  './blueprints.ts',
  './router.ts',
  './reducer.ts',
  './motion.ts',
  './adapters/living-v3.ts',
  './adapters/etsy-market-lab.ts',
  './adapters/hermes-event-ingress.ts',
]

describe('workspace kernel safety scan', () => {
  it('keeps pure kernel routing and adapters free of live/network/process execution calls', () => {
    for (const file of pureKernelFiles) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(source, file).not.toMatch(/\bchild_process\b|\bspawn\s*\(|\bexec\s*\(/)
      expect(source, file).not.toMatch(/\bfetch\s*\(/)
      expect(source, file).not.toMatch(/from ['"](?:puppeteer|playwright)|require\(['"](?:puppeteer|playwright)/)
    }
  })
})
