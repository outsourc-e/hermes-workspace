/**
 * POST /api/uni/chat
 *
 * Streams chat responses for UniChat — a study-focused chat interface.
 * Injects ~/.hermes/uni/context.md as system context so the model has
 * Nick's current subjects, deadlines, and study preferences.
 *
 * Body: { messages: [{role: 'user'|'assistant'|'system', content: string}] }
 * Response: SSE stream of OpenAI-compatible chat completions chunks
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import { openaiChat } from '../../../server/openai-compat-api'

const CONTEXT_PATH = join(homedir(), '.hermes', 'uni', 'context.md')

const UNI_SYSTEM_PROMPT = `\
You are UniChat — Nick's dedicated university study assistant, running inside his Hermes workspace.

You help with:
- Explaining concepts from course material
- Breaking down assignments and study tasks
- Summarising lecture notes or reading
- Exam preparation and flashcard generation
- Time management and study planning
- Drafting written assignments (with proper referencing)

You have access to Nick's university context file. Read it carefully and let it inform your responses.

Operating principles:
- Be direct and concise — Nick prefers short, actionable answers
- Ask clarifying questions when a question is ambiguous
- Never make up references, citations, or specific textbook pages — say "I'm not sure" if you don't know
- Flag when a question might need urgent attention (e.g. approaching deadline, missing material)
- When explaining concepts, prefer concrete examples over abstract descriptions

Personality: focused, warm enough to be encouraging, efficient. No fluff.`

function buildSystemMessage(): string {
  let context = ''
  if (existsSync(CONTEXT_PATH)) {
    try {
      context = readFileSync(CONTEXT_PATH, 'utf8')
    } catch {
      // Silently ignore — context is optional
    }
  }

  return `${UNI_SYSTEM_PROMPT}\n\n---\n\n# Nick's University Context\n\n${context}`
}

export const Route = createFileRoute('/api/uni/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: { messages?: Array<{ role: string; content: string }> }
        try {
          body = await request.json()
        } catch {
          return json({ error: 'invalid JSON body' }, { status: 400 })
        }

        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return json({ error: 'messages array is required' }, { status: 400 })
        }

        const systemMsg = {
          role: 'system' as const,
          content: buildSystemMessage(),
        }

        const allMessages = [systemMsg, ...body.messages]

        const stream = await openaiChat(allMessages, {
          model: 'kimi-latest',
          signal: request.signal,
          stream: true,
        })

        const readable = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of stream) {
                controller.enqueue(chunk)
              }
              controller.close()
            } catch (err) {
              if ((err as Error).name !== 'AbortError') {
                controller.error(err)
              }
            }
          },
        })

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})
