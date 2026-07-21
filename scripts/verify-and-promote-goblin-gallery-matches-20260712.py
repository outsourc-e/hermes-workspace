#!/usr/bin/env /usr/bin/python3
import json, re, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/Users/mac/hermes-workspace')
WB = Path('/Users/mac/.hermes/workbench/goblin-ceramic-20260712')
NOW = datetime.now(timezone.utc).isoformat()
BATCH = 'goblin_ceramic_incognito_20260712_exact_gallery_fix'

EH = json.load(open(WB / 'ehunt-stores-combined.json'))
MATCH = json.load(open(WB / 'gallery-match-proof-clean-final15.json'))
SHEETS = {x['listing_id']: x for x in json.load(open(WB / 'gallery-proof-sheets-final15.json'))}
ETSY_GALLERIES = {x['listing_id']: x for x in json.load(open(WB / 'etsy-galleries-final.json'))}
ALI_GALLERIES = json.load(open(WB / 'aliexpress-shortlist-galleries-final15.json'))
ALI_BY_KEY = {(x['listing_id'], x['candidate_item_id']): x for x in ALI_GALLERIES}

CHOSEN = {
    '4521246878': '1005008189614089',
    '4487339812': '1005010565831195',
    '4500793333': '1005010410546672',
    '4467601719': '1005009353147943',
    '4490578458': '1005008252029396',
    '4395028001': '1005009812360165',
    '1599752212': '1005012567164580',
    '1356805032': '1005011531096442',
    '1775156258': '1005010227818951',
    '1892879875': '4000797539561',
    '4501531780': '1005011856941496',
    '4428570925': '1005012171824646',
    '4439532940': '1005009520935284',
    '4450811161': '1005008797706559',
    '4431029159': '1005010488187372',
}
# Commercial green: exact gallery proof + >= ~$10 conservative delivered-cost spread.
# Two exact+commercial products confirm the shop as a Goblin; weaker/low-ticket rows stay yellow.
GREEN_ALLOW = {
    '4521246878', '4467601719',
    '1775156258', '1892879875',
    '4501531780', '4428570925', '4439532940', '4450811161', '4431029159',
}


def env():
    out = {}
    for line in (ROOT / '.env').read_text().splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out

E = env()
BASE_RAW = E.get('GOBLIN_SUPABASE_URL') or E.get('SUPABASE_URL')
KEY_RAW = E.get('GOBLIN_SUPABASE_SERVICE_ROLE_KEY') or E.get('GOBLIN_SUPABASE_SECRET_KEY') or E.get('SUPABASE_SERVICE_ROLE_KEY')
if not BASE_RAW or not KEY_RAW:
    raise SystemExit('Missing Supabase configuration; secrets not printed.')
BASE = BASE_RAW.rstrip('/')
KEY = str(KEY_RAW)


def req(schema, path, method='GET', body=None, prefer=None):
    headers = {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Accept': 'application/json',
        'Accept-Profile': schema,
        'Content-Profile': schema,
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + '/rest/v1/' + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=45) as z:
            raw = z.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='ignore')[:500]
        raise RuntimeError(f'{method} {schema}.{path} HTTP {e.code}: {detail}')


def q(s):
    return urllib.parse.quote(str(s), safe='')


def products_for_shop(shop):
    out = {}
    for x in (EH[shop].get('hot') or []) + (EH[shop].get('products') or []):
        out.setdefault(str(x.get('product_id')), x)
    return out


def ils_prices(text):
    return [float(v.replace(',', '')) for v in re.findall(r'₪\s*([\d,.]+)', text or '')]

workspace_id = req('workspace_core', 'workspaces?select=id&slug=eq.hermes-workspace&limit=1')[0]['id']
room_rows = req('workspace_core', f'rooms?select=id&workspace_id=eq.{workspace_id}&slug=eq.goblin-analytics&limit=1')
room_id = room_rows[0]['id'] if room_rows else None

