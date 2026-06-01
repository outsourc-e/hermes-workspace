export interface AgentOsFailureNotificationInput {
  taskId: string
  title: string
  workflowKey: string
  error: string
  route: string
}

export async function notifyAgentOsFailure(input: AgentOsFailureNotificationInput): Promise<void> {
  try {
    await fetch('http://127.0.0.1:8787/api/hermes-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Agent OS failure: ${input.title} (${input.workflowKey}) on ${input.route}. ${input.error}`,
        priority: 'high',
        metadata: {
          scope: 'agent-os',
          kind: 'failure',
          taskId: input.taskId,
          workflowKey: input.workflowKey,
        },
      }),
    })
  } catch {
    // best effort only
  }
}
