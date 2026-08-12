import { lazy } from 'react'

async function loadTerminalWorkspaceModule() {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const mod = await import('@/components/terminal/terminal-workspace')
      return { default: mod.TerminalWorkspace }
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

/** Shared lazy terminal chunk — one import graph, retries transient Vite 504/HMR blips. */
export const TerminalWorkspaceLazy = lazy(loadTerminalWorkspaceModule)
