import os,re,json
root='.openclaw/workspace/hermes-workspace/clawsuite'
ignore={'node_modules','.git'}
patterns=[re.compile(p,re.I) for p in [r'openclaw',r'clawsuite',r'\bclaw\b']]
res=[]
for dp, dns, fns in os.walk(root):
    dns[:] = [d for d in dns if d not in ignore]
    for fn in fns:
        path=os.path.join(dp,fn)
        rel=os.path.relpath(path, root)
        ext=os.path.splitext(fn)[1].lower()
        if any(p.search(rel) for p in patterns):
            res.append({'type':'filename','path':rel})
        text=None
        if ext not in {'.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.ttf','.eot','.mp4','.mov','.pdf','.zip','.gz','.tar','.db','.sqlite','.lockb','.icns','.exe','.dll','.so','.dylib'}:
            try:
                with open(path,'r',encoding='utf-8',errors='ignore') as f:
                    text=f.read().splitlines()
            except Exception:
                pass
        if text is not None:
            for i,line in enumerate(text,1):
                if any(p.search(line) for p in patterns):
                    res.append({'type':'content','path':rel,'line':i,'text':line[:300]})
print(json.dumps(res[:1000],indent=2))
print('TOTAL',len(res))