rows = []
shop_counts = {}
for shop in ['RazzleLume', 'YiceraCeramics', 'SherysCeramicsStudio']:
    pmap = products_for_shop(shop)
    exact_count = green_count = 0
    for lid, ali_item in CHOSEN.items():
        if lid not in pmap:
            continue
        mr = next(x for x in MATCH if x['listing_id'] == lid and x['candidate_item_id'] == ali_item)
        alrow = ALI_BY_KEY[(lid, ali_item)]
        body = mr.get('body', '')
        prices = ils_prices(body)
        sale_ils = prices[0] if prices else None
        ship_match = re.search(r'Shipping:\s*₪\s*([\d,.]+)', body, re.I)
        shipping_ils = float(ship_match.group(1).replace(',', '')) if ship_match else (0.0 if re.search(r'Free shipping|Free pick-up', body, re.I) else None)
        delivered_ils = (sale_ils + (shipping_ils or 0)) if sale_ils is not None else None
        delivered_usd = round(delivered_ils / 3.65, 2) if delivered_ils is not None else None
        etsy_usd = float(pmap[lid].get('price') or 0)
        margin_usd = round(etsy_usd - delivered_usd, 2) if delivered_usd is not None else None
        ratio = round(etsy_usd / delivered_usd, 2) if delivered_usd else None
        exact = mr['verdict'] == 'exact-photo-proof'
        green = lid in GREEN_ALLOW and exact and margin_usd is not None and margin_usd >= 10
        exact_count += int(exact)
        green_count += int(green)

        cluster = req('goblin_analytics', f'product_clusters?select=id&visual_fingerprint=eq.{q("incognito20260712:" + lid)}&limit=1')[0]
        cid = cluster['id']
        listing_rows = req('goblin_analytics', f'cluster_listings?select=id&cluster_id=eq.{cid}&limit=1')
        listing_id = listing_rows[0]['id'] if listing_rows else None
        verdict = 'GREEN_EXACT_GALLERY_PROOF' if green else ('YELLOW_EXACT_SOURCE_MARGIN_OR_TICKET_HOLD' if exact else 'YELLOW_NO_EXACT_GALLERY_PROOF')
        note = (
            f'Clean gallery-to-gallery proof: {mr["exact_pair_count"]} exact photo pair(s), '
            f'Etsy {mr["etsy_image_count"]} listing-gallery images vs Ali {mr["ali_image_count"]} product/SKU-gallery images. '
            f'Ali displayed product ₪{sale_ils}, shipping ₪{shipping_ils}; delivered estimate ₪{delivered_ils} (~${delivered_usd}); '
            f'Etsy ${etsy_usd}; conservative gross spread ${margin_usd}, ratio {ratio}x. '
            + ('GREEN: exact source proof plus margin gate passed.' if green else 'HOLD/YELLOW: exactness, low ticket, or commercial gate not fully passed.')
        )
        metadata = {
            'research_batch': BATCH,
            'verdict': verdict,
            'etsy_shop_name': shop,
            'etsy_listing_id': lid,
            'etsy_url': f'https://www.etsy.com/listing/{lid}',
            'etsy_price_usd': etsy_usd,
            'supplier_url': mr['ali_url'],
            'supplier_item_id': ali_item,
            'supplier_product_ils': sale_ils,
            'supplier_shipping_ils': shipping_ils,
            'supplier_delivered_ils': delivered_ils,
            'supplier_delivered_usd_estimate': delivered_usd,
            'gross_margin_usd_estimate': margin_usd,
            'gross_ratio_estimate': ratio,
            'gallery_exact_photo_pairs': mr['exact_pair_count'],
            'gallery_match_verdict': mr['verdict'],
            'etsy_gallery_urls': ETSY_GALLERIES[lid].get('images', []),
            'ali_gallery_urls': alrow.get('images', []),
            'ali_variants': alrow.get('variants', []),
            'gallery_proof_url': SHEETS[lid]['public_url'],
            'proof_method': 'clean listing carousel vs Ali product/SKU gallery; category/recommendation images excluded; pHash+dHash+ORB/RANSAC, then commercial delivered-cost gate',
        }
        req('goblin_analytics', f'product_clusters?id=eq.{cid}', 'PATCH', {
            'status': 'green' if green else 'candidate',
            'price_gate_status': 'green' if green else 'yellow',
            'source_status': 'exact_gallery_source_verified' if exact else 'supplier_candidate_only',
            'goblin_signal_status': 'confirmed_same_shop_source_proof' if exact else 'ship_from_china_candidate',
            'margin_status': 'green_delivered_spread' if green else 'hold',
            'decision_notes': note,
            'metadata': metadata,
            'last_seen_at': NOW,
        }, prefer='return=minimal')
        req('goblin_analytics', 'supplier_matches?on_conflict=cluster_id,source_url', 'POST', [{
            'cluster_id': cid,
            'listing_id': listing_id,
            'source_platform': 'aliexpress',
            'source_url': mr['ali_url'],
            'source_item_id': ali_item,
            'match_status': 'exact_gallery_photo_match' if exact else 'candidate_no_exact_gallery_match',
            'coverage_status': 'exact_product_gallery' if exact else 'candidate',
            'supplier_price_estimate_usd': delivered_usd,
            'variant_coverage': {'product_price_ils': sale_ils, 'shipping_ils': shipping_ils, 'delivered_ils': delivered_ils, 'variants': alrow.get('variants', [])},
            'image_match_notes': note,
            'qa_status': 'gallery_exact_photo_verified' if exact else 'needs_human_micro_detail_qa',
            'metadata': metadata,
        }], prefer='resolution=merge-duplicates,return=minimal')
        if exact:
            req('goblin_analytics', f'caveats?cluster_id=eq.{cid}&type=eq.human_micro_detail_qa_required&resolved_at=is.null', 'PATCH', {'resolved_at': NOW}, prefer='return=minimal')
        req('workspace_core', 'evidence_assets', 'POST', [{
            'workspace_id': workspace_id,
            'room_id': room_id,
            'entity_schema': 'goblin_analytics',
            'entity_table': 'product_clusters',
            'entity_id': cid,
            'asset_type': 'exact_gallery_proof_sheet',
            'storage_provider': 'public_workspace_asset',
            'path_or_url': SHEETS[lid]['public_url'],
            'mime_type': 'image/jpeg',
            'notes': f'All Etsy carousel and selected Ali product/SKU gallery images; {mr["exact_pair_count"]} exact photo pair(s).',
            'metadata': metadata,
        }], prefer='return=minimal')
        req('goblin_analytics', 'price_margin_snapshots', 'POST', [{
            'cluster_id': cid,
            'competitor_price_usd': etsy_usd,
            'supplier_estimate_usd': delivered_usd,
            'target_price_usd': etsy_usd,
            'margin_estimate_usd': margin_usd,
            'margin_percent_estimate': round(margin_usd / etsy_usd * 100, 1) if margin_usd is not None and etsy_usd else None,
            'price_gate_status': 'green' if green else 'yellow',
            'margin_gate_status': 'green_delivered_spread' if green else 'hold',
            'notes': 'Delivered estimate uses displayed Ali product price plus displayed shipping/pick-up option; excludes Etsy fees, ads, breakage and returns.',
            'metadata': metadata,
        }], prefer='return=minimal')
        rows.append({
            'shop': shop,
            'listing_id': lid,
            'status': 'green' if green else 'yellow',
            'source_exact': exact,
            'exact_pairs': mr['exact_pair_count'],
            'etsy_usd': etsy_usd,
            'ali_item_id': ali_item,
            'ali_product_ils': sale_ils,
            'shipping_ils': shipping_ils,
            'delivered_ils': delivered_ils,
            'delivered_usd': delivered_usd,
            'gross_margin_usd': margin_usd,
            'ratio': ratio,
            'supplier_url': mr['ali_url'],
            'proof_url': SHEETS[lid]['public_url'],
        })
    shop_counts[shop] = {'exact_products': exact_count, 'green_products': green_count}
    req('goblin_analytics', f'shops?etsy_shop_id=eq.{q(shop)}', 'PATCH', {
        'goblin_level': 'confirmed_goblin' if green_count >= 2 else 'candidate',
        'candidate_dropship_product_count': exact_count,
        'notes': f'Exact gallery proof completed: {exact_count}/5 source matches; {green_count}/5 pass delivered-margin commercial gate. Shop-level Goblin confirmation requires >=2 green products: {"PASS" if green_count >= 2 else "HOLD"}.',
        'metadata': {'research_batch': BATCH, 'exact_products': exact_count, 'green_products': green_count, 'proof_gate': 'two exact commercial products per shop', 'verified_at': NOW},
        'last_seen_at': NOW,
    }, prefer='return=minimal')

req('goblin_analytics', 'events', 'POST', [{
    'workspace_id': workspace_id,
    'room_id': room_id,
    'event_type': 'exact_gallery_goblin_verification_completed',
    'severity': 'info',
    'message': 'Corrected ceramic Goblin research with clean Etsy-carousel vs Ali product/SKU gallery proof and delivered-cost margin gates.',
    'source': 'hermes_gallery_verifier',
    'metadata': {'research_batch': BATCH, 'shop_counts': shop_counts, 'green_products': sum(1 for r in rows if r['status'] == 'green'), 'yellow_products': sum(1 for r in rows if r['status'] == 'yellow')},
}], prefer='return=minimal')

out = {'batch': BATCH, 'verified_at': NOW, 'shop_counts': shop_counts, 'products': rows}
out_path = ROOT / 'status' / 'goblin-ceramic-exact-gallery-verified-20260712.json'
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(json.dumps({'ok': True, 'shop_counts': shop_counts, 'green': sum(r['status'] == 'green' for r in rows), 'yellow': sum(r['status'] == 'yellow' for r in rows), 'out': str(out_path)}, ensure_ascii=False))
