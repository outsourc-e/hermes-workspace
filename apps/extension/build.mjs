// AI Protect extension bundler (MV3).
// Produces dist/ with entry-point bundles from src/, ready to "Load unpacked".
// No raw .ts service workers reach the manifest — MV3 requires JS bundles.
import { build } from 'esbuild'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = new URL('.', import.meta.url).pathname
const src = resolve(root, 'src')
const out = resolve(root, 'dist')

const aliases = {
  '@ai-protect/shared': resolve(root, '../../packages/ai-protect-shared/src/index.ts'),
  '@ai-protect/shared/types': resolve(root, '../../packages/ai-protect-shared/src/types.ts'),
  '@ai-protect/shared/schemas': resolve(root, '../../packages/ai-protect-shared/src/schemas.ts'),
  '@ai-protect/shared/constants': resolve(root, '../../packages/ai-protect-shared/src/constants.ts'),
  '@ai-protect/core': resolve(root, '../../packages/ai-protect-core/src/index.ts'),
  '@ai-protect/core/pii-patterns': resolve(root, '../../packages/ai-protect-core/src/pii-patterns.ts'),
  '@ai-protect/core/aho-corasick': resolve(root, '../../packages/ai-protect-core/src/aho-corasick.ts'),
  '@ai-protect/core/substitute': resolve(root, '../../packages/ai-protect-core/src/substitute.ts'),
  '@ai-protect/core/rehydrator': resolve(root, '../../packages/ai-protect-core/src/rehydrator.ts'),
  '@ai-protect/core/audit': resolve(root, '../../packages/ai-protect-core/src/audit.ts'),
  '@ai-protect/nano': resolve(root, '../../packages/ai-protect-nano/src/index.ts'),
  '@ai-protect/nano/adapter': resolve(root, '../../packages/ai-protect-nano/src/adapter.ts'),
  '@ai-protect/policy': resolve(root, '../../packages/ai-protect-policy/src/index.ts'),
}

const entries = ['background/service-worker.ts', 'content/content.ts', 'offscreen/offscreen.ts', 'devtools/devtools.ts']

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.(html|json)$/.test(e.name)) yield p
  }
}

await mkdir(out, { recursive: true })

const formPath = (p) => p.slice(src.length + 1).replace(/\.ts$/, '.js')

await Promise.all([
  ...entries.map((e) =>
    build({
      entryPoints: [resolve(src, e)],
      outfile: resolve(out, e.replace(/\.ts$/, '.js')),
      bundle: true,
      format: 'esm',
      target: 'chrome122',
      platform: 'browser',
      alias: aliases,
      external: ['ws'],
      plugins: [
        {
          name: 'crypto-shim',
          setup(b2) {
            b2.onResolve({ filter: /^node:crypto$/ }, () => ({ path: resolve(root, 'crypto-shim.js') }))
          },
        },
      ],
    }),
  ),
])

// copy static assets (html, policy json, manifest)
for await (const file of walk(src)) {
  const dest = resolve(out, file.slice(src.length + 1))
  await mkdir(resolve(dest, '..'), { recursive: true })
  await cp(file, dest)
}
await cp(resolve(root, 'manifest.json'), resolve(out, 'manifest.json'))
await cp(resolve(root, 'icons'), resolve(out, 'icons'), { recursive: true })

// rewrite script src references in html (allow .ts references to bundle names)
for await (const file of walk(src)) {
  if (!file.endsWith('.html')) continue
  const dest = resolve(out, file.slice(src.length + 1))
  let html = await readFile(dest, 'utf8')
  html = html.replace(/(.+\.(?:offscreen|devtools))\.ts/g, '$1.js')
  await writeFile(dest, html)
}

// emit manifest with bundled paths: src/background/service-worker.ts -> background/service-worker.js
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
const rel = (v) => `${v}`.replace(/^src\//, '').replace(/\.ts$/, '.js')
if (manifest.background?.service_worker) manifest.background.service_worker = rel(manifest.background.service_worker)
if (Array.isArray(manifest.content_scripts))
  for (const cs of manifest.content_scripts) {
    if (cs.js) cs.js = cs.js.map(rel)
    if (cs.css) cs.css = cs.css.map(rel)
  }
if (Array.isArray(manifest.web_accessible_resources))
  for (const wr of manifest.web_accessible_resources) {
    if (wr.resources)
      wr.resources = wr.resources.map((r) =>
        r.startsWith('src/') ? rel(r) : resolve(root, 'src', r).startsWith(src) ? r.replace(/^src\//, '') : r,
      )
  }
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2))

console.log('[ai-protect-extension] bundled to apps/extension/dist')
