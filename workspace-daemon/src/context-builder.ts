import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const AGENT_MEMORY_ROOT = path.join(
  os.homedir(),
  '.openclaw',
  'workspace',
  'memory',
  'agents',
)

function getAgentMemoryPath(agentId: string, projectSlug: string): string {
  return path.join(AGENT_MEMORY_ROOT, `${agentId}-${projectSlug}.md`)
}

function toProjectSlug(projectName: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return slug.replace(/^-+|-+$/g, '') || 'project'
}

export class ContextBuilder {
  buildPrompt(
    agentSystemPrompt: string,
    projectName: string,
    taskDescription: string,
    workspacePath?: string,
  ): string {
    const projectSlug = toProjectSlug(projectName)
    const agentId = this.extractAgentId(agentSystemPrompt)
    const memory = agentId ? this.readAgentMemory(agentId, projectSlug) : ''
    const gitLog = workspacePath ? this.readGitLog(workspacePath) : ''
    const parts = [
      agentSystemPrompt.trim(),
      memory ? `## Agent Memory\n${memory}` : '',
      gitLog ? `## Recent project commits\n${gitLog}` : '',
      `## Task\nProject: ${projectName}\n${taskDescription}`,
    ].filter(Boolean)

    return parts.join('\n\n')
  }

  appendAgentMemory(agentId: string, projectSlug: string, entry: string): void {
    const targetPath = getAgentMemoryPath(agentId, projectSlug)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.appendFileSync(
      targetPath,
      `## ${new Date().toISOString()}\n${entry}\n\n`,
      'utf8',
    )
  }

  readAgentMemory(agentId: string, projectSlug: string): string {
    const targetPath = getAgentMemoryPath(agentId, projectSlug)

    try {
      const content = fs.readFileSync(targetPath, 'utf8')
      return content.slice(-500)
    } catch {
      return ''
    }
  }

  extractAgentId(systemPrompt: string): string {
    const match = systemPrompt.match(/IDENTITY:\s*(\S+)/)
    return match?.[1] ?? ''
  }

  private readGitLog(workspacePath: string): string {
    try {
      return execSync('git log -5 --oneline', {
        cwd: workspacePath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .slice(-500)
    } catch {
      return ''
    }
  }
}
