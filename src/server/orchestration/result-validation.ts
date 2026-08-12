import type { ExecutionResultInput } from './types'

export type ResultValidation = {
  ok: boolean
  errors: Array<string>
}

export function validateExecutionResult(input: ExecutionResultInput): ResultValidation {
  const errors: Array<string> = []
  if (!input.proof) errors.push('execution proof is required')
  if ((input.state === 'succeeded' || input.state === 'failed') && !input.checkpointRaw) {
    errors.push('terminal results require a checkpoint')
  }
  if (input.state === 'succeeded') {
    if (!input.checkpointFresh) errors.push('successful checkpoints must be fresh')
    if (!input.proof?.pid) errors.push('successful results require a process id')
    if (!input.proof?.command) errors.push('successful results require command proof')
    if (!input.summary?.trim()) errors.push('successful results require a summary')
  }
  if (input.state !== 'succeeded' && !input.error?.trim() && input.state !== 'failed') {
    errors.push('non-success results require an error or blocker')
  }
  return { ok: errors.length === 0, errors }
}
