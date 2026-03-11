import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Router } from 'express'

type WorkspaceSkill = {
  id: string
  name: string
  description: string
  path: string
  status: 'active'
}

function getSkillFilePath(id: string): string {
  return path.join(getSkillsRoot(), id, 'SKILL.md')
}

function getSkillsRoot(): string {
  return path.join(os.homedir(), '.openclaw', 'workspace', 'skills')
}

function parseSkillMarkdown(
  markdown: string,
  fallbackName: string,
): Pick<WorkspaceSkill, 'name' | 'description'> {
  const lines = markdown.split(/\r?\n/)
  const h1Line = lines.find((line) => /^#\s+/.test(line.trim()))
  const name = h1Line?.trim().replace(/^#\s+/, '').trim() || fallbackName
  const startIndex = h1Line ? lines.indexOf(h1Line) + 1 : 0
  const paragraphLines: Array<string> = []

  for (const rawLine of lines.slice(startIndex)) {
    const line = rawLine.trim()

    if (!line) {
      if (paragraphLines.length > 0) break
      continue
    }

    if (/^#/.test(line)) {
      if (paragraphLines.length > 0) break
      continue
    }

    paragraphLines.push(line)
  }

  return {
    name,
    description: paragraphLines.join(' '),
  }
}

export function createSkillsRouter(): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const skillsRoot = getSkillsRoot()

    let entries: Array<Dirent>
    try {
      entries = await fs.readdir(skillsRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.json({ skills: [] })
        return
      }

      res.status(500).json({ error: 'Failed to read skills directory' })
      return
    }

    try {
      const skills = (
        await Promise.all(
          entries
            .filter((entry) => entry.isDirectory())
            .map(async (entry) => {
              const skillDir = path.join(skillsRoot, entry.name)
              const skillFile = path.join(skillDir, 'SKILL.md')

              let markdown: string
              try {
                markdown = await fs.readFile(skillFile, 'utf8')
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                  return null
                }

                throw error
              }

              const { name, description } = parseSkillMarkdown(
                markdown,
                entry.name,
              )

              return {
                id: entry.name,
                name,
                description,
                path: skillDir,
                status: 'active' as const,
              }
            }),
        )
      )
        .filter((skill): skill is WorkspaceSkill => skill !== null)
        .sort((left, right) => left.name.localeCompare(right.name))

      res.json({ skills })
    } catch {
      res.status(500).json({ error: 'Failed to read skills directory' })
    }
  })

  router.get('/:id/content', (req, res) => {
    try {
      const content = readFileSync(getSkillFilePath(req.params.id), 'utf8')
      res.json({ content })
    } catch {
      res.json({ content: '' })
    }
  })

  return router
}
