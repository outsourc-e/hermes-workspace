from helpers import *
t=[t for t in list_tabs() if 'chatgpt.com' in t.get('url','')][0]
switch_tab(t['targetId']); wait_for_load(5)
print(js('''return (()=>{
 const stop=!!document.querySelector('button[aria-label*="Stop"],button[data-testid*="stop"]');
 const txt=(document.body.innerText||'').slice(-1200);
 const imgs=Array.from(document.images).slice(-8).map(i=>({src:i.src.slice(0,120),alt:i.alt,w:i.naturalWidth,h:i.naturalHeight}));
 return {stop, title:document.title, imgs, txt};
})()'''))
