import fs from 'node:fs/promises'
import path from 'node:path'
import WebSocket from 'ws'

const ROOT = '/Users/mac/hermes-workspace'
const OUT = path.join(ROOT, 'generated-candidates/war-room/2026-06-18-etsy-ops-v4-from-scratch')
const LOG = path.join(OUT, 'run.log')

const style = `
Create brand-new original art from scratch. Do not reuse, remix, or copy any existing Hermes War Room assets.
Premium 2D pixel art, direct top-down RPG room kit, ancient Mediterranean mythology and military history theme.
Warm stone, bronze, gold, teal crystal accents, dark clean transparent-friendly background.
Chunky readable pixel clusters, crisp silhouette, cute but professional characters, no modern office UI, no sci-fi dashboard.
No text, no letters, no numbers, no labels, no watermarks baked into the image.
`

const spriteRules = `
The sprite sheet must be a clean 12 row x 8 column grid: exactly 96 frames.
Each frame should show the same character, same scale, centered, full body, clean transparent-friendly background.
Rows:
1 idle, 2 walk south, 3 walk north, 4 walk east, 5 walk west, 6 walk south-east,
7 walk south-west, 8 walk north-east, 9 walk north-west, 10 work at station,
11 talk/gesture, 12 carry packet / waiting approval.
Eight frames per row, frame-to-frame motion should be subtle and consistent like a real game animation.
No labels, no row names, no frame numbers.
`

const prompts = [
  [
    '01_room_base_top_down',
    `Use the image generation tool now. Generate one PNG image, not a text answer.

${style}

Create only the Etsy Ops room base, direct overhead/top-down, clean and usable as a game background.
Rectangular mythic operations room, thick decorated stone walls, tiled floor, ornate bronze trim, four gates/doors,
clean walkable center, subtle blue-bronze path inlays, small torches/crystals built into walls.
No workers, no UI, no text, no labels, no station props blocking the walking floor.
The camera is directly above the room, not isometric. The room should feel like a professional pixel-art game map.`,
  ],
  [
    '02_station_props_3x3',
    `Use the image generation tool now. Generate one PNG image, not a text answer.

${style}

Create a transparent-friendly 3x3 station prop sheet for Etsy Ops.
Nine separated props, each centered in its own grid cell with empty padding:
1 product intake scroll desk,
2 SEO oracle crystal shrine,
3 supplier proof evidence table,
4 media source shelf with empty picture frames,
5 ShotLab forge/anvil with small ember,
6 listing draft scribe desk,
7 price/margin scale table,
8 DLV approval gate seal podium,
9 archive vault shelves.
Each station must look unique, handcrafted, top-down/three-quarter top-down pixel art, no UI rectangles, no text labels.`,
  ],
  [
    '03_athena_96f_sprite_sheet',
    `Use the image generation tool now. Generate one PNG image, not a text answer.

${style}
${spriteRules}

Character: Athena market strategist / SEO oracle.
Cute heroic strategist in white, gold, and teal armor, Greek helmet, small owl/teal crystal motif, tablet or crystal lens.
Personality in art: calm, intelligent, protective, evidence-first.
Animations should include reading signals, pointing at a tiny strategy tablet, carrying a sealed product packet.`,
  ],
  [
    '04_hephaestus_davinci_96f_sprite_sheet',
    `Use the image generation tool now. Generate one PNG image, not a text answer.

${style}
${spriteRules}

Character: Hephaestus / Leonardo da Vinci hybrid media artificer.
Cute sturdy forge engineer with bronze apron, goggles, hammer, sketch scroll, small teal/orange forge glow.
Personality in art: inventive, warm, craft-focused, slightly messy genius.
Animations should include hammering, sketching a brief, inspecting an image packet, carrying a small glowing crate.`,
  ],
  [
    '05_caesar_hermes_96f_sprite_sheet',
    `Use the image generation tool now. Generate one PNG image, not a text answer.

${style}
${spriteRules}

Character: Julius Caesar / Hermes hybrid approval commander.
Cute decisive commander in red and gold cloak, laurel/winged helmet hybrid, scroll seal, small winged packet.
Personality in art: direct, charming, strict about approvals, fast messenger but never reckless.
Animations should include commanding, stamping approval seal, talking to operator, carrying sealed approval packet.`,
  ],
  [
    '06_icons_packets_alerts_doors',
    `Use the image generation tool now. Generate one PNG image, not a text answer.

${style}

Create only non-character pixel-art UI/effects objects. Absolutely no people, no faces, no bodies, no workers, no soldiers, no characters.
Transparent-friendly object sheet, separated assets with generous padding:
top row: winged packet 8-frame motion strip;
second row: scroll packet, sealed approval packet, product crate packet, archive packet;
third row: small alert exclamation icons with ember glow, teal chat bubble icons, safe lock icons;
fourth row: bronze door open/closed pieces, tiny sparkle/glow frames for active tools, approval seal pulse frames.
No text, no letters, no labels, no modern UI, no generic flat vector icons.`,
  ],
]

