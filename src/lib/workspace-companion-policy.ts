export type WorkspaceCompanionPolicyInput = {
  command: string
  mode: string
  env: Record<string, string | undefined>
}

export function isWorkspaceTestRuntime({
  mode,
  env,
}: Omit<WorkspaceCompanionPolicyInput, 'command'>): boolean {
  return (
    mode === 'test' ||
    env.NODE_ENV === 'test' ||
    env.VITEST === 'true' ||
    env.VITEST === '1'
  )
}

export function shouldAutoStartWorkspaceCompanions({
  command,
  mode,
  env,
}: WorkspaceCompanionPolicyInput): boolean {
  if (command !== 'serve') return false
  if (isWorkspaceTestRuntime({ mode, env })) return false
  return env.WORKSPACE_AUTOSTART_LOCAL_SERVICES === '1'
}
