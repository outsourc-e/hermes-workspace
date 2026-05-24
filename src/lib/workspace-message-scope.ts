export type WorkspaceScope = {
  path?: string
  folderName?: string
  isValid?: boolean
}

const WORKSPACE_DIRECTIVE_RE =
  /^\s*<workspace_context\s+active="true"\s+name="[^"]*"\s+path="[^"]*"\s*\/?>\s*/i

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function buildWorkspaceDirective(workspace: WorkspaceScope): string {
  const path = workspace.path?.trim() ?? ''
  if (!path || workspace.isValid === false) return ''
  const name = workspace.folderName?.trim() || path.split('/').filter(Boolean).at(-1) || 'workspace'
  return `<workspace_context active="true" name="${escapeAttribute(name)}" path="${escapeAttribute(path)}" />`
}

export function buildWorkspaceScopedTextMessage(
  message: string,
  workspace: WorkspaceScope | null | undefined,
): string {
  if (message.includes('<workspace_context active="true"')) return message
  const directive = workspace ? buildWorkspaceDirective(workspace) : ''
  if (!directive) return message
  return `${directive}\n\n${message}`
}

export function stripWorkspaceDirective(message: string): string {
  if (!message.includes('<workspace_context active="true"')) return message
  return message.replace(WORKSPACE_DIRECTIVE_RE, '').trimStart()
}