await fs.mkdir(OUT, { recursive: true })
await fs.writeFile(LOG, '')

function stamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

async function log(message) {
  const line = `[${stamp()}] ${message}`
  console.log(line)
  await fs.appendFile(LOG, `${line}\n`)
}

async function getTabs() {
  const response = await fetch('http://127.0.0.1:9222/json')
  if (!response.ok) throw new Error(`CDP tabs failed ${response.status}`)
  return response.json()
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.ws.on('message', (raw) => {
      const message = JSON.parse(String(raw))
      if (!message.id || !this.pending.has(message.id)) return
      const { resolve, reject } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(`${message.error.message ?? 'CDP error'} ${JSON.stringify(message.error)}`))
      else resolve(message.result ?? {})
    })
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })
  }

  call(method, params = {}) {
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 120_000)
    })
    this.ws.send(payload)
    return promise
  }

  async js(expression, awaitPromise = false) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    })
    return result?.result?.value
  }

  close() {
    this.ws.close()
  }
}

async function connect() {
  const tabs = await getTabs()
  const chatgptTabs = tabs.filter((tab) => String(tab.url ?? '').includes('chatgpt.com'))
  if (!chatgptTabs.length) throw new Error('NO_CHATGPT_TAB')
  chatgptTabs.sort((a, b) => {
    const aHome = a.url === 'https://chatgpt.com/' ? 0 : 1
    const bHome = b.url === 'https://chatgpt.com/' ? 0 : 1
    return aHome - bHome || String(a.title ?? '').localeCompare(String(b.title ?? ''))
  })
  const tab = chatgptTabs[0]
  await log(`USING_TAB ${tab.id} ${JSON.stringify(tab.title)} ${tab.url}`)
  const cdp = new Cdp(tab.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.call('Runtime.enable')
  await cdp.call('Page.enable')
  await cdp.call('DOM.enable')
  return cdp
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitReady(cdp, timeoutMs = 300_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const state = await cdp.js(`(() => {
      const composer = document.querySelector('div#prompt-textarea[contenteditable="true"], div[contenteditable="true"][role="textbox"], #prompt-textarea');
      const button = document.querySelector('#composer-submit-button')
        || Array.from(document.querySelectorAll('button')).find((node) => /send|stop|שלח|עצור/i.test(node.getAttribute('aria-label') || node.textContent || ''));
      const label = button?.getAttribute('aria-label') || button?.textContent || '';
      return { hasComposer: Boolean(composer), label, disabled: button?.disabled ?? null, tail: (document.body.innerText || '').slice(-260) };
    })()`)
    if (state?.hasComposer && !/stop answering|עצור/i.test(state.label ?? '')) return
    await log(`WAIT_READY ${Math.round((Date.now() - started) / 1000)} ${JSON.stringify(state)}`)
    await sleep(5_000)
  }
  throw new Error('NOT_READY')
}

async function images(cdp) {
  return await cdp.js(`(() => Array.from(document.images)
    .map((img, idx) => ({ idx, src: img.currentSrc || img.src || '', alt: img.alt || '', nw: img.naturalWidth || 0, nh: img.naturalHeight || 0 }))
    .filter((img) => img.src && (img.src.includes('backend-api/estuary/content') || img.src.includes('oaiusercontent') || img.nw >= 512 || img.nh >= 512)))()`) ?? []
}

async function insertPrompt(cdp, prompt) {
  await waitReady(cdp)
  const ok = await cdp.js(`(() => {
    const el = document.querySelector('div#prompt-textarea[contenteditable="true"], div[contenteditable="true"][role="textbox"], #prompt-textarea');
    if (!el) return false;
    el.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    return true;
  })()`)
  if (!ok) throw new Error('NO_COMPOSER')
  await cdp.call('Input.insertText', { text: prompt })
  await sleep(1000)
  const state = await cdp.js(`(() => {
    const el = document.querySelector('div#prompt-textarea[contenteditable="true"], #prompt-textarea');
    const button = document.querySelector('#composer-submit-button');
    return { len: (el?.innerText || el?.textContent || '').length, label: button?.getAttribute('aria-label') || button?.textContent || '', disabled: button?.disabled ?? null };
  })()`)
  await log(`COMPOSER ${JSON.stringify(state)}`)
}

async function send(cdp) {
  for (let index = 0; index < 90; index += 1) {
    const button = await cdp.js(`(() => {
      const b = document.querySelector('#composer-submit-button')
        || Array.from(document.querySelectorAll('button')).find((node) => /send|שלח/i.test(node.getAttribute('aria-label') || ''));
      if (!b) return null;
      const rect = b.getBoundingClientRect();
      return { label: b.getAttribute('aria-label') || b.textContent || '', disabled: b.disabled, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`)
    await log(`SEND_BTN ${index} ${JSON.stringify(button)}`)
    if (button && !button.disabled && !/stop answering|עצור/i.test(button.label ?? '')) {
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: button.x, y: button.y, button: 'left', clickCount: 1 })
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: button.x, y: button.y, button: 'left', clickCount: 1 })
      await sleep(3000)
      return
    }
    await sleep(2000)
  }
  throw new Error('SEND_TIMEOUT')
}

