import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const WORKSPACE_ROOT = process.cwd()
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data', 'product-intelligence')
const DB_PATH = path.join(DATA_DIR, 'product_intelligence.db')
const SUMMARY_PATH = path.join(DATA_DIR, 'summary.json')

type ProductIntelligenceOptions = {
  q?: string | null
  limit?: number
  room?: string | null
  status?: string | null
  minScore?: number | null
}

function clampLimit(value: unknown, fallback = 40): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(200, Math.floor(n)))
}

function runSqliteJson<T>(script: string, args: Array<string> = []): T {
  const output = execFileSync('python3', ['-c', script, DB_PATH, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
    timeout: 15_000,
  })
  return JSON.parse(output) as T
}

export function getProductIntelligence(options: ProductIntelligenceOptions = {}) {
  const limit = clampLimit(options.limit)
  const q = (options.q ?? '').trim()
  const room = (options.room ?? '').trim()
  const status = (options.status ?? '').trim()
  const minScore = Number(options.minScore ?? 0)

  if (!fs.existsSync(DB_PATH)) {
    return {
      ok: false,
      error: 'Product intelligence DB has not been imported yet.',
      db_path: DB_PATH,
      summary_path: SUMMARY_PATH,
      hint: 'Run: python3 scripts/import_product_intelligence.py --reset',
    }
  }

  const summary = fs.existsSync(SUMMARY_PATH)
    ? JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'))
    : null

  const script = String.raw`
import json, sqlite3, sys
path, q, limit_s, room, status, min_score_s = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
limit = max(1, min(200, int(limit_s)))
try:
    min_score = float(min_score_s or 0)
except Exception:
    min_score = 0.0
con = sqlite3.connect('file:' + path + '?mode=ro', uri=True)
con.row_factory = sqlite3.Row

def rows(sql, params=()):
    return [dict(r) for r in con.execute(sql, params).fetchall()]

def one(sql, params=()):
    row = con.execute(sql, params).fetchone()
    return row[0] if row else None

where_parts = []
params = []
if q:
    like = '%' + q.lower() + '%'
    where_parts.append('''(lower(p.title) LIKE ? OR lower(coalesce(p.niche,'')) LIKE ? OR lower(coalesce(p.etsy_angle,'')) LIKE ? OR lower(coalesce(p.alura_evidence,'')) LIKE ? OR EXISTS (
      SELECT 1 FROM product_keywords pk JOIN keywords k ON k.id = pk.keyword_id WHERE pk.product_id = p.id AND lower(k.keyword) LIKE ?
    ))''')
    params.extend([like, like, like, like, like])
if room:
    where_parts.append('p.current_room = ?')
    params.append(room)
if status:
    where_parts.append('lower(p.status) LIKE ?')
    params.append('%' + status.lower() + '%')
where = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''

score_expr = '''
  (CASE WHEN lower(coalesce(p.shotlab_status,'')) LIKE '%pass%' THEN 25 ELSE 0 END) +
  (CASE WHEN lower(coalesce(p.status,'')) LIKE '%verification%' THEN 18 ELSE 0 END) +
  (CASE WHEN lower(coalesce(p.etsy_angle,'')) <> '' THEN 12 ELSE 0 END) +
  (CASE WHEN lower(coalesce(p.variant_plan,'')) <> '' THEN 10 ELSE 0 END) +
  min(20, 5 * (SELECT count(*) FROM supplier_links s WHERE s.product_id = p.id)) +
  min(15, 3 * (SELECT count(*) FROM product_keywords pk WHERE pk.product_id = p.id))
'''

products = rows(f'''
SELECT p.id, p.title, p.niche, p.product_type, p.etsy_angle, p.variant_plan, p.status, p.current_room,
       p.assigned_agent, p.alura_evidence, p.shotlab_status, p.source_file,
       (SELECT count(*) FROM supplier_links s WHERE s.product_id = p.id) AS supplier_link_count,
       (SELECT group_concat(k.keyword, ', ') FROM product_keywords pk JOIN keywords k ON k.id = pk.keyword_id WHERE pk.product_id = p.id LIMIT 6) AS keywords,
       ({score_expr}) AS opportunity_score,
       CASE
         WHEN lower(coalesce(p.shotlab_status,'')) NOT LIKE '%pass%' THEN 'ShotLab / Forge needs visual clean-family check'
         WHEN (SELECT count(*) FROM supplier_links s WHERE s.product_id = p.id) = 0 THEN 'Find supplier proof before moving forward'
         WHEN lower(coalesce(p.status,'')) LIKE '%verification%' THEN 'Verify source page, then prepare Forge draft'
         ELSE 'Review for DLV approval gate'
       END AS next_action,
       CASE
         WHEN ({score_expr}) >= 70 THEN 'high'
         WHEN ({score_expr}) >= 45 THEN 'medium'
         ELSE 'low'
       END AS priority
FROM products p
{where}
AND ({score_expr}) >= ?
ORDER BY opportunity_score DESC, p.updated_at DESC, p.title ASC
LIMIT ?
'''.replace('\nAND (', '\nWHERE (' if not where else '\nAND ('), (*params, min_score, limit))

keyword_where_parts = []
keyword_params = []
if q:
    keyword_where_parts.append('lower(keyword) LIKE ?')
    keyword_params.append('%' + q.lower() + '%')
keyword_where = ('WHERE ' + ' AND '.join(keyword_where_parts)) if keyword_where_parts else ''
keyword_score_expr = '''
  coalesce(score, 0) +
  min(20, coalesce(avg_sales, 0) / 25.0) +
  min(15, coalesce(conversion_rate, 0) * 400.0) +
  CASE WHEN lower(coalesce(competition_level,'')) IN ('low','moderate') THEN 12 ELSE 0 END
'''
keywords = rows(f'''
SELECT keyword, score, search_volume, competition, conversion_rate, sales, avg_sales, revenue, avg_revenue, views, avg_views,
       competition_level, avg_price, current_room,
       ({keyword_score_expr}) AS signal_score,
       CASE
         WHEN coalesce(score, 0) >= 80 AND lower(coalesce(competition_level,'')) IN ('low','moderate') THEN 'strong keyword candidate'
         WHEN coalesce(avg_sales, 0) >= 100 THEN 'demand proof candidate'
         ELSE 'research support keyword'
       END AS signal_reason
FROM keywords
{keyword_where}
ORDER BY signal_score DESC, score DESC NULLS LAST, avg_sales DESC NULLS LAST, keyword ASC
LIMIT ?
''', (*keyword_params, limit))

edge_where = ''
edge_params = []
if q:
    edge_where = 'WHERE lower(from_keyword) LIKE ? OR lower(to_keyword) LIKE ? OR lower(relation) LIKE ? OR lower(coalesce(source,\'\')) LIKE ?'
    edge_params = ['%' + q.lower() + '%'] * 4
keyword_edges = rows(f'''
SELECT from_keyword, to_keyword, relation, source, discovered_at
FROM keyword_edges
{edge_where}
ORDER BY discovered_at DESC NULLS LAST, from_keyword ASC, to_keyword ASC
LIMIT ?
''', (*edge_params, limit))

related_hubs = rows('''
SELECT from_keyword AS keyword, count(*) AS edge_count
FROM keyword_edges
GROUP BY from_keyword
ORDER BY edge_count DESC, from_keyword ASC
LIMIT 16
''')

opportunities = rows(f'''
SELECT * FROM (
  SELECT p.id, p.title, p.current_room, p.status, p.etsy_angle, p.shotlab_status,
         (SELECT count(*) FROM supplier_links s WHERE s.product_id = p.id) AS supplier_link_count,
         (SELECT group_concat(k.keyword, ', ') FROM product_keywords pk JOIN keywords k ON k.id = pk.keyword_id WHERE pk.product_id = p.id LIMIT 4) AS keywords,
         ({score_expr}) AS opportunity_score,
         CASE
           WHEN lower(coalesce(p.shotlab_status,'')) NOT LIKE '%pass%' THEN 'ShotLab / Forge needs visual clean-family check'
           WHEN (SELECT count(*) FROM supplier_links s WHERE s.product_id = p.id) = 0 THEN 'Find supplier proof before moving forward'
           WHEN lower(coalesce(p.status,'')) LIKE '%verification%' THEN 'Verify source page, then prepare Forge draft'
           ELSE 'Review for DLV approval gate'
         END AS next_action,
         CASE
           WHEN ({score_expr}) >= 70 THEN 'high'
           WHEN ({score_expr}) >= 45 THEN 'medium'
           ELSE 'low'
         END AS priority
  FROM products p
) ranked
WHERE opportunity_score >= ?
ORDER BY opportunity_score DESC, title ASC
LIMIT 12
''', (min_score,))

keyword_opportunities = rows(f'''
SELECT keyword, score, avg_sales, competition, competition_level, conversion_rate, avg_price,
       ({keyword_score_expr}) AS signal_score,
       CASE
         WHEN coalesce(score, 0) >= 80 AND lower(coalesce(competition_level,'')) IN ('low','moderate') THEN 'Candidate for product expansion'
         WHEN coalesce(avg_sales, 0) >= 100 THEN 'Demand proof to attach to an existing product'
         ELSE 'Use as supporting SEO tag only'
       END AS next_action
FROM keywords
WHERE ({keyword_score_expr}) >= 45
ORDER BY signal_score DESC, keyword ASC
LIMIT 12
''')

action_queue = rows('''
SELECT next_action, count(*) AS count FROM (
  SELECT CASE
    WHEN lower(coalesce(p.shotlab_status,'')) NOT LIKE '%pass%' THEN 'ShotLab / Forge needs visual clean-family check'
    WHEN (SELECT count(*) FROM supplier_links s WHERE s.product_id = p.id) = 0 THEN 'Find supplier proof before moving forward'
    WHEN lower(coalesce(p.status,'')) LIKE '%verification%' THEN 'Verify source page, then prepare Forge draft'
    ELSE 'Review for DLV approval gate'
  END AS next_action
  FROM products p
)
GROUP BY next_action
ORDER BY count DESC, next_action ASC
''')

workflow_funnel = rows('''
SELECT current_room AS room, status, count(*) AS count
FROM products
GROUP BY current_room, status
ORDER BY current_room ASC, count DESC
LIMIT 30
''')

result = {
    'ok': True,
    'query': q,
    'limit': limit,
    'filters': {'room': room, 'status': status, 'min_score': min_score},
    'counts': {
        'sources': one('SELECT count(*) FROM sources'),
        'research_runs': one('SELECT count(*) FROM research_runs'),
        'products': one('SELECT count(*) FROM products'),
        'keywords': one('SELECT count(*) FROM keywords'),
        'keyword_edges': one('SELECT count(*) FROM keyword_edges'),
        'product_keywords': one('SELECT count(*) FROM product_keywords'),
        'supplier_links': one('SELECT count(*) FROM supplier_links'),
        'workflow_events': one('SELECT count(*) FROM workflow_events'),
        'stores': one('SELECT count(*) FROM stores'),
    },
    'room_counts': rows('SELECT current_room AS room, count(*) AS count FROM products GROUP BY current_room ORDER BY count DESC'),
    'keyword_room_counts': rows('SELECT current_room AS room, count(*) AS count FROM keywords GROUP BY current_room ORDER BY count DESC'),
    'sources': rows('SELECT source_name, source_kind, source_size, imported_at FROM sources ORDER BY imported_at DESC LIMIT 30'),
    'products': products,
    'keywords': keywords,
    'keyword_edges': keyword_edges,
    'related_hubs': related_hubs,
    'opportunities': opportunities,
    'keyword_opportunities': keyword_opportunities,
    'action_queue': action_queue,
    'workflow_funnel': workflow_funnel,
    'phase_b': {
        'enabled': True,
        'read_only_recommendations': True,
        'description': 'Ranks imported products/keywords into next-action queues without Etsy, supplier, browser, or source side effects.',
    },
    'safety': {
        'read_only_api': True,
        'source_modified': False,
        'etsy_actions': False,
        'supplier_messages': False,
        'purchases': False,
        'browser_used': False,
    },
}
print(json.dumps(result, ensure_ascii=False))
`

  const safeMinScore = Number.isFinite(minScore) ? Math.max(0, Math.min(100, minScore)) : 0
  const data = runSqliteJson<Record<string, unknown>>(script, [q, String(limit), room, status, String(safeMinScore)])
  return {
    ...data,
    summary,
    db_path: DB_PATH,
    source_dir_read_only: summary?.source_dir_read_only ?? '/Users/mac/.hermes/product-research',
  }
}
