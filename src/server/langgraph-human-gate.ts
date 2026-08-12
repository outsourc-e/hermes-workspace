export type HumanGateChoice = 'primary' | 'secondary' | 'custom'

export type LanggraphHumanGatePayload = {
  choice: HumanGateChoice
  humanNote: string
  targetWorkerId: string
  continueWaitMinutes?: number
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseHumanGateResumeBody(body: Record<string, unknown>): LanggraphHumanGatePayload | null {
  const choiceRaw = cleanString(body.choice)
  const choice: HumanGateChoice =
    choiceRaw === 'primary' || choiceRaw === 'secondary' || choiceRaw === 'custom'
      ? choiceRaw
      : 'primary'
  const humanNote = typeof body.humanNote === 'string' ? body.humanNote.trim() : ''
  const targetWorkerId = cleanString(body.targetWorkerId) ?? ''
  if (!humanNote && choice === 'custom') {
    return null
  }
  return { choice, humanNote, targetWorkerId }
}

export function langgraphEnvWithHumanGate(
  base: NodeJS.ProcessEnv,
  payload: LanggraphHumanGatePayload | null,
): NodeJS.ProcessEnv {
  if (!payload) return base
  const next: NodeJS.ProcessEnv = { ...base }
  next.HERMES_LANGGRAPH_HUMAN_CHOICE = payload.choice
  if (payload.humanNote) {
    next.HERMES_LANGGRAPH_HUMAN_NOTE = payload.humanNote
  } else {
    delete next.HERMES_LANGGRAPH_HUMAN_NOTE
  }
  if (payload.targetWorkerId) {
    next.HERMES_LANGGRAPH_RESUME_TARGET = payload.targetWorkerId
  } else {
    delete next.HERMES_LANGGRAPH_RESUME_TARGET
  }
  if (payload.continueWaitMinutes !== undefined) {
    next.HERMES_LANGGRAPH_CONTINUE_WAIT_MINUTES = String(payload.continueWaitMinutes)
  } else {
    delete next.HERMES_LANGGRAPH_CONTINUE_WAIT_MINUTES
  }
  return next
}
