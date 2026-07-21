#!/usr/bin/env python3
from __future__ import annotations
import json, re, time, urllib.request
from pathlib import Path
import websocket

SEEDS = [
  {
    "listing_id": "4368029072",
    "kind": "ceramic vase",
    "url": "https://www.etsy.com/il-en/listing/4368029072/wabi-sabi-ceramic-vase-minimalist-rustic",
    "title": "Small Wabi Sabi Vase: Japanese Ikebana Ceramic Vase for Dried Flowers, Rustic Japandi Home Decor",
    "shop_name": "JitzzShop",
    "price_usd": 39.75,
    "image_url": "https://i.etsystatic.com/54004338/r/il/d89af4/7239558615/il_255x319.7239558615_qf8b.jpg",
  },
  {
    "listing_id": "1497153250",
    "kind": "ceramic mug",
    "url": "https://www.etsy.com/il-en/listing/1497153250/in-stock-15oz-pottery-mug-handmade",
    "title": "IN STOCK 15oz pottery mug / Handmade ceramic mug / White and beige ceramic mug",
    "shop_name": "NordicPottery",
    "price_usd": 70.43,
    "image_url": "https://i.etsystatic.com/17615171/r/il/811733/5887332381/il_255x319.5887332381_69c7.jpg",
  },
  {
    "listing_id": "4517113800",
    "kind": "ceramic lamp",
    "url": "https://www.etsy.com/il-en/listing/4517113800/nordic-ceramic-table-lamp-scandinavian",
    "title": "Nordic Ceramic Table Lamp, Scandinavian Bedside Lamp, Japandi Nightstand Light, Modern Minimalist Living Room Decor",
    "shop_name": "Jafastone",
    "price_usd": 215.30,
    "image_url": "https://i.etsystatic.com/65405877/r/il/3fd869/8150317103/il_255x319.8150317103_27ov.jpg",
  },
]

OUT = Path('/Users/mac/hermes-workspace/status/goblin-ceramic-deep-research-20260703.json')
CDP = 'http://127.0.0.1:9222/json'

def cdp_tab():
    tabs = json.load(urllib.request.urlopen(CDP))
    pages = [t for t in tabs if t.get('type') == 'page']
    return pages[0]

ws = websocket.create_connection(cdp_tab()['webSocketDebuggerUrl'], timeout=20)
seq = 0

def call(method, params=None):
    global seq
    seq += 1
    ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == seq:
            return msg

call('Page.enable')
call('Runtime.enable')

def eval_js(expr, timeout_ms=30000):
    res = call('Runtime.evaluate', {
        'expression': expr,
        'returnByValue': True,
        'awaitPromise': True,
        'timeout': timeout_ms,
    })
    if 'exceptionDetails' in res:
        return {'__exception': res['exceptionDetails'].get('text')}
    val = res.get('result', {}).get('result', {}).get('value')
    return val

def nav(url, wait=6):
    call('Page.navigate', {'url': url})
    time.sleep(wait)

extract_etsy_js = r'''
(() => {
  const text = document.body.innerText || '';
  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || null;
  const imgs = Array.from(document.images).map(img => ({src: img.currentSrc || img.src, alt: img.alt || '', w: img.naturalWidth, h: img.naturalHeight}))
    .filter(x => x.src && /etsystatic|i\.etsystatic/.test(x.src))
    .slice(0, 40);
  const links = Array.from(document.links).map(a => ({text: (a.innerText || '').trim().slice(0, 120), href: a.href}));
  const shopLink = links.find(a => /\/shop\//.test(a.href));
  const signals = [];
  for (const pat of ['Bestseller', "Etsy’s Pick", "Etsy's Pick", 'Star Seller', 'Limited stock', 'In demand', 'In carts', 'views in the last 24 hours', 'Only', 'Sale Price']) {
    if (text.includes(pat)) signals.push(pat);
  }
  const carts = Array.from(text.matchAll(/(\d+[,+]?\d*)\s+(?:people have this in their carts|people have this in cart|in carts)/gi)).map(m => m[0]).slice(0, 4);
  const views24 = Array.from(text.matchAll(/(\d+[,+]?\d*)\s+views? in the last 24 hours/gi)).map(m => m[0]).slice(0, 4);
  const sales = Array.from(text.matchAll(/(\d[\d,.]*\+?)\s+sales/gi)).map(m => m[0]).slice(0, 6);
  const reviews = Array.from(text.matchAll(/(\d[\d,.]*\+?)\s+reviews?/gi)).map(m => m[0]).slice(0, 8);
  return JSON.stringify({
    url: location.href,
    documentTitle: document.title,
    h1: document.querySelector('h1')?.innerText?.trim() || null,
    metaTitle: meta('og:title'),
    metaImage: meta('og:image'),
    shopLink,
    signals,
    carts,
    views24,
    sales,
    reviews,
    images: imgs,
    textSample: text.slice(0, 5000)
  });
})()
'''

