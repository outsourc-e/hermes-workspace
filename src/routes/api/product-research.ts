import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

const STATE_PATH = path.join(os.homedir(), '.hermes', 'product-research', 'state.json')

function fallbackState() {
  return {
    version: 1,
    generated_at: null,
    mode: 'empty',
    dashboard: {
      title: 'Product Research',
      summary: 'No Alura product research run has completed yet.',
      category_counts: {},
    },
    alura: {
      requested_keyword_searches: 0,
      successful_keyword_searches: 0,
      failed_keyword_searches: 0,
      usage: null,
      force_update: false,
    },
    keywords: [],
    trending_keywords: [],
    opportunities: [],
    recommended_products: [],
    notes: ['Run ~/.hermes/scripts/product_research_alura.py to populate this dashboard.'],
  }
}

export const Route = createFileRoute('/api/product-research')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          if (!fs.existsSync(STATE_PATH)) {
            return json(fallbackState())
          }
          const raw = fs.readFileSync(STATE_PATH, 'utf8')
          return json(JSON.parse(raw), {
            headers: { 'cache-control': 'no-store' },
          })
        } catch (error) {
          return json(
            {
              ...fallbackState(),
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
