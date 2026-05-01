/**
 * Phase 2.6: Workspace detection API
 * Auto-detects workspace from Claude config, env, or default paths
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

function extractFolderName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || 'workspace'
}

async function isValidDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function detectWorkspace(savedPath?: string): Promise<{
  path: string
  folderName: string
  source: string
  isValid: boolean
}> {
  // Priority 1: Saved path from localStorage (passed via query param)
  if (savedPath) {
    const isValid = await isValidDirectory(savedPath)
    if (isValid) {
      return {
        path: savedPath,
        folderName: extractFolderName(savedPath),
        source: 'localStorage',
        isValid: true,
      }
    }
    // Saved path is stale, fall through to auto-detect
  }

  // Priority 2: Environment variable
  const envWorkspace =
    process.env.CLAUDE_WORKSPACE_DIR?.trim() ||
    process.env.CLAUDE_WORKSPACE_DIR?.trim()
  if (envWorkspace) {
    const isValid = await isValidDirectory(envWorkspace)
    if (isValid) {
      return {
        path: envWorkspace,
        folderName: extractFolderName(envWorkspace),
        source: 'claude',
        isValid: true,
      }
    }
  }

  // Priority 3: Default Claude workspace path
  const defaultPath = process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude')
  const defaultValid = await isValidDirectory(defaultPath)
  if (defaultValid) {
    return {
      path: defaultPath,
      folderName: extractFolderName(defaultPath),
      source: 'default',
      isValid: true,
    }
  }

  // Priority 4: Claude home directory
  const claudeDir = process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude')
  const claudeDirValid = await isValidDirectory(claudeDir)
  if (claudeDirValid) {
    return {
      path: claudeDir,
      folderName: path.basename(claudeDir),
      source: 'default',
      isValid: true,
    }
  }

  // Nothing found
  return {
    path: '',
    folderName: '',
    source: 'none',
    isValid: false,
  }
}

export const Route = createFileRoute('/api/workspace')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const savedPath = url.searchParams.get('saved') || undefined

          const result = await detectWorkspace(savedPath)

          return json(result)
        } catch (err) {
          return json(
            {
              path: '',
              folderName: '',
              source: 'error',
              isValid: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
