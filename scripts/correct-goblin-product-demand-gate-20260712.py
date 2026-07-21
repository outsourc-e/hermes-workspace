#!/usr/bin/env /usr/bin/python3
import json, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone, date
from pathlib import Path

ROOT=Path('/Users/mac/hermes-workspace'); WB=Path('/Users/mac/.hermes/workbench/goblin-ceramic-20260712')
NOW=datetime.now(timezone.utc).isoformat(); TODAY=date(2026,7,12)
EH=json.load(open(WB/'ehunt-stores-combined.json'))
VER=json.load(open(ROOT/'status/goblin-ceramic-exact-gallery-verified-20260712.json'))
BY_LID={p['listing_id']:p for p in VER['products']}

def env():
 d={}
 for l in (ROOT/'.env').read_text().splitlines():
  if l.strip() and not l.lstrip().startswith('#') and '=' in l:
   k,v=l.split('=',1); d[k.strip()]=v.strip().strip('"').strip("'")
 return d
E=env(); base=E.get('GOBLIN_SUPABASE_URL') or E.get('SUPABASE_URL'); key=E.get('GOBLIN_SUPABASE_SERVICE_ROLE_KEY') or E.get('GOBLIN_SUPABASE_SECRET_KEY') or E.get('SUPABASE_SERVICE_ROLE_KEY')
if not base or not key: raise SystemExit('Missing Supabase config')
base=str(base).rstrip('/'); key_s=str(key)
def req(schema,path,method='GET',body=None,prefer=None):
 h={'apikey':key_s,'Authorization':'Bearer '+key_s,'Accept':'application/json','Accept-Profile':schema,'Content-Profile':schema,'Content-Type':'application/json'}
 if prefer:h['Prefer']=prefer
 r=urllib.request.Request(base+'/rest/v1/'+path,data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
 try:
  with urllib.request.urlopen(r,timeout=45) as z:
   b=z.read().decode(); return json.loads(b) if b else []
 except urllib.error.HTTPError as e: raise RuntimeError(f'{method} {schema}.{path}: {e.code} {e.read().decode()[:300]}')
def q(x): return urllib.parse.quote(str(x),safe='')
def all_products(shop):
 out={}
 for x in EH[shop].get('products') or []: out[str(x.get('product_id'))]=x
 return out
def hot_products(shop):
 return {str(x.get('product_id')):x for x in (EH[shop].get('hot') or [])}
def estimate(shop,lid):
 hot=hot_products(shop).get(lid)
 if hot and hot.get('sales_month') is not None:
  return float(hot['sales_month']),'ehunt_product_sales_month',float(hot['sales_month']),hot.get('release_time')
 p=all_products(shop).get(lid) or {}
 total=float(p.get('sales') or 0); rel=p.get('release_time')
 if rel:
  y,m,d=map(int,rel.split('-')); months=max((TODAY-date(y,m,d)).days/30.4375,1.0); return round(total/months,1),'derived_total_sales_over_listing_age',total,rel
 return None,'unknown',total,rel

workspace=req('workspace_core','workspaces?select=id&slug=eq.hermes-workspace&limit=1')[0]['id']
room=req('workspace_core',f'rooms?select=id&workspace_id=eq.{workspace}&slug=eq.goblin-analytics&limit=1'); room=room[0]['id'] if room else None
out=[]; shops={}
for shop in ['RazzleLume','YiceraCeramics','SherysCeramicsStudio']:
 exact_count=baseline=wow=0
 for lid,p in BY_LID.items():
  if p['shop']!=shop: continue
  monthly,method,total,release=estimate(shop,lid); monthly_int=int(round(monthly)) if monthly is not None else None; exact=bool(p['source_exact']); exact_count+=int(exact)
  demand='wow' if monthly is not None and monthly>=30 else ('baseline' if monthly is not None and monthly>=20 else 'weak')
  green=exact and p['gross_margin_usd'] is not None and p['gross_margin_usd']>=10 and p['etsy_usd']>=30 and demand in {'baseline','wow'}
  baseline+=int(green); wow+=int(green and demand=='wow')
  verdict='GREEN_BASELINE_DEMAND_NOT_WOW' if green and demand=='baseline' else ('GREEN_WOW_DEMAND' if green else ('YELLOW_EXACT_SOURCE_WEAK_PRODUCT_DEMAND' if exact else 'YELLOW_NO_EXACT_SOURCE'))
  visual='incognito20260712:'+lid; rows=req('goblin_analytics',f'product_clusters?select=id,metadata&visual_fingerprint=eq.{q(visual)}&limit=1'); cid=rows[0]['id']; meta=rows[0].get('metadata') or {}
  meta.update({'product_monthly_sales_estimate':monthly,'product_demand_method':method,'product_total_sales_observed':total,'product_release_date':release,'product_demand_status':demand,'demand_gate_min_monthly':20,'wow_gate_min_monthly':30,'demand_correction_at':NOW,'shop_monthly_sales_not_product_sales':True,'verdict':verdict})
  note=(f'Product-demand correction: {monthly} estimated monthly sales ({method}); observed total {total}, release {release}. '
        f'Exact source={exact}; delivered gross spread=${p["gross_margin_usd"]}. '
        +('Baseline GREEN, but not WOW (below 30/month).' if green and demand=='baseline' else ('WOW demand gate passed.' if green else 'YELLOW: product-level demand gate failed or source proof missing.')))
  req('goblin_analytics',f'product_clusters?id=eq.{cid}','PATCH',{'status':'green' if green else 'candidate','monthly_sales_estimate':monthly_int,'price_gate_status':'green' if green else 'yellow','margin_status':'green_delivered_spread' if green else 'hold','decision_notes':note,'metadata':meta,'last_seen_at':NOW},prefer='return=minimal')
  out.append({'shop':shop,'listing_id':lid,'monthly_sales_estimate':monthly,'method':method,'total_sales':total,'release_date':release,'demand_status':demand,'status':'green' if green else 'yellow','verdict':verdict,'source_exact':exact,'gross_margin_usd':p['gross_margin_usd']})
 shops[shop]={'source_exact_products':exact_count,'baseline_green_products':baseline,'wow_products':wow,'status':'successful_goblin' if baseline>=2 else 'source_confirmed_watch_only'}
 srow=req('goblin_analytics',f'shops?select=metadata&etsy_shop_id=eq.{q(shop)}&limit=1'); sm=(srow[0].get('metadata') if srow else {}) or {}; sm.update({'demand_correction_at':NOW,**shops[shop]})
 req('goblin_analytics',f'shops?etsy_shop_id=eq.{q(shop)}','PATCH',{'goblin_level':'confirmed_goblin' if baseline>=2 else 'source_confirmed_watch','notes':f'Source proof exists for {exact_count}/5 products, but only {baseline}/5 pass product-level demand+margin gates and {wow}/5 pass WOW >=30/month. Not a successful product-opportunity Goblin unless >=2 baseline products.','metadata':sm,'last_seen_at':NOW},prefer='return=minimal')
req('goblin_analytics','events','POST',[{'workspace_id':workspace,'room_id':room,'event_type':'product_demand_gate_correction','severity':'warning','message':'Corrected shop-level monthly sales mistakenly shown as product-level demand; downgraded weak-demand products and shops.','source':'hermes_demand_gate_correction','metadata':{'shops':shops,'green':sum(x['status']=='green' for x in out),'yellow':sum(x['status']=='yellow' for x in out)}}],prefer='return=minimal')
report={'corrected_at':NOW,'shops':shops,'products':out}; path=ROOT/'status/goblin-ceramic-demand-corrected-20260712.json'; path.write_text(json.dumps(report,ensure_ascii=False,indent=2)); print(json.dumps({'ok':True,'shops':shops,'green':sum(x['status']=='green' for x in out),'yellow':sum(x['status']=='yellow' for x in out),'report':str(path)},ensure_ascii=False))
