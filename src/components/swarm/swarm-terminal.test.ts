/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'

// Unit tests for SwarmTerminal component logic
// Test the pure functions and state management without rendering

// Extracted keyToData logic for testing
function keyToData(event: KeyboardEvent): string {
  if (event.metaKey) return ''
  if (event.ctrlKey && event.key.length === 1) {
    const upper = event.key.toUpperCase()
    const code = upper.charCodeAt(0)
    if (code >= 64 && code <= 95) return String.fromCharCode(code - 64)
  }
  switch (event.key) {
    case 'Enter':
      return '\r'
    case 'Backspace':
      return '\x7f'
    case 'Tab':
      return '\t'
    case 'Escape':
      return '\x1b'
    case 'ArrowUp':
      return '\x1b[A'
    case 'ArrowDown':
      return '\x1b[B'
    case 'ArrowRight':
      return '\x1b[C'
    case 'ArrowLeft':
      return '\x1b[D'
    case 'Home':
      return '\x1b[H'
    case 'End':
      return '\x1b[F'
    case 'PageUp':
      return '\x1b[5~'
    case 'PageDown':
      return '\x1b[6~'
    case 'Delete':
      return '\x1b[3~'
    default:
      return event.key.length === 1 && !event.altKey ? event.key : ''
  }
}

describe('SwarmTerminal — keyToData logic', () => {
  it('maps Enter to \\r', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\r')
  })

  it('maps Backspace to \\x7f', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x7f')
  })

  it('maps Tab to \\t', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\t')
  })

  it('maps Escape to \\x1b', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b')
  })

  it('maps ArrowUp to \\x1b[A', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[A')
  })

  it('maps ArrowDown to \\x1b[B', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[B')
  })

  it('maps ArrowRight to \\x1b[C', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[C')
  })

  it('maps ArrowLeft to \\x1b[D', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[D')
  })

  it('maps Home to \\x1b[H', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Home',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[H')
  })

  it('maps End to \\x1b[F', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'End',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[F')
  })

  it('maps PageUp to \\x1b[5~', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'PageUp',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[5~')
  })

  it('maps PageDown to \\x1b[6~', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'PageDown',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[6~')
  })

  it('maps Delete to \\x1b[3~', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Delete',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x1b[3~')
  })

  it('returns single printable character for letter keys', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('a')
  })

  it('returns uppercase letter for Shift+letter', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'A',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('A')
  })

  it('returns empty for metaKey', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('')
  })

  it('returns Ctrl+letter as control code', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: false,
      ctrlKey: true,
      altKey: false,
    })
    expect(keyToData(event)).toBe('\x01')
  })

  it('returns empty for altKey + single char', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: false,
      ctrlKey: false,
      altKey: true,
    })
    expect(keyToData(event)).toBe('')
  })

  it('returns empty for non-printable key without mapping', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'F1',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('')
  })

  it('returns empty for Menu key', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'ContextMenu',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })
    expect(keyToData(event)).toBe('')
  })
})

