import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'

const execFileAsync = promisify(execFile)

export const Route = createFileRoute('/api/skills/hub-search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const query = (url.searchParams.get('q') || '').trim()
          const limit = Math.min(
            50,
            Math.max(1, Number(url.searchParams.get('limit') || '20')),
          )
          const source = (
            url.searchParams.get('source') || 'all'
          ).trim()

          if (!query) {
            return json({ results: [], source: 'idle' })
          }

          // Call the Python skills-search wrapper which uses hermes-agent's
          // unified_search across all registries (official, skills.sh,
          // well-known GitHub, LobeHub, etc.)
          const scriptPath = path.join(
            process.cwd(),
            'scripts/skills-search.py',
          )

          const { stdout } = await execFileAsync(
            'python3',
            [scriptPath, query, String(limit), source],
            {
              timeout: 30_000,
              maxBuffer: 1024 * 1024 * 2,
            },
          )

          const result = JSON.parse(stdout.trim())
          return json(result)
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search skills hub',
              results: [],
              source: 'error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