function pickNewImage(currentImages, seen) {
  const candidates = currentImages.filter((image) => {
    if (!image.src || seen.has(image.src)) return false
    if (String(image.alt ?? '').toLowerCase().includes('uploaded')) return false
    return true
  })
  candidates.sort((a, b) => (b.nw * b.nh - a.nw * a.nh) || (b.idx - a.idx))
  return candidates[0] ?? null
}

async function downloadImage(cdp, src, outPath) {
  const b64 = await cdp.js(`(async () => {
    const response = await fetch(${JSON.stringify(src)}, { credentials: 'include' });
    if (!response.ok) throw new Error('fetch ' + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  })()`, true)
  await fs.writeFile(outPath, Buffer.from(b64, 'base64'))
}

async function generate(cdp, name, prompt) {
  const outPath = path.join(OUT, `${name}.png`)
  try {
    const stat = await fs.stat(outPath)
    if (stat.size > 100_000) {
      await log(`SKIP ${name} existing`)
      return
    }
  } catch {}

  await fs.writeFile(path.join(OUT, `${name}.prompt.txt`), prompt)
  const before = await images(cdp)
  const seen = new Set(before.map((image) => image.src))
  await insertPrompt(cdp, prompt)
  await send(cdp)

  const started = Date.now()
  let found = null
  while (Date.now() - started < 900_000) {
    const current = await images(cdp)
    found = pickNewImage(current, seen)
    if (found) {
      await log(`FOUND ${name} ${JSON.stringify(found)}`)
      break
    }
    const elapsed = Math.round((Date.now() - started) / 1000)
    if (elapsed % 30 < 5) await log(`WAIT_IMAGE ${name} ${elapsed}s images=${current.length}`)
    await sleep(5000)
  }
  if (!found) throw new Error(`TIMEOUT ${name}`)

  await downloadImage(cdp, found.src, outPath)
  const stat = await fs.stat(outPath)
  await fs.writeFile(path.join(OUT, `${name}.json`), JSON.stringify({ name, image: found, path: outPath, bytes: stat.size }, null, 2))
  await log(`DOWNLOADED ${name} ${outPath} ${stat.size}`)
}

const cdp = await connect()
try {
  for (const [name, prompt] of prompts) {
    await generate(cdp, name, prompt)
  }
  await log('DONE')
  console.log(OUT)
} finally {
  cdp.close()
}
