import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(): string {
  return readFileSync(
    join(process.cwd(), 'src/routes/api/swarm-decompose.ts'),
    'utf-8',
  )
}

describe('/api/swarm-decompose auth', () => {
  it('uses runtime bearer token helper for gateway chat completions', () => {
    const src = source()

    expect(src).toContain(
      "import { getBearerToken } from '../../server/openai-compat-api'",
    )
    expect(src).toContain('const bearer = getBearerToken()')
    expect(src).toContain(
      'if (bearer) headers.Authorization = `Bearer ${bearer}`',
    )
    expect(src).not.toContain('if (BEARER_TOKEN) headers.Authorization')
  })
})
