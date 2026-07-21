#!/usr/bin/env python3
from __future__ import annotations
import json, os, re, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

WORKDIR = Path('/Users/mac/hermes-workspace')
BATCH = 'goblin_ceramic_deep_20260703'
NOW_ISO = datetime.now(timezone.utc).isoformat()
SEED = json.loads((WORKDIR / 'status/ceramic-research-seed-20260703.json').read_text())
DEEP = json.loads((WORKDIR / 'status/goblin-ceramic-deep-research-20260703.json').read_text())
SUPPLIER = json.loads((WORKDIR / 'status/goblin-ceramic-supplier-pages-20260703.json').read_text())
OUT = WORKDIR / 'status/goblin-ceramic-decisions-20260703.json'
CONTACT_DIR = WORKDIR / 'status/goblin-contact-sheets-20260703'

def load_env(path: Path) -> dict[str, str]:
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

env = load_env(WORKDIR / '.env')
BASE = (env.get('GOBLIN_SUPABASE_URL') or env.get('SUPABASE_URL') or '').rstrip('/')
KEY = env.get('GOBLIN_SUPABASE_SERVICE_ROLE_KEY') or env.get('GOBLIN_SUPABASE_SECRET_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY')
if not BASE or not KEY:
    raise SystemExit('Missing Supabase URL/service key in local .env; not printing secrets.')

workspace_id = SEED['workspace_id']
room_id = SEED['room_id']
clusters = {x['canonical_name']: x for x in SEED['selected_clusters']}
supplier_by_id = {x['listing_id']: x for x in SUPPLIER['candidates']}

def request(schema: str, table_path: str, method: str = 'GET', body=None, prefer: str | None = None):
    url = f"{BASE}/rest/v1/{table_path}"
    data = None
    headers = {
        'apikey': KEY,
        'Authorization': f'Bearer {KEY}',
        'Accept-Profile': schema,
        'Content-Profile': schema,
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            if not raw:
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors='ignore')
        raise RuntimeError(f'{method} {schema}.{table_path} failed HTTP {e.code}: {raw[:500]}')

def q(v: str) -> str:
    return urllib.parse.quote(v, safe='')

def parse_ils(text: str) -> float | None:
    m = re.search(r'₪\s?([0-9]+(?:\.[0-9]+)?)', text or '')
    return float(m.group(1)) if m else None

def parse_int_prefix(value: str | None) -> int | None:
    if not value: return None
    m = re.search(r'(\d+[,.]?\d*)', value)
    if not m: return None
    return int(float(m.group(1).replace(',', '')))

# Best-effort cleanup for idempotent re-runs. Ignore failures to avoid blocking DB update.
for schema, table in [
    ('goblin_analytics', 'caveats'),
    ('goblin_analytics', 'events'),
    ('goblin_analytics', 'price_margin_snapshots'),
    ('workspace_core', 'evidence_assets'),
]:
    try:
        request(schema, f"{table}?metadata->>research_batch=eq.{q(BATCH)}", 'DELETE')
    except Exception:
        pass

# supplier_matches has a natural unique (cluster_id, source_url); use upsert below.

