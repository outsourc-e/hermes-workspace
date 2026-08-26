#!/usr/bin/env node
// vercel-build.mjs — assemble a Vercel Build Output API (v3) directory from the
// standard `vite build` output so the SSR app serves on Vercel instead of 404ing.
//
// TanStack Start 1.166 only emits a standalone Node server (dist/server/server.js)
// + static client assets (dist/client) — Vercel has no preset for that, so a
// plain import serves the static dir and every SSR route (including "/") 404s.
// This wraps the server's Web `fetch` handler in a Node serverless function and
// declares the routes Vercel needs.
//
// Output layout (.vercel/output/):
//   config.json                       routing (filesystem first, then SSR)
//   static/                           = dist/client (hashed assets, icons, …)
//   functions/ssr.func/
//     .vc-config.json                 runtime + handler descriptor
//     index.mjs                       = scripts/vercel-ssr-entry.mjs
//     dist/server/                    = dist/server (bundle + chunks)
//
// Run as the Vercel buildCommand AFTER `vite build` (see vercel.json).

import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const dist = path.join(root, 'dist')
const out = path.join(root, '.vercel', 'output')
const fnDir = path.join(out, 'functions', 'ssr.func')

const serverEntry = path.join(dist, 'server', 'server.js')
const clientDir = path.join(dist, 'client')
if (!existsSync(serverEntry) || !existsSync(clientDir)) {
  console.error(
    `[vercel-build] missing build output.\n  expected: ${serverEntry}\n  and:      ${clientDir}\n  run \`pnpm build\` first (vercel.json does this).`,
  )
  process.exit(1)
}

console.log('[vercel-build] assembling .vercel/output …')
await rm(out, { recursive: true, force: true })

// 1) Static assets — served directly by Vercel's filesystem handler.
await mkdir(out, { recursive: true })
await cp(clientDir, path.join(out, 'static'), { recursive: true })

// Serve the one-liner installer at <domain>/install.sh so
// `curl -fsSL https://<domain>/install.sh | bash` works from the deployed site.
const installer = path.join(root, 'install.sh')
if (existsSync(installer)) {
  await cp(installer, path.join(out, 'static', 'install.sh'))
  console.log('[vercel-build] served install.sh at /install.sh')
}

// 2) SSR serverless function — wraps server.fetch.
await mkdir(fnDir, { recursive: true })
await cp(path.join(dist, 'server'), path.join(fnDir, 'dist', 'server'), {
  recursive: true,
})
await cp(
  path.join(root, 'scripts', 'vercel-ssr-entry.mjs'),
  path.join(fnDir, 'index.mjs'),
)
await writeFile(
  path.join(fnDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
    },
    null,
    2,
  ),
)

// 3) Routing — try real files first, then fall through to SSR for everything.
await writeFile(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/ssr' }],
    },
    null,
    2,
  ),
)

console.log('[vercel-build] done → .vercel/output (static + ssr.func)')
