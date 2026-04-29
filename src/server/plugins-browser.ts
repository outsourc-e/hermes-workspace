import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getWorkspacePluginRoots,
  parseSwarmPluginManifest,
  type SwarmPluginDescriptor,
} from './swarm-foundation'

export type WorkspacePluginInfo = SwarmPluginDescriptor

export function listWorkspacePlugins(): Array<WorkspacePluginInfo> {
  const items: Array<WorkspacePluginInfo> = []

  for (const { root, source } of getWorkspacePluginRoots()) {
    if (!fs.existsSync(root)) continue
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = path.join(root, entry.name)
      const manifestPath = fs.existsSync(path.join(pluginDir, 'plugin.yaml'))
        ? path.join(pluginDir, 'plugin.yaml')
        : fs.existsSync(path.join(pluginDir, 'plugin.yml'))
          ? path.join(pluginDir, 'plugin.yml')
          : ''
      if (!manifestPath) continue
      try {
        items.push(parseSwarmPluginManifest({ manifestPath, source }))
      } catch (error) {
        items.push({
          name: entry.name,
          version: '',
          description: '',
          source,
          enabled: false,
          manifestPath,
          runtimeScopes: [],
          workspaceScopes: [],
          workerScopes: ['all'],
          boundary: 'workspace-only',
          validationErrors: ['manifest parse failed'],
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name))
  return items
}

export function formatWorkspacePluginsMessage(): string {
  const plugins = listWorkspacePlugins()
  if (plugins.length === 0) return 'No plugins installed.'
  const lines = [`Plugins (${plugins.length}):`]
  for (const plugin of plugins) {
    const status = plugin.enabled ? '✓' : '✗'
    const version = plugin.version ? ` v${plugin.version}` : ''
    const source = plugin.source ? ` [${plugin.source}]` : ''
    const description = plugin.description ? ` — ${plugin.description}` : ''
    const boundary = ` <${plugin.boundary}>`
    const scopes = [
      plugin.runtimeScopes.length > 0
        ? `runtime=${plugin.runtimeScopes.join(',')}`
        : '',
      plugin.workspaceScopes.length > 0
        ? `workspace=${plugin.workspaceScopes.join(',')}`
        : '',
      plugin.workerScopes.length > 0
        ? `workers=${plugin.workerScopes.join(',')}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const validation =
      plugin.validationErrors.length > 0
        ? ` [${plugin.validationErrors.join('; ')}]`
        : ''
    const error = plugin.error ? ` (${plugin.error})` : ''
    lines.push(
      `  ${status} ${plugin.name}${version}${source}${boundary}${description}${scopes ? ` — ${scopes}` : ''}${validation}${error}`,
    )
  }
  return lines.join('\n')
}