decisions = []
for result in DEEP['results']:
    seed = result['seed']
    etsy = result['etsy']
    alura = result.get('alura') or {}
    cluster = clusters[seed['title']]
    cluster_id = cluster['id']
    listing_id = seed['listing_id']
    supplier = supplier_by_id.get(listing_id, {})
    page = supplier.get('page', {})
    supplier_text = page.get('textSample', '')
    supplier_ils = parse_ils(supplier_text)
    supplier_orders = parse_int_prefix(page.get('sold'))
    etsy_text = etsy.get('textSample', '')
    cart_signal = '20+ carts' if re.search(r'20\+\s+carts', etsy_text, re.I) else None
    china_ship = bool(re.search(r'Ships from:\s*China|Ships from:\nChina', etsy_text, re.I))
    views24 = etsy.get('views24') or []
    supplier_rank = supplier.get('match_rank') or 'not_found'
    alura_placeholder = ('Sales\n0' in (alura.get('textSample') or '')) and not alura.get('ok')

    if listing_id == '4368029072':
        verdict = 'YELLOW'
        status = 'candidate'
        source_status = 'supplier_high_near'
        goblin_signal_status = 'needs_alura'
        decision = 'YELLOW: Etsy has 20+ carts and ships from China; AliExpress source is visually high-near with 108 sold. Not GREEN because Alura returned placeholder/no real demand readback and variant proof is not exact enough.'
        caveat_type = 'alura_unavailable'
        caveat_message = 'Alura listing report did not return real sales/demand; do not mark GREEN until live Alura or another demand source confirms monthly demand.'
        supplier_match_status = 'high_near'
        qa_status = 'visual_review_passed_near_not_exact'
    elif listing_id == '1497153250':
        verdict = 'RED_YELLOW'
        status = 'blocked'
        source_status = 'source_rejected'
        goblin_signal_status = 'weak'
        decision = 'RED/YELLOW: Etsy has Etsy Pick, 9 views/24h and 20+ carts, but supplier candidate is not the same mug/product identity. No source proof, so do not advance.'
        caveat_type = 'source_mismatch'
        caveat_message = 'Supplier candidate is visually different from Etsy target; product identity not locked.'
        supplier_match_status = 'rejected'
        qa_status = 'visual_rejected'
    else:
        verdict = 'YELLOW'
        status = 'candidate'
        source_status = 'supplier_high_near'
        goblin_signal_status = 'needs_alura'
        decision = 'YELLOW: high Etsy price and 20+ carts; AliExpress lamp source is visually high-near with 25 sold. Not GREEN because Alura returned placeholder/no real demand readback and exact variant/margin proof is incomplete.'
        caveat_type = 'alura_unavailable'
        caveat_message = 'Alura listing report did not return real sales/demand; do not mark GREEN until live Alura or another demand source confirms monthly demand.'
        supplier_match_status = 'high_near'
        qa_status = 'visual_review_passed_near_not_exact'

    metadata = {
        'research_batch': BATCH,
        'listing_id': listing_id,
        'etsy_url': seed['url'],
        'etsy_shop_name': seed['shop_name'],
        'etsy_signals': etsy.get('signals') or [],
        'etsy_views24': views24,
        'etsy_cart_signal': cart_signal,
        'ships_from_china_signal': china_ship,
        'alura_logged_signal': alura.get('loggedSignal'),
        'alura_real_data_available': bool(alura.get('ok')),
        'alura_placeholder_detected': alura_placeholder,
        'supplier_url': supplier.get('url'),
        'supplier_sold_signal': page.get('sold'),
        'supplier_price_ils': supplier_ils,
        'contact_sheet_path': str(CONTACT_DIR / f'{listing_id}_contact_sheet.jpg'),
        'verdict': verdict,
    }

    request('goblin_analytics', f'product_clusters?id=eq.{cluster_id}', 'PATCH', {
        'status': status,
        'source_status': source_status,
        'goblin_signal_status': goblin_signal_status,
        'decision_notes': decision,
        'monthly_sales_estimate': None,
        'last_seen_at': NOW_ISO,
        'metadata': metadata,
    }, prefer='return=minimal')

    request('goblin_analytics', f'cluster_listings?cluster_id=eq.{cluster_id}', 'PATCH', {
        'match_status': 'same_listing_reviewed',
        'match_reason': decision,
        'alura_sales_estimate': None,
        'metadata': metadata,
    }, prefer='return=minimal')

    if supplier.get('url'):
        source_item = re.search(r'/item/(\d+)\.html', supplier['url'])
        request('goblin_analytics', 'supplier_matches?on_conflict=cluster_id,source_url', 'POST', [{
            'cluster_id': cluster_id,
            'source_platform': 'aliexpress',
            'source_url': supplier['url'],
            'source_item_id': source_item.group(1) if source_item else None,
            'match_status': supplier_match_status,
            'coverage_status': 'partial_variant' if supplier_match_status != 'rejected' else 'none',
            'supplier_price_estimate_usd': None,
            'orders': supplier_orders,
            'variant_coverage': {'status': 'needs_variant_check', 'source_price_ils': supplier_ils},
            'image_match_notes': decision,
            'qa_status': qa_status,
            'metadata': metadata,
        }], prefer='resolution=merge-duplicates,return=minimal')

    request('goblin_analytics', 'price_margin_snapshots', 'POST', [{
        'cluster_id': cluster_id,
        'competitor_price_usd': seed.get('price_usd'),
        'supplier_estimate_usd': None,
        'shipping_estimate_usd': None,
        'target_price_usd': seed.get('price_usd'),
        'margin_estimate_usd': None,
        'margin_percent_estimate': None,
        'price_gate_status': 'green',
        'margin_gate_status': 'unknown',
        'notes': 'Supplier price captured in ILS metadata; USD margin not calculated until shipping/currency/source variant is verified.',
        'metadata': metadata,
    }], prefer='return=minimal')

    request('goblin_analytics', 'caveats', 'POST', [{
        'cluster_id': cluster_id,
        'type': caveat_type,
        'severity': 'high' if supplier_match_status == 'rejected' else 'medium',
        'is_kill_switch': supplier_match_status == 'rejected',
        'message': caveat_message,
        'metadata': metadata,
    }], prefer='return=minimal')

    request('goblin_analytics', 'events', 'POST', [{
        'workspace_id': workspace_id,
        'room_id': room_id,
        'entity_schema': 'goblin_analytics',
        'entity_table': 'product_clusters',
        'entity_id': cluster_id,
        'event_type': 'deep_research_verdict',
        'severity': 'warning' if verdict == 'YELLOW' else 'critical',
        'message': f'{verdict}: {seed["title"][:80]} — {decision}',
        'source': 'hermes_deep_research',
        'metadata': metadata,
    }], prefer='return=minimal')

    evidence_rows = [
        ('etsy_listing', seed['url'], 'Etsy listing inspected live'),
        ('supplier_page', supplier.get('url'), f'Supplier page inspected; match={supplier_match_status}; sold={page.get("sold")}'),
        ('contact_sheet', str(CONTACT_DIR / f'{listing_id}_contact_sheet.jpg'), 'Local visual contact sheet: Etsy target vs supplier candidates'),
    ]
    for asset_type, path_or_url, notes in evidence_rows:
        if not path_or_url:
            continue
        request('workspace_core', 'evidence_assets', 'POST', [{
            'workspace_id': workspace_id,
            'room_id': room_id,
            'entity_schema': 'goblin_analytics',
            'entity_table': 'product_clusters',
            'entity_id': cluster_id,
            'asset_type': asset_type,
            'storage_provider': 'local_file' if str(path_or_url).startswith('/') else 'external_url',
            'path_or_url': path_or_url,
            'notes': notes,
            'metadata': metadata,
        }], prefer='return=minimal')

    decisions.append({
        'listing_id': listing_id,
        'cluster_id': cluster_id,
        'title': seed['title'],
        'shop_name': seed['shop_name'],
        'etsy_price_usd': seed['price_usd'],
        'verdict': verdict,
        'status': status,
        'source_status': source_status,
        'supplier_match_status': supplier_match_status,
        'supplier_url': supplier.get('url'),
        'supplier_sold': page.get('sold'),
        'supplier_price_ils': supplier_ils,
        'etsy_views24': views24,
        'etsy_cart_signal': cart_signal,
        'ships_from_china_signal': china_ship,
        'alura_real_data_available': bool(alura.get('ok')),
        'reason': decision,
        'contact_sheet_path': str(CONTACT_DIR / f'{listing_id}_contact_sheet.jpg'),
    })

OUT.write_text(json.dumps({'research_batch': BATCH, 'decisions': decisions}, ensure_ascii=False, indent=2))
print(json.dumps({
    'updated_clusters': len(decisions),
    'yellow': sum(1 for d in decisions if d['verdict'] == 'YELLOW'),
    'red_yellow': sum(1 for d in decisions if d['verdict'] == 'RED_YELLOW'),
    'output': str(OUT),
}, ensure_ascii=False))
