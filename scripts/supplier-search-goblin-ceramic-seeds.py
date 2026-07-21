#!/usr/bin/env python3
from __future__ import annotations
import json, re, time, urllib.parse, urllib.request
from pathlib import Path
import websocket

SEARCHES = [
  {
    'listing_id': '4368029072',
    'product': 'wabi sabi ceramic vase minimalist rustic ikebana black small vase',
    'queries': [
      'wabi sabi ceramic vase ikebana black small',
      'japanese ceramic flower frog vase black wabi sabi',
      'minimalist rustic ceramic bud vase dried flowers black',
    ],
  },
  {
    'listing_id': '1497153250',
    'product': 'white beige handmade ceramic mug 15oz pottery mug',
    'queries': [
      'white beige ceramic mug 15oz handmade pottery',
      'nordic pottery mug white beige ceramic cup',
      'large handmade ceramic coffee mug white beige',
    ],
  },
  {
    'listing_id': '4517113800',
    'product': 'nordic ceramic table lamp scandinavian bedside lamp japandi',
    'queries': [
      'nordic ceramic table lamp scandinavian bedside lamp japandi',
      'ceramic table lamp japandi nightstand light beige',
      'scandinavian ceramic bedside lamp minimalist living room',
    ],
  },
]

OUT = Path('/Users/mac/hermes-workspace/status/goblin-ceramic-supplier-search-20260703.json')
CDP = 'http://127.0.0.1:9222/json'

def tab():
  tabs = json.load(urllib.request.urlopen(CDP))
  pages = [t for t in tabs if t.get('type') == 'page']
  return pages[0]
ws = websocket.create_connection(tab()['webSocketDebuggerUrl'], timeout=20)
seq = 0

def call(method, params=None):
  global seq
  seq += 1
  ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
  while True:
    msg = json.loads(ws.recv())
    if msg.get('id') == seq: return msg

def eval_js(expr, timeout_ms=30000):
  res = call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True, 'timeout': timeout_ms})
  if 'exceptionDetails' in res:
    return {'__exception': res['exceptionDetails'].get('text')}
  return res.get('result', {}).get('result', {}).get('value')

def nav(url, wait=7):
  call('Page.enable'); call('Runtime.enable')
  call('Page.navigate', {'url': url})
  time.sleep(wait)

extract_js = r'''
(() => {
  const text = document.body.innerText || '';
  const cards = [];
  const anchors = Array.from(document.querySelectorAll('a[href*="/item/"], a[href*="product-detail"], a[href*="/product-detail/"]'));
  const seen = new Set();
  for (const a of anchors) {
    const href = a.href;
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const card = a.closest('div,li') || a.parentElement;
    const scope = card || a;
    const imgs = Array.from(scope.querySelectorAll('img')).map(img => ({src: img.currentSrc || img.src, alt: img.alt || '', w: img.naturalWidth, h: img.naturalHeight})).filter(x => x.src).slice(0,3);
    const t = (scope.innerText || a.innerText || '').replace(/\s+/g, ' ').trim();
    if (t.length < 8 && imgs.length === 0) continue;
    cards.push({href, text: t.slice(0, 600), images: imgs});
    if (cards.length >= 18) break;
  }
  return JSON.stringify({url: location.href, title: document.title, textSample: text.slice(0, 1500), cards});
})()
'''

out = []
for item in SEARCHES:
  item_out = {'listing_id': item['listing_id'], 'product': item['product'], 'queries': []}
  for q in item['queries']:
    query = urllib.parse.quote(q)
    urls = [
      f'https://www.aliexpress.com/w/wholesale-{query}.html',
      f'https://www.alibaba.com/trade/search?SearchText={query}',
    ]
    for url in urls:
      nav(url, wait=8)
      raw = eval_js(extract_js)
      try: data = json.loads(raw) if isinstance(raw, str) else raw
      except Exception: data = {'parse_error': True, 'raw': str(raw)[:1000]}
      item_out['queries'].append({'query': q, 'source_url': url, 'result': data})
      # keep it bounded: if we got useful cards, don't query too many variants on the same domain
      if data.get('cards'):
        break
    if any(x['result'].get('cards') for x in item_out['queries'][-2:]):
      break
  out.append(item_out)
OUT.write_text(json.dumps({'created_at': time.strftime('%Y-%m-%d %H:%M:%S %z'), 'items': out}, ensure_ascii=False, indent=2))
print(json.dumps({'written': str(OUT), 'counts': [{'listing_id': x['listing_id'], 'cards': sum(len(q['result'].get('cards', [])) for q in x['queries'])} for x in out]}, ensure_ascii=False))
ws.close()
