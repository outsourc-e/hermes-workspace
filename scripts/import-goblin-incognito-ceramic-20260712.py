#!/usr/bin/env /usr/bin/python3
from __future__ import annotations
import json, os, re, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path('/Users/mac/hermes-workspace')
WB=Path('/Users/mac/.hermes/workbench/goblin-ceramic-20260712')
BATCH='goblin_ceramic_incognito_20260712_final'
NOW=datetime.now(timezone.utc).isoformat()
EH=json.load(open(WB/'ehunt-stores-combined.json'))
SEARCH=json.load(open(WB/'aliexpress-text-search-final.json'))
PROOF={x['listing_id']:x for x in json.load(open(WB/'aliexpress-first-candidate-page-proof.json'))}
MAN=json.load(open(WB/'contact-sheet-manifest.json'))
SELECT={
 'RazzleLume':['4521246878','4487339812','4500793333','4467601719','4490578458'],
 'YiceraCeramics':['4395028001','1599752212','1356805032','1775156258','1892879875'],
 'SherysCeramicsStudio':['4501531780','4428570925','4439532940','4450811161','4431029159'],
}
def load_env():
 env={}
 for line in (ROOT/'.env').read_text().splitlines():
  line=line.strip()
  if line and not line.startswith('#') and '=' in line:
   k,v=line.split('=',1); env[k.strip()]=v.strip().strip('"').strip("'")
 return env
