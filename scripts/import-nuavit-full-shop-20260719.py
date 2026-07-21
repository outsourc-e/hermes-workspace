#!/usr/bin/env /usr/bin/python3
from __future__ import annotations
import json, os, re, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path('/Users/mac/hermes-workspace')
WB=Path('/Users/mac/.hermes/workbench/nuavit-full-audit-20260719')
DATA_FILE=WB/'nuavit-final-dataset.json'
BATCH='nuavit_full_shop_20260719'
NOW=datetime.now(timezone.utc).isoformat()

def load_env():
    env={}
    for line in (ROOT/'.env').read_text().splitlines():
        line=line.strip()
        if line and not line.startswith('#') and '=' in line:
            k,v=line.split('=',1);env[k.strip()]=v.strip().strip('"').strip("'")
    return env

env=load_env();BASE=(env.get('GOBLIN_SUPABASE_URL') or env.get('SUPABASE_URL') or '').rstrip('/');KEY=env.get('GOBLIN_SUPABASE_SERVICE_ROLE_KEY') or env.get('GOBLIN_SUPABASE_SECRET_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY')
if not BASE or not KEY: raise SystemExit('Missing Supabase URL/service key in local .env; secrets not printed.')

def req(schema,path,method='GET',body=None,prefer=None):
    raw_body=json.dumps(body).encode() if body is not None else None
    headers={'apikey':str(KEY),'Authorization':'Bearer '+str(KEY),'Accept':'application/json','Accept-Profile':schema,'Content-Profile':schema,'Content-Type':'application/json'}
    if prefer: headers['Prefer']=prefer
    r=urllib.request.Request(BASE+'/rest/v1/'+path,data=raw_body,headers=headers,method=method)
    try:
        with urllib.request.urlopen(r,timeout=45) as res:
            raw=res.read().decode();return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        raw=e.read().decode(errors='ignore');raw=re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[SUPABASE_KEY_REDACTED]',raw)
        raise RuntimeError(f'{method} {schema}.{path} failed HTTP {e.code}: {raw[:500]}')

def q(v): return urllib.parse.quote(str(v),safe='')
def get_ws_room():
    w=req('workspace_core','workspaces?select=id,slug&slug=eq.hermes-workspace&limit=1')[0]
    rs=req('workspace_core',f'rooms?select=id,slug&workspace_id=eq.{w["id"]}&slug=eq.goblin-analytics&limit=1')
    return w['id'],(rs[0]['id'] if rs else None)

data=json.loads(DATA_FILE.read_text());rows=data['rows'];ali_by={str(x.get('listing_id')):x for x in data.get('ali_raw',[])};qa_by={str(x.get('listing_id')):x for x in data.get('human_visual_qa',{}).get('rows',[])}
workspace_id,room_id=get_ws_room()
for schema,table in [('goblin_analytics','caveats'),('goblin_analytics','events'),('goblin_analytics','price_margin_snapshots'),('workspace_core','evidence_assets')]:
    try:req(schema,f'{table}?metadata->>research_batch=eq.{q(BATCH)}','DELETE')
    except Exception:pass

existing_run=req('goblin_analytics',f'search_runs?select=id&mode=eq.{q(BATCH)}&limit=1')
run_payload={'workspace_id':workspace_id,'room_id':room_id,'query':'Nuavit full active catalog: Etsy inventory, EHunt evidence ranking, AliExpress native image search, Alibaba fallback only on no result','marketplace':'etsy','mode':BATCH,'status':'completed','cards_scanned':100,'cards_opened':len(data.get('ali_raw',[])),'clusters_found':100,'notes':'Read-only full-shop analysis. Official Etsy shop sales separated from EHunt estimated listing sales. AliExpress native image search returned candidates for ranks 1-98, then a punish/bot-block appeared at rank 99; sourcing stopped immediately and rank 100 remained unsearched. Alibaba was not opened after the block. No supplier identity or delivered-cost claim. No publish/purchase/message action.','raw_context':{'research_batch':BATCH,'shop':'Nuavit','official_shop_sales':data['metrics']['official_shop_sales'],'official_reviews':data['metrics']['official_shop_reviews'],'active_listings':100,'ehunt_active_coverage':data['metrics']['ehunt_active_coverage'],'ehunt_positive_products':data['metrics']['ehunt_positive_sales_products'],'aliexpress_searched':data['metrics']['aliexpress_searched'],'visual_qa_complete':data['metrics']['visual_qa_complete'],'report_url':'/reports/nuavit-20260719/index.html','excel':'/reports/nuavit-20260719/Nuavit_Full_Analysis_2026-07-19.xlsx','generated_at':NOW},'started_at':NOW,'completed_at':NOW}
if existing_run:
    search_run_id=existing_run[0]['id'];req('goblin_analytics',f'search_runs?id=eq.{search_run_id}','PATCH',run_payload,prefer='return=minimal')
else:
    search_run_id=req('goblin_analytics','search_runs','POST',[run_payload],prefer='return=representation')[0]['id']
