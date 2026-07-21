import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createFallbackLocalEvidenceResult } from '../lib/war-room/living-v3/etsy-evidence-adapter'
import type { EtsyEvidenceSearchResult } from '../lib/war-room/living-v3/etsy-evidence-adapter'

const WORKSPACE_ROOT = process.cwd()
const DB_PATH = path.join(WORKSPACE_ROOT, 'data', 'product-intelligence', 'product_intelligence.db')

type SearchOptions = {
  q?: string | null
  limit?: number
}

function clampLimit(value: unknown, fallback = 8) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(20, Math.floor(n)))
}

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function getEtsyMarketLabEvidence(options: SearchOptions = {}): EtsyEvidenceSearchResult {
  const query = normalizeQuery(options.q ?? '')
  const limit = clampLimit(options.limit)

  if (!query) return createFallbackLocalEvidenceResult(query, 'fallback local mock — empty evidence query')
  if (!fs.existsSync(DB_PATH)) return createFallbackLocalEvidenceResult(query, 'fallback local mock — Product Intelligence DB is missing')

  const script = String.raw`
import json, sqlite3, sys, re
db_path, query, limit_s = sys.argv[1], sys.argv[2], sys.argv[3]
limit = max(1, min(20, int(limit_s)))
stop = set(['for','the','and','with','from','etsy','gift','gifts','local'])
tokens = [t for t in re.split(r'[^a-z0-9]+', query.lower()) if len(t) > 2 and t not in stop][:8]
if not tokens:
    tokens = [query.lower()]
con = sqlite3.connect('file:' + db_path + '?mode=ro', uri=True)
con.row_factory = sqlite3.Row

def rows(sql, params=()):
    return [dict(r) for r in con.execute(sql, params).fetchall()]

def safe_json(value):
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        return {}

def token_score(text):
    value = (text or '').lower()
    return sum(1 for token in tokens if token in value)

like_parts = []
params = []
for token in tokens:
    like = '%' + token + '%'
    like_parts.append('''lower(coalesce(p.title,'')) LIKE ? OR lower(coalesce(p.etsy_angle,'')) LIKE ? OR lower(coalesce(p.variant_plan,'')) LIKE ? OR lower(coalesce(p.alura_evidence,'')) LIKE ? OR EXISTS (
      SELECT 1 FROM product_keywords pk JOIN keywords k ON k.id = pk.keyword_id WHERE pk.product_id = p.id AND lower(k.keyword) LIKE ?
    )''')
    params.extend([like, like, like, like, like])
where = ' OR '.join('(' + part + ')' for part in like_parts)
product_rows = rows(f'''
SELECT p.id, p.title, p.niche, p.product_type, p.etsy_angle, p.variant_plan, p.status, p.current_room,
       p.alura_evidence, p.shotlab_status, p.source_file, p.raw_json,
       (SELECT count(*) FROM supplier_links s WHERE s.product_id = p.id) AS supplier_link_count
FROM products p
WHERE {where}
LIMIT 60
''', params)

products = []
supplier_pool = []
keyword_pool = {}
for product in product_rows:
    keywords = rows('''
      SELECT k.id, k.keyword, k.score, k.search_volume, k.competition, k.avg_sales, k.avg_price, k.competition_level, k.current_room
      FROM product_keywords pk JOIN keywords k ON k.id = pk.keyword_id
      WHERE pk.product_id = ?
      ORDER BY coalesce(k.score, 0) DESC, coalesce(k.avg_sales, 0) DESC, k.keyword ASC
      LIMIT 8
    ''', (product['id'],))
    supplier_links = rows('''
      SELECT id, product_id, platform, url, search_query, status, risk_flags, raw_json
      FROM supplier_links
      WHERE product_id = ?
      ORDER BY created_at ASC
      LIMIT 8
    ''', (product['id'],))
    for keyword in keywords:
        keyword_pool[keyword['id']] = keyword
    normalized_suppliers = []
    for supplier in supplier_links:
        raw = safe_json(supplier.get('raw_json'))
        proof = raw.get('Supplier Proof') or raw.get('Alura Stats') or None
        raw_title = raw.get('Product Suggestion') or product['title']
        normalized = {
            'id': supplier['id'],
            'productId': supplier['product_id'],
            'platform': supplier['platform'] or 'Unknown',
            'url': supplier['url'],
            'searchQuery': supplier['search_query'],
            'status': supplier['status'],
            'riskFlags': supplier['risk_flags'],
            'proof': proof,
            'rawTitle': raw_title,
        }
        normalized_suppliers.append(normalized)
        supplier_pool.append(normalized)
    searchable = ' '.join([
        product.get('title') or '',
        product.get('etsy_angle') or '',
        product.get('variant_plan') or '',
        product.get('alura_evidence') or '',
        ' '.join(k.get('keyword') or '' for k in keywords),
    ])
    confidence = min(96, 35 + token_score(searchable) * 14 + min(18, len(keywords) * 2) + min(12, len(supplier_links) * 3))
    products.append({
        'id': product['id'],
        'title': product['title'],
        'niche': product['niche'],
        'productType': product['product_type'],
        'etsyAngle': product['etsy_angle'],
        'variantPlan': product['variant_plan'],
        'status': product['status'],
        'currentRoom': product['current_room'],
        'aluraEvidence': product['alura_evidence'],
        'shotlabStatus': product['shotlab_status'],
        'sourceFile': product['source_file'],
        'supplierLinkCount': product['supplier_link_count'],
        'keywords': [{
            'id': k['id'],
            'keyword': k['keyword'],
            'score': k['score'],
            'searchVolume': k['search_volume'],
            'competition': k['competition'],
            'avgSales': k['avg_sales'],
            'avgPrice': k['avg_price'],
            'competitionLevel': k['competition_level'],
            'currentRoom': k['current_room'],
            'signalReason': 'linked product keyword',
        } for k in keywords],
        'supplierLinks': normalized_suppliers,
        'confidence': confidence,
        'matchReason': 'matched Product Intelligence product evidence',
    })

products.sort(key=lambda p: (-p['confidence'], p['title']))
products = products[:limit]

kw_parts = []
kw_params = []
for token in tokens:
    kw_parts.append('lower(keyword) LIKE ?')
    kw_params.append('%' + token + '%')
kw_where = ' OR '.join(kw_parts)
keyword_rows = rows(f'''
SELECT id, keyword, score, search_volume, competition, avg_sales, avg_price, competition_level, current_room
FROM keywords
WHERE {kw_where}
ORDER BY coalesce(score, 0) DESC, coalesce(avg_sales, 0) DESC, keyword ASC
LIMIT ?
''', (*kw_params, limit * 2))
for keyword in keyword_rows:
    keyword_pool[keyword['id']] = keyword

keywords = [{
    'id': k['id'],
    'keyword': k['keyword'],
    'score': k['score'],
    'searchVolume': k['search_volume'],
    'competition': k['competition'],
    'avgSales': k['avg_sales'],
    'avgPrice': k['avg_price'],
    'competitionLevel': k['competition_level'],
    'currentRoom': k['current_room'],
    'signalReason': 'matched local keyword evidence',
} for k in keyword_pool.values()]
keywords.sort(key=lambda k: (-(k.get('score') or 0), -(k.get('avgSales') or 0), k.get('keyword') or ''))
keywords = keywords[:limit * 2]

source_ids = []
keyword_ids = []
evidence_ids = []
for p in products:
    source_ids.append(p['id'])
    if p.get('sourceFile'):
        source_ids.append(p['sourceFile'])
    evidence_ids.append(p['id'])
    for k in p.get('keywords', []):
        keyword_ids.append(k['id'])
        evidence_ids.append(k['id'])
    for s in p.get('supplierLinks', []):
        evidence_ids.append(s['id'])
for k in keywords:
    keyword_ids.append(k['id'])
    evidence_ids.append(k['id'])

def unique(values):
    out = []
    seen = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out[:80]

has_evidence = bool(products or keywords)
result = {
    'ok': True,
    'query': query,
    'dataOrigin': 'mixed-local-archive' if has_evidence else 'fallback-mock',
    'products': products,
    'keywords': keywords,
    'supplierLinks': supplier_pool[:limit * 2],
    'evidenceIds': unique(evidence_ids),
    'sourceRecordIds': unique(source_ids),
    'keywordIds': unique(keyword_ids),
    'fallbackReason': 'Fallback mixed local archive — not Oracle/Alura signal' if has_evidence else 'fallback local mock — no evidence match',
}
print(json.dumps(result, ensure_ascii=False))
`

  try {
    const output = execFileSync('python3', ['-c', script, DB_PATH, query, String(limit)], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
      timeout: 15_000,
    })
    const data = JSON.parse(output) as EtsyEvidenceSearchResult
    if (!data.products.length && !data.keywords.length) {
      return createFallbackLocalEvidenceResult(query, data.fallbackReason ?? 'fallback local mock — no evidence match')
    }
    return data
  } catch (error) {
    return {
      ...createFallbackLocalEvidenceResult(query, 'fallback local mock — evidence read failed'),
      warning: error instanceof Error ? error.message : String(error),
    }
  }
}