env=load_env(); BASE=(env.get('GOBLIN_SUPABASE_URL') or env.get('SUPABASE_URL') or '').rstrip('/'); KEY=env.get('GOBLIN_SUPABASE_SERVICE_ROLE_KEY') or env.get('GOBLIN_SUPABASE_SECRET_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY')
if not BASE or not KEY: raise SystemExit('Missing Supabase URL/service key in local .env; not printing secrets.')
KEY_STR=str(KEY)
def req(schema,path,method='GET',body=None,prefer=None):
 data=json.dumps(body).encode() if body is not None else None
 headers={'apikey':KEY_STR,'Authorization':'Bearer '+KEY_STR,'Accept':'application/json','Accept-Profile':schema,'Content-Profile':schema,'Content-Type':'application/json'}
 if prefer: headers['Prefer']=prefer
 r=urllib.request.Request(BASE+'/rest/v1/'+path,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(r,timeout=30) as res:
   raw=res.read().decode(); return json.loads(raw) if raw else []
 except urllib.error.HTTPError as e:
  raw=e.read().decode(errors='ignore')
  raw=re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[SUPABASE_KEY_REDACTED]',raw)
  raise RuntimeError(f'{method} {schema}.{path} failed HTTP {e.code}: {raw[:500]}')
def q(v): return urllib.parse.quote(str(v),safe='')
def get_ws_room():
 w=req('workspace_core','workspaces?select=id,slug&slug=eq.hermes-workspace&limit=1')[0]
 r=req('workspace_core',f'rooms?select=id,slug&workspace_id=eq.{w["id"]}&slug=eq.goblin-analytics&limit=1')
 return w['id'], (r[0]['id'] if r else None)
def product_map(shop):
 d={}
 for x in (EH[shop].get('hot') or [])+(EH[shop].get('products') or []): d.setdefault(str(x.get('product_id')),x)
 return d
workspace_id,room_id=get_ws_room()
for schema, table in [('goblin_analytics','caveats'),('goblin_analytics','events'),('goblin_analytics','price_margin_snapshots'),('workspace_core','evidence_assets')]:
 try:
  req(schema, f'{table}?metadata->>research_batch=eq.{q(BATCH)}', 'DELETE')
 except Exception:
  pass
search_run=req('goblin_analytics','search_runs','POST',[{'workspace_id':workspace_id,'room_id':room_id,'query':'incognito fresh-cookie Etsy ceramic goblin shops; ship-from-China emphasis','marketplace':'etsy','mode':BATCH,'status':'completed','cards_scanned':15,'cards_opened':45,'clusters_found':15,'notes':'Fresh-cookie/incognito Etsy discovery, EHunt store metrics, AliExpress text and native image search. Read-only; no Etsy/supplier writes. GREEN still requires human micro-detail QA for exact image/source proof.','raw_context':{'research_batch':BATCH,'selected_shops':list(SELECT),'incognito':True,'etsy_hunt':'EHunt store detail via Chrome','aliexpress':'text search all 15 + native image proof subset + first-candidate page price readback','generated_at':NOW},'started_at':NOW,'completed_at':NOW}],prefer='return=representation')[0]
summary={'batch':BATCH,'search_run_id':search_run['id'],'shops':{},'products':[]}
for shop,ids in SELECT.items():
 b=EH[shop]['basic']; gob='strong_china_shop' if b.get('country')=='China' else 'ships_from_china_candidate'
 shoprow=req('goblin_analytics','shops?on_conflict=etsy_shop_id','POST',[{'workspace_id':workspace_id,'shop_name':shop,'shop_url':f'https://www.etsy.com/shop/{shop}','etsy_shop_id':shop,'country':b.get('country'),'active_listing_count':b.get('product_count'),'sales_count':b.get('sales'),'review_count':b.get('reviews'),'goblin_level':gob,'candidate_dropship_product_count':len(ids),'notes':f'Incognito-discovered ceramic goblin candidate. EHunt sales_month={b.get("sales_month")}, sales_7days={b.get("sales_7days")}; China-shipping signal captured on Etsy listing pages for selected leads.','metadata':{'research_batch':BATCH,'created_at_ehunt':b.get('created_at'),'sales_month':b.get('sales_month'),'sales_7days':b.get('sales_7days'),'revenue_total':b.get('revenue_total'),'revenue_7days':b.get('revenue_7days'),'rating':b.get('rating'),'ship_from_china_priority':True},'last_seen_at':NOW}],prefer='resolution=merge-duplicates,return=representation')[0]
 summary['shops'][shop]=shoprow['id']
 pm=product_map(shop)
 for lid in ids:
  e=pm[lid]; proof=PROOF.get(lid,{})
  srow=next((x for x in SEARCH if x['shop']==shop and x['listing_id']==lid),{})
  cards=(srow.get('cards') or [])[:5]
  etsy_price=float(e.get('price') or 0); ali_ils=proof.get('price_ils'); ali_usd=round(ali_ils/3.65,2) if isinstance(ali_ils,(int,float)) else None
  margin=round(etsy_price-ali_usd,2) if ali_usd is not None else None
  margin_pct=round((margin/etsy_price)*100,1) if margin is not None and etsy_price else None
  status='candidate'; verdict='YELLOW_SOURCE_PROOF'
  notes=f'EHunt top product from {shop}. Etsy ${etsy_price}; first Ali page price ₪{ali_ils}; gross spread ${margin} ({margin_pct}%) before shipping/fees. Source proof is candidate/near-family until human micro-detail QA approves exactness.'
  metadata={'research_batch':BATCH,'etsy_url':f'https://www.etsy.com/listing/{lid}','etsy_shop_name':shop,'etsy_listing_id':lid,'etsy_price_usd':etsy_price,'ships_from_china_signal':True,'alura_real_data_available':True,'alura_status_source':'EHunt/Alura-style store detail readback via Chrome','shop_sales_month':b.get('sales_month'),'shop_sales_7days':b.get('sales_7days'),'shop_total_sales':b.get('sales'),'supplier_url':proof.get('url') or (cards[0].get('url') if cards else None),'supplier_sold_signal':proof.get('sold_signal'),'supplier_price_ils':ali_ils,'supplier_price_usd_estimate':ali_usd,'gross_margin_usd_estimate':margin,'gross_margin_percent_estimate':margin_pct,'contact_sheet_path':str(WB/'evidence'/f'contact-{shop}.jpg'),'verdict':verdict,'ali_top5_candidates':cards,'native_image_search_url':next((x.get('url') for x in json.load(open(WB/'aliexpress-native-image-proof.json')) if x.get('listing_id')==lid),None)}
  existing=req('goblin_analytics',f'product_clusters?select=id&visual_fingerprint=eq.{q("incognito20260712:"+lid)}&limit=1')
  body={'workspace_id':workspace_id,'room_id':room_id,'canonical_name':e.get('title')[:180],'product_family':'ceramic_product','style_tags':['ceramic','goblin_candidate','ships_from_china'],'visual_fingerprint':'incognito20260712:'+lid,'product_function':'ceramic home/kitchen/decor product','material_claim':'ceramic visible Etsy/EHunt claim','canonical_image_url':e.get('logo_url'),'status':status,'price_gate_status':'green' if etsy_price>=30 else ('yellow' if etsy_price>=24 else 'red'),'min_price_usd':etsy_price,'max_price_usd':etsy_price,'avg_price_usd':etsy_price,'monthly_sales_estimate':b.get('sales_month'),'source_status':'supplier_candidates_found','goblin_signal_status':'ship_from_china_candidate','saturation_risk':'unknown','copyability_score':3,'margin_status':'candidate_positive' if margin and margin>10 else 'needs_review','decision_notes':notes,'metadata':metadata,'last_seen_at':NOW}
  if existing:
   cid=existing[0]['id']; req('goblin_analytics',f'product_clusters?id=eq.{cid}','PATCH',body,prefer='return=minimal')
  else:
   cid=req('goblin_analytics','product_clusters','POST',[body],prefer='return=representation')[0]['id']
  listing=req('goblin_analytics','cluster_listings?on_conflict=cluster_id,listing_url','POST',[{'cluster_id':cid,'shop_record_id':shoprow['id'],'listing_id':lid,'listing_url':f'https://www.etsy.com/listing/{lid}','shop_id':shop,'title':e.get('title'),'price_usd':etsy_price,'image_url':e.get('logo_url'),'match_status':'primary_competitor_listing','match_reason':notes,'alura_sales_estimate':b.get('sales_month'),'review_count':b.get('reviews'),'metadata':metadata,'last_seen_at':NOW}],prefer='resolution=merge-duplicates,return=representation')[0]
  for rank,c in enumerate(cards,1):
   sold_match=re.search(r'\d+',proof.get('sold_signal') or '')
   req('goblin_analytics','supplier_matches?on_conflict=cluster_id,source_url','POST',[{'cluster_id':cid,'listing_id':listing['id'],'source_platform':'aliexpress','source_url':c.get('url'),'source_item_id':c.get('item_id'),'match_status':'candidate_rank_%d'%rank,'coverage_status':'candidate_top5','supplier_price_estimate_usd':ali_usd if rank==1 else None,'orders':int(sold_match.group()) if rank==1 and sold_match else None,'variant_coverage':{'rank':rank,'source_price_ils':ali_ils if rank==1 else None,'title':c.get('title'),'image_url':c.get('image')},'image_match_notes':'AliExpress candidate from text/image search; requires human micro-detail QA, not exact proof yet.','qa_status':'needs_human_micro_detail_qa','metadata':metadata}],prefer='resolution=merge-duplicates,return=minimal')
  for asset_type,path_or_url,notes2 in [('etsy_image',e.get('logo_url'),'Competitor Etsy/EHunt image'),('contact_sheet',str(WB/'evidence'/f'contact-{shop}.jpg'),'Local contact sheet Etsy target + five Ali candidates'),('ali_first_candidate',proof.get('url') or (cards[0].get('url') if cards else None),'AliExpress first candidate page readback')]:
   if path_or_url: req('workspace_core','evidence_assets','POST',[{'workspace_id':workspace_id,'room_id':room_id,'entity_schema':'goblin_analytics','entity_table':'product_clusters','entity_id':cid,'asset_type':asset_type,'storage_provider':'local_file' if str(path_or_url).startswith('/') else 'external_url','path_or_url':path_or_url,'notes':notes2,'metadata':metadata}],prefer='return=minimal')
  req('goblin_analytics','caveats','POST',[{'cluster_id':cid,'shop_id':shoprow['id'],'type':'human_micro_detail_qa_required','severity':'medium','is_kill_switch':False,'message':'Do not mark GREEN until DLV/human confirms exact/near-exact product identity vs AliExpress. Current state is sourced candidate with margin signal, not final product proof.','metadata':metadata}],prefer='return=minimal')
  req('goblin_analytics','price_margin_snapshots','POST',[{'cluster_id':cid,'competitor_price_usd':etsy_price,'supplier_estimate_usd':ali_usd,'target_price_usd':etsy_price,'margin_estimate_usd':margin,'margin_percent_estimate':margin_pct,'price_gate_status':body['price_gate_status'],'margin_gate_status':'candidate_positive' if margin and margin>10 else 'needs_review','notes':'First Ali candidate price readback; shipping/fees not included.','metadata':metadata}],prefer='return=minimal')
  summary['products'].append({'shop':shop,'listing_id':lid,'cluster_id':cid,'etsy_price_usd':etsy_price,'ali_price_ils':ali_ils,'ali_price_usd_est':ali_usd,'gross_margin_usd_est':margin,'margin_pct':margin_pct})
req('goblin_analytics','events','POST',[{'workspace_id':workspace_id,'room_id':room_id,'event_type':'incognito_ceramic_goblin_research_imported','severity':'info','message':'Imported 3 ceramic goblin shops, 15 Etsy products, AliExpress top-5 candidate evidence, contact sheets, and first-candidate margin readbacks.','source':'hermes_incognito_research','metadata':{'research_batch':BATCH,'search_run_id':search_run['id'],'shops':list(SELECT),'product_count':15}}],prefer='return=minimal')
OUT=ROOT/'status'/'goblin-incognito-ceramic-final-20260712.json'; OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({'ok':True,'batch':BATCH,'search_run_id':search_run['id'],'products':len(summary['products']),'out':str(OUT)},ensure_ascii=False))