shop_payload={'workspace_id':workspace_id,'shop_name':'Nuavit','shop_url':'https://www.etsy.com/shop/Nuavit','etsy_shop_id':'Nuavit','country':data['shop'].get('country'),'active_listing_count':100,'sales_count':data['metrics']['official_shop_sales'],'review_count':data['metrics']['official_shop_reviews'],'goblin_level':'evidence_ranked_full_shop','candidate_dropship_product_count':data['metrics']['ehunt_positive_sales_products'],'notes':'Full 100-listing read-only audit. Shop-level Etsy facts; per-listing demand is EHunt estimated. Top 10 positive-demand products received strict AliExpress side-by-side QA.','metadata':{'research_batch':BATCH,'created_at_ehunt':data['shop'].get('created_at'),'shop_age':data['shop'].get('shop_age'),'ehunt_active_coverage':data['metrics']['ehunt_active_coverage'],'ehunt_sales_sum':data['metrics']['ehunt_sales_sum'],'top2_share_pct':data['metrics']['top2_sales_share_pct'],'top5_share_pct':data['metrics']['top5_sales_share_pct'],'report_url':'/reports/nuavit-20260719/index.html'},'last_seen_at':NOW}
shoprow=req('goblin_analytics','shops?on_conflict=etsy_shop_id','POST',[shop_payload],prefer='resolution=merge-duplicates,return=representation')[0]
summary={'ok':True,'batch':BATCH,'search_run_id':search_run_id,'shop_id':shoprow['id'],'products':[]}
for r in rows:
    lid=str(r['listing_id']);sales=r.get('ehunt_estimated_sales');qa=qa_by.get(lid);a=ali_by.get(lid,{});cards=(a.get('cards') or [])[:3]
    if sales is None: status='needs_data';demand='EHUNT_UNCOVERED'
    elif sales>0: status='candidate';demand='POSITIVE_EHUNT_ESTIMATE'
    else: status='watch_only';demand='ZERO_EHUNT_ESTIMATE'
    source_status='visual_near_exact_high' if qa else ('supplier_candidates_found' if cards else str(a.get('status') or 'not_searched').lower())
    selected_rank=qa.get('selected_candidate_rank') if qa else None
    selected=next((c for i,c in enumerate(a.get('cards') or [],1) if i==selected_rank),cards[0] if cards else {})
    metadata={'research_batch':BATCH,'rank':r['rank'],'etsy_url':r['etsy_url'],'etsy_shop_name':'Nuavit','etsy_listing_id':lid,'etsy_price_usd':r.get('etsy_price_usd'),'ehunt_estimated_sales_total':sales,'ehunt_favorites':r.get('favorites'),'ehunt_release_date':r.get('release_date'),'ehunt_coverage':r.get('ehunt_coverage'),'demand_evidence':demand,'source_search_status':r.get('source_search_status'),'source_platform':r.get('source_platform'),'source_url':r.get('source_url'),'supplier_url':r.get('source_url'),'source_price_ils_visible':r.get('source_price_ils'),'supplier_price_ils':r.get('source_price_ils'),'source_orders_visible':r.get('source_orders_visible'),'supplier_sold_signal':str(r.get('source_orders_visible')) if r.get('source_orders_visible') is not None else None,'source_confidence':r.get('source_confidence'),'visual_qa_notes':r.get('visual_qa_notes'),'aliexpress_search_url':a.get('url'),'ali_top3_candidates':cards,'report_url':'/reports/nuavit-20260719/index.html','excel_url':'/reports/nuavit-20260719/Nuavit_Full_Analysis_2026-07-19.xlsx'}
    notes=f"Rank #{r['rank']}. EHunt estimated sales={sales if sales is not None else 'uncovered'}; favorites={r.get('favorites')}. Source={source_status}. Etsy official per-listing sales unavailable. No delivered-cost or supplier-identity claim."
    body={'workspace_id':workspace_id,'room_id':room_id,'canonical_name':r['title'][:180],'product_family':r.get('category') or 'footwear','style_tags':['nuavit','footwear','full_shop_audit',status],'visual_fingerprint':'nuavit20260719:'+lid,'product_function':'footwear or wearable accessory from Nuavit Etsy catalog','material_claim':'unknown; Etsy title/imagery only','canonical_image_url':r.get('etsy_image_url'),'status':status,'price_gate_status':'green' if (r.get('etsy_price_usd') or 0)>=40 else ('yellow' if (r.get('etsy_price_usd') or 0)>=25 else 'red'),'min_price_usd':r.get('etsy_price_usd'),'max_price_usd':r.get('etsy_price_usd'),'avg_price_usd':r.get('etsy_price_usd'),'monthly_sales_estimate':None,'source_status':source_status,'goblin_signal_status':demand.lower(),'saturation_risk':'unknown','copyability_score':None,'margin_status':'needs_shipping_fx_and_fees','decision_notes':notes,'metadata':metadata,'last_seen_at':NOW}
    ex=req('goblin_analytics',f'product_clusters?select=id&visual_fingerprint=eq.{q("nuavit20260719:"+lid)}&limit=1')
    if ex:cid=ex[0]['id'];req('goblin_analytics',f'product_clusters?id=eq.{cid}','PATCH',body,prefer='return=minimal')
    else:cid=req('goblin_analytics','product_clusters','POST',[body],prefer='return=representation')[0]['id']
    listing=req('goblin_analytics','cluster_listings?on_conflict=cluster_id,listing_url','POST',[{'cluster_id':cid,'shop_record_id':shoprow['id'],'listing_id':lid,'listing_url':r['etsy_url'],'shop_id':'Nuavit','title':r['title'],'price_usd':r.get('etsy_price_usd'),'image_url':r.get('etsy_image_url'),'match_status':'primary_competitor_listing','match_reason':notes,'alura_sales_estimate':None,'review_count':None,'metadata':metadata,'last_seen_at':NOW}],prefer='resolution=merge-duplicates,return=representation')[0]
    for rank,c in enumerate(cards,1):
        is_selected=rank==selected_rank
        req('goblin_analytics','supplier_matches?on_conflict=cluster_id,source_url','POST',[{'cluster_id':cid,'listing_id':listing['id'],'source_platform':'aliexpress','source_url':c.get('url'),'source_item_id':c.get('item_id'),'match_status':'visual_near_exact_high' if is_selected else f'candidate_rank_{rank}','coverage_status':'top3_native_image_search','supplier_price_estimate_usd':None,'orders':None,'variant_coverage':{'rank':rank,'visible_text':c.get('text'),'title':c.get('title'),'image_url':c.get('image')},'image_match_notes':(qa or {}).get('notes') if is_selected else 'AliExpress native image-search candidate; not visually approved.','qa_status':'visual_near_exact_high' if is_selected else ('not_prioritized_zero_demand' if sales==0 else 'needs_human_micro_detail_qa'),'metadata':metadata}],prefer='resolution=merge-duplicates,return=minimal')
    for asset_type,path_or_url,asset_notes in [('etsy_image',r.get('etsy_image_url'),'Current Etsy listing image'),('etsy_local_image',r.get('etsy_image_path'),'Local downloaded Etsy evidence image'),('visual_contact_sheet',str(WB/'evidence'/'aliexpress'/f"rank-{r['rank']:03d}-{lid}.jpg") if qa else None,'Top-five AliExpress side-by-side visual QA evidence'),('website_report','/reports/nuavit-20260719/index.html','Static 100-row Nuavit report')]:
        if path_or_url:req('workspace_core','evidence_assets','POST',[{'workspace_id':workspace_id,'room_id':room_id,'entity_schema':'goblin_analytics','entity_table':'product_clusters','entity_id':cid,'asset_type':asset_type,'storage_provider':'local_file' if str(path_or_url).startswith('/Users/') else 'external_url','path_or_url':path_or_url,'notes':asset_notes,'metadata':metadata}],prefer='return=minimal')
    req('goblin_analytics','caveats','POST',[{'cluster_id':cid,'shop_id':shoprow['id'],'type':'evidence_boundary','severity':'medium','is_kill_switch':False,'message':'Per-listing sales are EHunt estimates, not official Etsy data. Supplier candidates do not prove identity, quality or delivered margin. Human micro-detail QA is required before GREEN/purchase.','metadata':metadata}],prefer='return=minimal')
    req('goblin_analytics','price_margin_snapshots','POST',[{'cluster_id':cid,'competitor_price_usd':r.get('etsy_price_usd'),'supplier_estimate_usd':None,'target_price_usd':r.get('etsy_price_usd'),'margin_estimate_usd':None,'margin_percent_estimate':None,'price_gate_status':body['price_gate_status'],'margin_gate_status':'needs_shipping_fx_and_fees','notes':'AliExpress visible price may be ILS and variant-dependent; no live FX or delivered-cost conversion claimed.','metadata':metadata}],prefer='return=minimal')
    summary['products'].append({'listing_id':lid,'cluster_id':cid,'rank':r['rank'],'sales':sales,'source_status':source_status})
req('goblin_analytics','events','POST',[{'workspace_id':workspace_id,'room_id':room_id,'event_type':'nuavit_full_shop_research_imported','severity':'info','message':'Imported Nuavit 100-listing evidence-ranked audit, AliExpress candidate evidence, Excel and static report.','source':'hermes_nuavit_research','metadata':{'research_batch':BATCH,'search_run_id':search_run_id,'product_count':100,'report_url':'/reports/nuavit-20260719/index.html'}}],prefer='return=minimal')
readback=req('goblin_analytics',f'product_clusters?select=id,visual_fingerprint,status,source_status&visual_fingerprint=like.{q("nuavit20260719:*")}')
summary['readback']={'clusters':len(readback),'positive_demand':sum(x['status']=='candidate' for x in readback),'watch_only':sum(x['status']=='watch_only' for x in readback),'needs_data':sum(x['status']=='needs_data' for x in readback),'visual_near_exact_high':sum(x['source_status']=='visual_near_exact_high' for x in readback)}
out=ROOT/'status'/'nuavit-full-shop-20260719.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({'ok':True,'batch':BATCH,'search_run_id':search_run_id,'products':len(summary['products']),'readback':summary['readback'],'status_file':str(out)},ensure_ascii=False))
