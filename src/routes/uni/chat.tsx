import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { MessageMultiple01Icon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/uni/chat')({
  ssr: false,
  component: UniChatRoute,
})

type Message = {
  id: number
  role: 'user' | 'assistant'
  text: string
}

type ApiMessage = { role: 'user' | 'assistant' | 'system'; content: string }

function buildApiMessages(
  history: Array<Message>,
  draft: string,
): Array<ApiMessage> {
  const msgs: Array<ApiMessage> = history.map((m) => ({
    role: m.role,
    content: m.text,
  }))
  if (draft.trim()) {
    msgs.push({ role: 'user', content: draft.trim() })
  }
  return msgs
}

async function* parseSSEModelStream(
  response: Response,
): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let buffer = ''

  let done = false
  try {
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') return
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) yield content
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function UniChatRoute() {
  usePageTitle('University — Chat')
  const [messages, setMessages] = useState<Array<Message>>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLLIElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const trimmed = draft.trim()
    if (!trimmed || loading) return

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      text: trimmed,
    }
    setMessages((prev) => [...prev, userMsg])
    setDraft('')
    setLoading(true)

    const currentMessages = [...messages, userMsg]
    const apiMessages = buildApiMessages(messages, trimmed)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('http://127.0.0.1:3001/api/uni/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Stream the assistant response
      const assistantId = Date.now() + 1
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', text: '' },
      ])

      let fullText = ''
      for await (const chunk of parseSSEModelStream(res)) {
        fullText += chunk
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last.id === assistantId) {
            return [...prev.slice(0, -1), { ...last, text: fullText }]
          }
          return prev
        })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled — silently remove the empty assistant message
        setMessages((prev) => prev.filter((m) => m.id !== Date.now() + 1))
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            text: `Error: ${(err as Error).message}. Try again.`,
          },
        ])
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <HugeiconsIcon
          icon={MessageMultiple01Icon}
          size={24}
          strokeWidth={1.5}
        />
        <h1 className="text-xl font-semibold text-[var(--theme-text)]">
          UniChat
        </h1>
      </div>

      <div className="flex flex-1 min-h-0 flex-col rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-[var(--theme-muted)]">
              Study assistant wired to your university context. Your subjects,
              deadlines, and preferences are injected from{' '}
              <code>~/.hermes/uni/context.md</code>.
            </p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)]"
                >
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
                    {m.role}
                  </span>
                  {m.text ||
                    (m.role === 'assistant' && loading ? (
                      <span className="opacity-50">…</span>
                    ) : null)}
                </li>
              ))}
              <li ref={bottomRef} />
            </ul>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-[var(--theme-border)] p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask about a subject, assignment, or concept…"
            className="block min-h-[44px] max-h-40 flex-1 resize-y rounded-md border border-[var(--theme-border)] bg-transparent p-2 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none"
          />
          {loading ? (
            <Button onClick={handleStop} variant="destructive">
              Stop
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!draft.trim()}>
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
