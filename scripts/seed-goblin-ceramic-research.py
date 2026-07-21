#!/usr/bin/env python3
"""Seed Goblin Analytics with a tiny Etsy ceramic research run.

Reads local .env and /tmp/hermes_etsy_ceramic_research_cards.json.
Does not print Supabase keys.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/Users/mac/hermes-workspace')
ENV_PATH = ROOT / '.env'
CARDS_PATH = Path('/tmp/hermes_etsy_ceramic_research_cards.json')
OUT_PATH = ROOT / 'status' / 'ceramic-research-seed-20260703.json'


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if path.exists():
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            env[key.strip()] = value.strip().strip('"\'')
    env.update({k: v for k, v in os.environ.items() if k.startswith('GOBLIN_SUPABASE') or k == 'GOBLIN_DB_MODE'})
    return env


def request(config: dict[str, str], schema: str, table_or_path: str, method='GET', body=None, query=None):
    url = config['GOBLIN_SUPABASE_URL'].rstrip('/') + '/rest/v1/' + table_or_path
    if query:
        url += '?' + urllib.parse.urlencode(query, doseq=True)
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, method=method)
    key = config.get('GOBLIN_SUPABASE_SERVICE_ROLE_KEY') or config.get('GOBLIN_SUPABASE_SECRET_KEY')
    if not key:
        raise RuntimeError('Missing local Supabase service/secret key')
    req.add_header('apikey', key)
    req.add_header('authorization', f'Bearer {key}')
    req.add_header('accept', 'application/json')
    req.add_header('accept-profile', schema)
    req.add_header('content-profile', schema)
    if body is not None:
        req.add_header('content-type', 'application/json')
        req.add_header('prefer', 'return=representation,resolution=merge-duplicates')
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            text = res.read().decode('utf-8')
            return json.loads(text) if text else []
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', errors='ignore')
        detail = re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+', '[SUPABASE_KEY_REDACTED]', detail)
        raise RuntimeError(f'{method} {schema}.{table_or_path} failed: HTTP {e.code} {detail[:600]}') from e


def find_first(rows, key, value):
    return next((row for row in rows if row.get(key) == value), None)


def price_gate(price):
    if price is None:
        return 'unknown'
    if price >= 30:
        return 'green'
    if price >= 25:
        return 'yellow'
    return 'red'


def product_family(query: str) -> str:
    return {
        'ceramic vase': 'ceramic_vase',
        'ceramic mug': 'ceramic_mug',
        'ceramic lamp': 'ceramic_lamp',
    }.get(query, 'ceramic_product')


def style_tags_for(card):
    title = (card.get('title') or '').lower()
    tags = ['ceramic']
    for word in ['wabi sabi', 'japandi', 'minimalist', 'stoneware', 'sculptural', 'rustic', 'handmade', 'black', 'lamp', 'mug', 'vase']:
        if word in title:
            tags.append(word)
    return sorted(set(tags))


def choose_clusters(cards):
    picks = []
    # strongest simple rule: first green price card for each query with a parsed shop/title.
    for query in ['ceramic vase', 'ceramic mug', 'ceramic lamp']:
        eligible = [c for c in cards if c['query'] == query and c.get('price_usd') and c['price_usd'] >= 30 and c.get('shop_name') and 'find similar' not in c.get('title', '').lower()]
        if eligible:
            picks.append(eligible[0])
    return picks


def main():
    env = load_env(ENV_PATH)
    if env.get('GOBLIN_DB_MODE') != 'supabase':
        raise RuntimeError('GOBLIN_DB_MODE is not supabase')
    cards = json.loads(CARDS_PATH.read_text())
    now = datetime.now(timezone.utc).isoformat()

    # Clean only previous generated seed rows from this exact helper, so reruns stay tidy.
    request(env, 'goblin_analytics', 'search_runs', method='DELETE', query={'mode': 'eq.etsy_first_triage_seed'})
    request(env, 'goblin_analytics', 'product_clusters', method='DELETE', query={'visual_fingerprint': 'like.seed:*'})
    request(env, 'goblin_analytics', 'events', method='DELETE', query={'event_type': 'eq.ceramic_seed_research_imported'})

    workspaces = request(env, 'workspace_core', 'workspaces', query={'select': 'id,slug', 'slug': 'eq.hermes-workspace', 'limit': '1'})
    if not workspaces:
        raise RuntimeError('workspace not found')
    workspace_id = workspaces[0]['id']
    rooms = request(env, 'workspace_core', 'rooms', query={'select': 'id,slug', 'workspace_id': f'eq.{workspace_id}', 'slug': 'eq.goblin-analytics', 'limit': '1'})
    room_id = rooms[0]['id'] if rooms else None

    search_run = request(env, 'goblin_analytics', 'search_runs', method='POST', body=[{
        'workspace_id': workspace_id,
        'room_id': room_id,
        'query': 'ceramic vase / ceramic mug / ceramic lamp',
        'marketplace': 'etsy',
        'mode': 'etsy_first_triage_seed',
        'status': 'completed',
        'cards_scanned': len(cards),
        'cards_opened': 0,
        'clusters_found': 3,
        'notes': 'Seed from read-only Etsy visible search pages. No Alura/supplier proof yet; not GREEN approval candidates.',
        'raw_context': {
            'queries': ['ceramic vase', 'ceramic mug', 'ceramic lamp'],
            'price_floor_usd': 30,
            'source': 'etsy_visible_search_cards',
            'captured_at': now,
        },
        'started_at': now,
        'completed_at': now,
    }])[0]

    shops_by_name = {}
    for card in cards:
        shop = card.get('shop_name')
        if not shop or shop in shops_by_name:
            continue
        row = request(env, 'goblin_analytics', 'shops?on_conflict=etsy_shop_id', method='POST', body=[{
            'workspace_id': workspace_id,
            'shop_name': shop,
            'shop_url': f'https://www.etsy.com/shop/{shop}',
            'etsy_shop_id': shop,
            'goblin_level': 'none',
            'notes': 'Seen in ceramic seed search only. Dropship/Goblin status not verified.',
            'metadata': {'identifier_source': 'etsy_shop_name_seed', 'research_run': search_run['id']},
            'last_seen_at': now,
        }])[0]
        shops_by_name[shop] = row

    selected = choose_clusters(cards)
    clusters = []
    cluster_by_url = {}
    for card in selected:
        cluster = request(env, 'goblin_analytics', 'product_clusters', method='POST', body=[{
            'workspace_id': workspace_id,
            'room_id': room_id,
            'canonical_name': card['title'][:180],
            'product_family': product_family(card['query']),
            'style_tags': style_tags_for(card),
            'visual_fingerprint': f"seed:{card['query']}:{card.get('shop_name')}:{card.get('listing_id')}",
            'product_function': product_family(card['query']).replace('_', ' '),
            'material_claim': 'ceramic / visible Etsy claim only',
            'canonical_image_url': card.get('image_url'),
            'status': 'candidate',
            'price_gate_status': price_gate(card.get('price_usd')),
            'min_price_usd': card.get('price_usd'),
            'max_price_usd': card.get('price_usd'),
            'avg_price_usd': card.get('price_usd'),
            'source_status': 'not_checked',
            'goblin_signal_status': 'none',
            'saturation_risk': 'unknown',
            'copyability_score': 2,
            'margin_status': 'unknown',
            'decision_notes': 'Research seed only: passed visible price gate, still needs Alura demand + supplier image proof.',
            'metadata': {
                'etsy_listing_url': card.get('url'),
                'etsy_shop': card.get('shop_name'),
                'query': card.get('query'),
                'position': card.get('position'),
                'not_green_reason': 'No Alura metrics and no supplier match yet.',
            },
            'first_seen_at': now,
            'last_seen_at': now,
        }])[0]
        clusters.append(cluster)
        cluster_by_url[card['url']] = cluster

        shop_record = shops_by_name.get(card.get('shop_name'))
        listing = request(env, 'goblin_analytics', 'cluster_listings', method='POST', body=[{
            'cluster_id': cluster['id'],
            'shop_record_id': shop_record['id'] if shop_record else None,
            'listing_id': card.get('listing_id'),
            'listing_url': card.get('url'),
            'shop_id': card.get('shop_name'),
            'title': card.get('title'),
            'price_usd': card.get('price_usd'),
            'image_url': card.get('image_url'),
            'match_status': 'seed_reference',
            'match_reason': 'Primary visible Etsy card used as seed reference for this cluster.',
            'metadata': {'query': card.get('query'), 'position': card.get('position'), 'raw_text': card.get('raw_text')},
            'first_seen_at': now,
            'last_seen_at': now,
        }])[0]

        request(env, 'goblin_analytics', 'caveats', method='POST', body=[{
            'cluster_id': cluster['id'],
            'shop_id': shop_record['id'] if shop_record else None,
            'type': 'supplier_not_verified',
            'severity': 'medium',
            'is_kill_switch': False,
            'message': 'Still needs supplier image-search/source proof before GREEN approval.',
            'metadata': {'listing_url': card.get('url'), 'source': 'seed_guardrail'},
        }])

    card_rows = []
    for card in cards:
        cluster = cluster_by_url.get(card['url'])
        card_rows.append({
            'search_run_id': search_run['id'],
            'cluster_id': cluster['id'] if cluster else None,
            'listing_url': card.get('url'),
            'listing_id': card.get('listing_id'),
            'shop_url': f"https://www.etsy.com/shop/{card.get('shop_name')}" if card.get('shop_name') else None,
            'shop_id': card.get('shop_name'),
            'title': card.get('title'),
            'visible_price_usd': card.get('price_usd'),
            'currency': 'USD',
            'image_url': card.get('image_url'),
            'position': card.get('position'),
            'page_number': 1,
            'badges': [],
            'quick_status': 'seen',
            'price_gate_status': card.get('price_gate_status') or price_gate(card.get('price_usd')),
            'triage_status': 'shortlisted' if cluster else ('rejected_price' if price_gate(card.get('price_usd')) == 'red' else 'seen'),
            'metadata': {'query': card.get('query'), 'raw_text': card.get('raw_text')},
        })
    # Batch insert in chunks.
    for i in range(0, len(card_rows), 25):
        request(env, 'goblin_analytics', 'search_result_cards', method='POST', body=card_rows[i:i+25])

    request(env, 'goblin_analytics', 'events', method='POST', body=[{
        'workspace_id': workspace_id,
        'room_id': room_id,
        'event_type': 'ceramic_seed_research_imported',
        'severity': 'info',
        'message': 'Imported Etsy ceramic seed research: 54 visible search cards, 3 candidate clusters, no supplier proof yet.',
        'source': 'hermes_seed_script',
        'metadata': {
            'search_run_id': search_run['id'],
            'cluster_count': len(clusters),
            'card_count': len(cards),
            'queries': ['ceramic vase', 'ceramic mug', 'ceramic lamp'],
        },
    }])

    summary = {
        'search_run_id': search_run['id'],
        'workspace_id': workspace_id,
        'room_id': room_id,
        'cards_inserted': len(card_rows),
        'shops_seen': len(shops_by_name),
        'clusters_inserted': len(clusters),
        'selected_clusters': [
            {
                'id': cluster['id'],
                'canonical_name': cluster['canonical_name'],
                'price_gate_status': cluster['price_gate_status'],
                'source_status': cluster['source_status'],
            }
            for cluster in clusters
        ],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
