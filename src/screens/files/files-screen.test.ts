import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const filesScreenPath = path.resolve(__dirname, 'files-screen.tsx')

describe('FilesScreen remote workspace mode', () => {
  it('defaults to server-side file access copy instead of local folder picker copy', () => {
    const source = fs.readFileSync(filesScreenPath, 'utf8')

    expect(source).toContain('Server workspace')
    expect(source).toContain('Files are loaded from the Workspace server via /api/files')
    expect(source).toContain('Agent-created files will appear here')
    expect(source).not.toContain('showDirectoryPicker')
    expect(source).not.toContain('No workspace selected')
  })
})
