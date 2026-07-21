#!/usr/bin/env python3
import json, re, time, urllib.request
from pathlib import Path
import websocket

CANDIDATES = [
  {'listing_id':'4368029072','match_rank':'high_near','supplier_label':'AliExpress supplier 1','url':'https://he.aliexpress.com/item/1005009239586888.html','note':'black round wabi-sabi vase with tilted mouth'},
  {'listing_id':'1497153250','match_rank':'uncertain','supplier_label':'AliExpress supplier 1','url':'https://he.aliexpress.com/item/1005006946644579.html','note':'white/beige mug candidate but not exact'},
  {'listing_id':'4517113800','match_rank':'high_near','supplier_label':'AliExpress supplier 1','url':'https://he.aliexpress.com/item/1005005969477519.html','note':'collage includes black/white ceramic table lamps similar to target'},
]
OUT=Path('/Users/mac/hermes-workspace/status/goblin-ceramic-supplier-pages-20260703.json')

tabs=json.load(urllib.request.urlopen('http://127.0.0.1:9222/json'))
page=next(t for t in tabs if t.get('type')=='page')
ws=websocket.create_connection(page['webSocketDebuggerUrl'], timeout=20)
seq=0

def call(method, params=None):
  global seq
  seq+=1
  ws.send(json.dumps({'id':seq,'method':method,'params':params or {}}))
  while True:
    msg=json.loads(ws.recv())
    if msg.get('id')==seq: return msg

def eval_js(expr):
  res=call('Runtime.evaluate', {'expression':expr, 'returnByValue':True, 'awaitPromise':True, 'timeout':30000})
  if 'exceptionDetails' in res: return {'exception':res['exceptionDetails'].get('text')}
  return res.get('result',{}).get('result',{}).get('value')

def nav(url):
  call('Page.enable'); call('Runtime.enable')
  call('Page.navigate', {'url':url})
  time.sleep(9)

js=r'''
(() => {
 const text=(document.body.innerText||'').replace(/\s+/g,' ').trim();
 const imgs=Array.from(document.images).map(img=>({src:img.currentSrc||img.src, alt:img.alt||'', w:img.naturalWidth, h:img.naturalHeight}))
   .filter(x=>x.src && /alicdn|aliexpress-media|ae-pic/.test(x.src)).slice(0,50);
 const title=document.querySelector('h1')?.innerText?.trim() || document.title;
 const price=(text.match(/(?:US\s*)?\$\s?\d+[\d.,]*(?:\s?-\s?(?:US\s*)?\$?\s?\d+[\d.,]*)?/)||[])[0] || null;
 const sold=(text.match(/\d+[,.]?\d*\+?\s*(?:sold|orders|נמכר|הוזמן)/i)||[])[0] || null;
 const rating=(text.match(/\d(?:\.\d)?\s*(?:stars|star|כוכבים)/i)||[])[0] || null;
 return JSON.stringify({url:location.href,title,price,sold,rating,images:imgs,textSample:text.slice(0,3500)});
})()
'''
out=[]
for c in CANDIDATES:
  nav(c['url'])
  raw=eval_js(js)
  try: data=json.loads(raw) if isinstance(raw,str) else raw
  except Exception: data={'raw':str(raw)[:1000]}
  out.append({**c,'page':data})
OUT.write_text(json.dumps({'created_at':time.strftime('%Y-%m-%d %H:%M:%S %z'),'candidates':out}, ensure_ascii=False, indent=2))
print(json.dumps([{'listing_id':x['listing_id'],'rank':x['match_rank'],'title':x['page'].get('title'),'price':x['page'].get('price'),'sold':x['page'].get('sold'),'images':len(x['page'].get('images',[]))} for x in out], ensure_ascii=False))
ws.close()
