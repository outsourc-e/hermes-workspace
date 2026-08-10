import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const mutationRoutes = [
  'activate.ts',
  'create.ts',
  'delete.ts',
  'rename.ts',
  'toggle-skill.ts',
  'update.ts',
]

describe('profile mutation authorization boundary', () => {
  for (const route of mutationRoutes) {
    it(`${route} requires a local request or authenticated session`, () => {
      const source = readFileSync(join(here, route), 'utf8')
      expect(source).toContain('requireLocalOrAuth(request)')
      expect(source).not.toContain('if (!isAuthenticated(request))')
    })
  }
})