alura_js_template = r'''
(async () => {
  const out = {origin: location.origin, loggedSignal: false, tokenFound: false, status: null, ok: false, data: null, error: null, textSample: (document.body.innerText || '').slice(0, 1000)};
  try {
    const text = document.body.innerText || '';
    out.loggedSignal = !/(login|sign in|log in)/i.test(text) || /listing report|dashboard|product seeker|keyword/i.test(text);
    let sessionAuth = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const raw = localStorage.getItem(key);
      try {
        const obj = JSON.parse(raw);
        if (obj && obj.stsTokenManager && obj.stsTokenManager.accessToken) {
          sessionAuth = obj.stsTokenManager.accessToken;
          break;
        }
      } catch {}
    }
    out.tokenFound = !!sessionAuth;
    if (!sessionAuth) return JSON.stringify(out);
    const resp = await fetch('https://alura-api-3yk57ena2a-uc.a.run.app/api/listings/LISTING_ID', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer ' + sessionAuth,
        'content-type': 'application/json',
      },
      body: JSON.stringify({forceUpdate: 'false'}),
    });
    out.status = resp.status;
    const data = await resp.json().catch(async () => ({raw: (await resp.text()).slice(0, 500)}));
    out.ok = resp.ok;
    const d = data && (data.data || data.result || data.listing || data);
    const pick = {};
    for (const k of Object.keys(d || {})) {
      if (/^(listing|id|title|shop|price|views|favorites|estimated|sales|revenue|lqs|score|bsr|age|tags|conversion|review|image|video|production|created|updated|currency)/i.test(k)) pick[k] = d[k];
    }
    out.data = pick;
    return JSON.stringify(out);
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 300);
    return JSON.stringify(out);
  }
})()
'''

results = []
for seed in SEEDS:
    nav(seed['url'], wait=7)
    etsy_raw = eval_js(extract_etsy_js)
    try:
        etsy = json.loads(etsy_raw) if isinstance(etsy_raw, str) else etsy_raw
    except Exception:
        etsy = {'parse_error': True, 'raw': str(etsy_raw)[:1000]}
    nav(f"https://app.alura.io/listing-report?id={seed['listing_id']}", wait=8)
    alura_raw = eval_js(alura_js_template.replace('LISTING_ID', seed['listing_id']), timeout_ms=45000)
    try:
        alura = json.loads(alura_raw) if isinstance(alura_raw, str) else alura_raw
    except Exception:
        alura = {'parse_error': True, 'raw': str(alura_raw)[:1000]}
    results.append({'seed': seed, 'etsy': etsy, 'alura': alura})

OUT.write_text(json.dumps({'created_at': time.strftime('%Y-%m-%d %H:%M:%S %z'), 'results': results}, ensure_ascii=False, indent=2))
print(json.dumps({
  'written': str(OUT),
  'items': len(results),
  'alura': [ {'id': r['seed']['listing_id'], 'tokenFound': r['alura'].get('tokenFound'), 'status': r['alura'].get('status'), 'ok': r['alura'].get('ok'), 'hasData': bool(r['alura'].get('data'))} for r in results],
  'etsySignals': [ {'id': r['seed']['listing_id'], 'signals': r['etsy'].get('signals'), 'sales': r['etsy'].get('sales'), 'reviews': r['etsy'].get('reviews'), 'views24': r['etsy'].get('views24'), 'carts': r['etsy'].get('carts')} for r in results]
}, ensure_ascii=False))
ws.close()