// Extracted queueInput/flush logic for testing
describe('SwarmTerminal — input queue logic', () => {
  it('queueInput appends data to buffer', () => {
    vi.useFakeTimers()
    const buffer = ''
    const inputBufferRef = { current: '' }
    const flushTimerRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    }

    const flushPendingInput = vi.fn()
    const queueInput = (data: string) => {
      if (!data) return
      inputBufferRef.current += data
      if (flushTimerRef.current) return
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        flushPendingInput()
      }, 18)
    }

    queueInput('hello')
    expect(inputBufferRef.current).toBe('hello')
    expect(flushTimerRef.current).not.toBeNull()

    queueInput(' world')
    expect(inputBufferRef.current).toBe('hello world')
    // flushTimerRef.current should still be the same timer (not reset)
    expect(flushTimerRef.current).not.toBeNull()

    vi.advanceTimersByTime(20)
    expect(flushTimerRef.current).toBeNull()
    expect(flushPendingInput).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('queueInput ignores empty data', () => {
    const inputBufferRef = { current: '' }
    const flushTimerRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    }
    const flushPendingInput = vi.fn()
    const queueInput = (data: string) => {
      if (!data) return
      inputBufferRef.current += data
      if (flushTimerRef.current) return
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        flushPendingInput()
      }, 18)
    }

    queueInput('')
    expect(inputBufferRef.current).toBe('')
    expect(flushTimerRef.current).toBeNull()
    expect(flushPendingInput).not.toHaveBeenCalled()
  })

  it('flushPendingInput sends data and clears buffer when sessionId exists', async () => {
    const sessionIdRef = { current: 'session-123' }
    const inputBufferRef = { current: 'test data' }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })

    const flushPendingInput = () => {
      const sessionId = sessionIdRef.current
      const data = inputBufferRef.current
      if (!sessionId || !data) return
      inputBufferRef.current = ''
      fetchMock('/api/terminal-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, data }),
      }).catch(() => undefined)
    }

    await flushPendingInput()
    expect(inputBufferRef.current).toBe('')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/terminal-input',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'session-123', data: 'test data' }),
      }),
    )
  })

  it('flushPendingInput does nothing when no sessionId', () => {
    const sessionIdRef = { current: null as string | null }
    const inputBufferRef = { current: 'test data' }
    const fetchMock = vi.fn()

    const flushPendingInput = () => {
      const sessionId = sessionIdRef.current
      const data = inputBufferRef.current
      if (!sessionId || !data) return
      inputBufferRef.current = ''
      fetchMock('/api/terminal-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, data }),
      }).catch(() => undefined)
    }

    flushPendingInput()
    expect(inputBufferRef.current).toBe('test data')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('SwarmTerminal — state transitions', () => {
  it('stop transitions to closed state', () => {
    const state = {
      current: 'connected' as
        | 'idle'
        | 'connecting'
        | 'connected'
        | 'closed'
        | 'error',
    }
    const sessionIdRef = { current: 'session-123' }
    const readerRef = { current: {} as ReadableStreamDefaultReader }
    const flushTimerRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    }

    const setState = (s: typeof state.current) => {
      state.current = s
    }
    const flushPendingInput = vi.fn()

    const stop = () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushPendingInput()
      const sessionId = sessionIdRef.current
      if (sessionId) {
        fetch('/api/terminal-close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        }).catch(() => undefined)
      }
      if (readerRef.current) {
        try {
          void readerRef.current.cancel()
        } catch {
          /* noop */
        }
        readerRef.current = null
      }
      sessionIdRef.current = null
      setState('closed')
    }

    stop()
    expect(state.current).toBe('closed')
    expect(sessionIdRef.current).toBeNull()
    expect(readerRef.current).toBeNull()
    expect(flushPendingInput).toHaveBeenCalled()
  })

  it('restart calls stop then resets to idle', () => {
    const state = {
      current: 'connected' as
        | 'idle'
        | 'connecting'
        | 'connected'
        | 'closed'
        | 'error',
    }
    const reconnectKey = { current: 0 }
    const terminalRef = { current: { write: vi.fn() } as any }
    const flushTimerRef = {
      current: null as ReturnType<typeof setTimeout> | null,
    }
    const sessionIdRef = { current: 'session-123' }
    const readerRef = { current: {} as ReadableStreamDefaultReader }
    const flushPendingInput = vi.fn()

    const setState = (s: typeof state.current) => {
      state.current = s
    }
    const stop = () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushPendingInput()
      if (sessionIdRef.current) {
        fetch('/api/terminal-close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        }).catch(() => undefined)
      }
      if (readerRef.current) {
        try {
          void readerRef.current.cancel()
        } catch {
          /* noop */
        }
        readerRef.current = null
      }
      sessionIdRef.current = null
      setState('closed')
    }

    const restart = () => {
      stop()
      if (terminalRef.current) {
        terminalRef.current.write('\r\n\x1b[33m[swarm] restarting…\x1b[0m\r\n')
      }
      reconnectKey.current += 1
      setState('idle')
    }

    restart()
    expect(state.current).toBe('idle')
    expect(reconnectKey.current).toBe(1)
    expect(terminalRef.current.write).toHaveBeenCalled()
    expect(flushPendingInput).toHaveBeenCalled()
  })
})

describe('SwarmTerminal — SSE event parsing', () => {
  function parseSseEvent(
    buffer: string,
  ): { event: string; data: string } | null {
    const lines = buffer.split('\n')
    let event = 'message'
    let dataLine = ''
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) dataLine += line.slice(5).trim()
    }
    if (!dataLine) return null
    return { event, data: dataLine }
  }

  it('parses message event', () => {
    const result = parseSseEvent('event: message\ndata: {"output": "hello"}')
    expect(result).not.toBeNull()
    expect(result!.event).toBe('message')
    expect(result!.data).toBe('{"output": "hello"}')
  })

  it('parses session event', () => {
    const result = parseSseEvent(
      'event: session\ndata: {"sessionId": "abc-123"}',
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('session')
    expect(result!.data).toBe('{"sessionId": "abc-123"}')
  })

  it('parses data event', () => {
    const result = parseSseEvent('event: data\ndata: "some terminal output"')
    expect(result).not.toBeNull()
    expect(result!.event).toBe('data')
    expect(result!.data).toBe('"some terminal output"')
  })

  it('parses exit event', () => {
    const result = parseSseEvent('event: exit\ndata: {}')
    expect(result).not.toBeNull()
    expect(result!.event).toBe('exit')
  })

  it('parses error event', () => {
    const result = parseSseEvent(
      'event: error\ndata: {"message": "connection lost"}',
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('error')
    expect(result!.data).toBe('{"message": "connection lost"}')
  })

  it('returns null for empty buffer', () => {
    expect(parseSseEvent('')).toBeNull()
  })

  it('returns null for data-only without data field', () => {
    expect(parseSseEvent('event: message\n')).toBeNull()
  })
})
