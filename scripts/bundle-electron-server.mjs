import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { build } from 'esbuild'

const root = process.cwd()
const entryPoint = resolve(root, 'dist/server/server.js')
const outfile = resolve(root, 'electron/server-bundle.cjs')
const startManifestPattern = /_tanstack-start-manifest_v-[^/\\]+\.js$/

function normalizeCheckoutPaths(source) {
  const nativePrefix = `${root}/`
  const posixPrefix = `${root.replaceAll('\\', '/')}/`
  const jsonWindowsPrefix = `${root.replaceAll('\\', '\\\\')}\\\\`

  return [...new Set([nativePrefix, posixPrefix, jsonWindowsPrefix])]
    .sort((left, right) => right.length - left.length)
    .reduce((contents, prefix) => contents.replaceAll(prefix, ''), source)
}

const stableStartManifest = {
  name: 'stable-tanstack-start-manifest',
  setup(buildContext) {
    const manifestSources = new Set()

    buildContext.onResolve({ filter: startManifestPattern }, (args) => {
      const sourcePath = resolve(args.resolveDir, args.path)
      manifestSources.add(sourcePath)
      return {
        namespace: 'stable-tanstack-start-manifest',
        path: 'tanstack-start-manifest.js',
        pluginData: { sourcePath },
      }
    })

    buildContext.onLoad(
      {
        filter: /^tanstack-start-manifest\.js$/,
        namespace: 'stable-tanstack-start-manifest',
      },
      async (args) => {
        const sourcePath = args.pluginData?.sourcePath
        if (typeof sourcePath !== 'string') {
          throw new Error('TanStack Start manifest source path is unavailable')
        }
        return {
          contents: normalizeCheckoutPaths(await readFile(sourcePath, 'utf8')),
          loader: 'js',
          resolveDir: dirname(sourcePath),
        }
      },
    )

    buildContext.onEnd(() => {
      if (manifestSources.size !== 1) {
        return {
          errors: [
            {
              text: `Expected one TanStack Start manifest, found ${manifestSources.size}`,
            },
          ],
        }
      }
      return undefined
    })
  },
}

await build({
  absWorkingDir: root,
  bundle: true,
  entryPoints: [entryPoint],
  format: 'cjs',
  logLimit: 6,
  outfile,
  platform: 'node',
  plugins: [stableStartManifest],
})
