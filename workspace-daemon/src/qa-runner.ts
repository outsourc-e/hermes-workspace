import type { QAResult } from './types'

type SpawnResponse = {
  result?: string
  text?: string
  summary?: string
  message?: string
}

function createFallbackResult(issue = 'QA unavailable'): QAResult {
  return {
    verdict: 'NEEDS_CHANGES',
    issues: [issue],
    confidence: 0,
    riskLevel: 'HIGH',
    filesReviewed: [],
  }
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  if (value < 0) {
    return 0
  }

  if (value > 1) {
    return 1
  }

  return value
}

export class QARunner {
  constructor(private readonly baseUrl = 'http://127.0.0.1:3333') {}

  async runQA(
    diff: string,
    projectPath: string,
    checkpointId: string,
  ): Promise<QAResult> {
    try {
      const endpoint = new URL('/api/sessions/spawn', this.baseUrl).toString()
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          runtime: 'subagent',
          label: `aurora-qa-${checkpointId.slice(0, 8)}`,
          task: this.buildPrompt(diff, projectPath),
          model: 'anthropic-oauth/claude-sonnet-4-6',
          runTimeoutSeconds: 120,
        }),
      })

      if (!response.ok) {
        return createFallbackResult(`QA unavailable (${response.status})`)
      }

      const text = await this.readResponseText(response)
      return this.parseQAResult(text)
    } catch {
      return createFallbackResult()
    }
  }

  private buildPrompt(diff: string, projectPath: string): string {
    return [
      'IDENTITY: aurora-qa',
      'ROLE: Code reviewer for ClawSuite',
      '',
      'REVIEW CHECKLIST:',
      '1. TypeScript errors',
      '2. React hook issues',
      '3. API input validation',
      '4. DB migrations present',
      '5. Light theme tokens only',
      '6. SSE emitted on state change',
      '',
      '## Diff:',
      diff || '(no diff available)',
      '',
      `Run: npx tsc --noEmit in ${projectPath}`,
      '',
      'End your response with a JSON block matching:',
      '{"verdict":"APPROVED|NEEDS_CHANGES|BLOCKED","issues":["..."],"confidence":0.0,"riskLevel":"LOW|MEDIUM|HIGH","filesReviewed":["path"],"suggestion":"optional"}',
    ].join('\n')
  }

  private async readResponseText(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) {
      const payload = (await response.json().catch(() => ({}))) as SpawnResponse
      return [
        typeof payload.result === 'string' ? payload.result : '',
        typeof payload.text === 'string' ? payload.text : '',
        typeof payload.summary === 'string' ? payload.summary : '',
        typeof payload.message === 'string' ? payload.message : '',
      ]
        .filter(Boolean)
        .join('\n')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      return ''
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue
        }

        const rawPayload = line.slice(5).trim()
        if (!rawPayload) {
          continue
        }

        try {
          const payload = JSON.parse(rawPayload) as Record<string, unknown>
          const message =
            typeof payload.message === 'string'
              ? payload.message
              : typeof payload.summary === 'string'
                ? payload.summary
                : typeof payload.result === 'string'
                  ? payload.result
                  : ''
          if (message) {
            text = `${text}\n${message}`.trim()
          }
        } catch {
          text = `${text}\n${rawPayload}`.trim()
        }
      }
    }

    return text
  }

  private parseQAResult(text: string): QAResult {
    const trimmed = text.trim()
    const fencedMatches = Array.from(
      trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
    )
      .map((match) => match[1]?.trim() ?? '')
      .filter(Boolean)
    const candidates = fencedMatches.length > 0 ? fencedMatches : [trimmed]

    for (const candidate of candidates) {
      const parsed = this.tryParseJsonCandidate(candidate)
      if (parsed) {
        return parsed
      }
    }

    const upper = trimmed.toUpperCase()
    if (upper.includes('BLOCKED')) {
      return {
        verdict: 'BLOCKED',
        issues: ['QA blocked the checkpoint'],
        confidence: 0,
        riskLevel: 'HIGH',
        filesReviewed: [],
      }
    }
    if (upper.includes('APPROVED')) {
      return {
        verdict: 'APPROVED',
        issues: [],
        confidence: 0.5,
        riskLevel: 'MEDIUM',
        filesReviewed: [],
      }
    }

    return createFallbackResult()
  }

  private tryParseJsonCandidate(candidate: string): QAResult | null {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      return null
    }

    try {
      const parsed = JSON.parse(
        candidate.slice(start, end + 1),
      ) as Record<string, unknown>
      const verdict = parsed.verdict
      const riskLevel = parsed.riskLevel
      if (
        verdict !== 'APPROVED' &&
        verdict !== 'NEEDS_CHANGES' &&
        verdict !== 'BLOCKED'
      ) {
        return null
      }
      if (riskLevel !== 'LOW' && riskLevel !== 'MEDIUM' && riskLevel !== 'HIGH') {
        return null
      }

      return {
        verdict,
        issues: Array.isArray(parsed.issues)
          ? parsed.issues.filter((value): value is string => typeof value === 'string')
          : [],
        confidence: clampConfidence(parsed.confidence),
        riskLevel,
        filesReviewed: Array.isArray(parsed.filesReviewed)
          ? parsed.filesReviewed.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
        suggestion:
          typeof parsed.suggestion === 'string' ? parsed.suggestion : undefined,
      }
    } catch {
      return null
    }
  }
}
