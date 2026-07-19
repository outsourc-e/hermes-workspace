import { join } from 'node:path'
import { getStateDir } from './workspace-state-dir'

/**
 * Resolve the directory for mutable runtime state (.runtime).
 *
 * Dev/server runs keep the historical per-checkout `<cwd>/.runtime` so each
 * workspace checkout stays isolated. The desktop app must NOT write inside
 * its own installed bundle (cwd = <App>.app/Contents/Resources/app — state
 * would be wiped by every update and breaks under read-only installs), so it
 * uses the shared workspace state dir instead.
 */
export function runtimeStateDir(): string {
  if (process.env.HERMES_WORKSPACE_DESKTOP === '1') {
    return join(getStateDir(), 'runtime')
  }
  return join(process.cwd(), '.runtime')
}
