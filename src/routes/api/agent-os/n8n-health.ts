import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/agent-os/n8n-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        const envPath = path.join(os.homedir(), '.config', 'n8n-mcp', 'env')
        let envSummary = { exists: false, base_url: null as string | null, api_key_present: false, placeholder_key: false }
        try {
          const raw = fs.readFileSync(envPath, 'utf-8')
          envSummary.exists = true
          for (const line of raw.split(/\r?\n/)) {
            if (line.startsWith('N8N_BASE_URL=')) envSummary.base_url = line.slice('N8N_BASE_URL='.length)
            if (line.startsWith('N8N_API_KEY=')) {
              const key = line.slice('N8N_API_KEY='.length)
              envSummary.api_key_present = key.length > 0
              envSummary.placeholder_key = key.includes('REPLACE_ME')
            }
          }
        } catch {}
        return jsonResponse({ env: envSummary })
      },
    },
  },
})
