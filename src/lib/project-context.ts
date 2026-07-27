export type ProjectContextScope = {
  id?: string
  name?: string
  goal?: string
  instructions?: string
}

const PROJECT_CONTEXT_RE =
  /^\s*<project_context\s+active="true"(?:\s+id="[^"]*")?(?:\s+name="[^"]*")?(?:\s+goal="[^"]*")?(?:\s+instructions="[^"]*")?\s*\/?>\s*/i

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizeAttribute(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildProjectContextDirective(
  project: ProjectContextScope | null | undefined,
): string {
  if (!project) return ''
  const id = normalizeAttribute(project.id)
  const name = normalizeAttribute(project.name)
  const goal = normalizeAttribute(project.goal)
  const instructions = normalizeAttribute(project.instructions)
  if (!id || !name) return ''

  const attrs = [
    'active="true"',
    `id="${escapeAttribute(id)}"`,
    `name="${escapeAttribute(name)}"`,
  ]
  if (goal) attrs.push(`goal="${escapeAttribute(goal)}"`)
  if (instructions) attrs.push(`instructions="${escapeAttribute(instructions)}"`)
  return `<project_context ${attrs.join(' ')} />`
}

export function buildProjectScopedTextMessage(
  message: string,
  project: ProjectContextScope | null | undefined,
): string {
  if (message.includes('<project_context active="true"')) return message
  const directive = buildProjectContextDirective(project)
  if (!directive) return message
  return `${directive}\n\n${message}`
}

export function stripProjectContextDirective(message: string): string {
  if (!message.includes('<project_context active="true"')) return message
  return message.replace(PROJECT_CONTEXT_RE, '').trimStart()
}
