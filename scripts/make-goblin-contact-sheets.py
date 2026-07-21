#!/usr/bin/env python3
import json, urllib.request, io, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

cards = json.load(open('/tmp/hermes_etsy_ceramic_research_cards.json'))
sup = json.load(open('/Users/mac/hermes-workspace/status/goblin-ceramic-supplier-search-20260703.json'))
seed_ids = ['4368029072','1497153250','4517113800']
seed_by_id = {c['listing_id']: c for c in cards if c.get('listing_id') in seed_ids}
# lamp selected exists in cards; ensure exact.
OUTDIR = Path('/Users/mac/hermes-workspace/status/goblin-contact-sheets-20260703')
OUTDIR.mkdir(parents=True, exist_ok=True)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 13)
except Exception:
    font = small = ImageFont.load_default()

def fetch_img(url):
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    data=urllib.request.urlopen(req, timeout=20).read()
    im=Image.open(io.BytesIO(data)).convert('RGB')
    im.thumbnail((220,220))
    canvas=Image.new('RGB',(220,220),'white')
    canvas.paste(im, ((220-im.width)//2,(220-im.height)//2))
    return canvas

def draw_cell(draw, x,y, label, text):
    draw.text((x+8,y+226), label, fill=(0,0,0), font=font)
    lines=[]
    for part in textwrap.wrap(text or '', width=28):
        lines.append(part)
        if len(lines)>=4: break
    yy=y+250
    for line in lines:
        draw.text((x+8,yy),line,fill=(40,40,40),font=small)
        yy+=16

made=[]
for item in sup['items']:
    lid=item['listing_id']; seed=seed_by_id[lid]
    candidates=[]
    for q in item['queries']:
        for c in q['result'].get('cards',[]):
            if c.get('images'):
                candidates.append(c)
        if len(candidates)>=6: break
    candidates=candidates[:6]
    rows=2; cols=4; cellw=260; cellh=330
    sheet=Image.new('RGB',(cols*cellw, rows*cellh),(246,244,236))
    d=ImageDraw.Draw(sheet)
    d.text((10,8), f"Etsy target vs supplier candidates — {lid}", fill=(0,0,0), font=font)
    try: img=fetch_img(seed['image_url'])
    except Exception as e:
        img=Image.new('RGB',(220,220),(230,230,230)); ImageDraw.Draw(img).text((10,100),str(e)[:60],fill=(0,0,0),font=small)
    sheet.paste(img,(20,42))
    draw_cell(d,20,42,'ETSY TARGET', seed['title'])
    for idx,c in enumerate(candidates):
        pos=idx+1
        x=(pos%cols)*cellw+20
        y=(pos//cols)*cellh+42
        try: im=fetch_img(c['images'][0]['src'])
        except Exception as e:
            im=Image.new('RGB',(220,220),(230,230,230)); ImageDraw.Draw(im).text((10,100),str(e)[:60],fill=(0,0,0),font=small)
        sheet.paste(im,(x,y))
        alt=c['images'][0].get('alt') or c.get('text') or ''
        draw_cell(d,x,y,f'SUPPLIER {idx+1}', alt)
    out=OUTDIR/f'{lid}_contact_sheet.jpg'
    sheet.save(out, quality=92)
    made.append(str(out))
print('\n'.join(made))
