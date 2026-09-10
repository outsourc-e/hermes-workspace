import { useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { MessageTimestamp } from './message-timestamp'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { writeTextToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

type MessageActionsBarProps = {
  text: string
  align: 'start' | 'end'
  timestamp: number
  forceVisible?: boolean
  isQueued?: boolean
  isFailed?: boolean
  onRetry?: () => void
  enableSpeech?: boolean
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    try {
      textarea.focus()
      textarea.select()
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}

const DEFAULT_SPEECH_CHUNK_SIZE = 300

function splitLongSpeechPart(text: string, maxLength: number): string[] {
  const words = text.trim().split(/\s+/)
  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word

    if (candidate.length <= maxLength) {
      current = candidate
      continue
    }

    if (current) {
      chunks.push(current)
    }

    current = word
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function splitParagraphIntoSpeechChunks(
  paragraph: string,
  maxLength: number,
): string[] {
  const normalized = paragraph.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return []
  }

  if (normalized.length <= maxLength) {
    return [normalized]
  }

  const sentences =
    normalized.match(/[^.!?…]+[.!?…]+(?:["'”’)\]]+)?|[^.!?…]+$/g)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? [normalized]

  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current) {
        chunks.push(current)
        current = ''
      }

      chunks.push(...splitLongSpeechPart(sentence, maxLength))
      continue
    }

    const candidate = current ? `${current} ${sentence}` : sentence

    if (candidate.length <= maxLength) {
      current = candidate
    } else {
      if (current) {
        chunks.push(current)
      }

      current = sentence
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function splitTextForSpeech(
  text: string,
  maxLength: number,
): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const chunks: string[] = []

  for (const paragraph of paragraphs) {
    chunks.push(
      ...splitParagraphIntoSpeechChunks(paragraph, maxLength),
    )
  }

  return chunks
}

async function loadSpeechChunkSize(): Promise<number> {
  try {
    const response = await fetch('/api/workspace-voice-settings')

    if (!response.ok) {
      return DEFAULT_SPEECH_CHUNK_SIZE
    }

    const payload = (await response.json()) as {
      tts?: {
        chunk_size?: unknown
      }
    }

    const value = Number(payload.tts?.chunk_size)

    if (!Number.isFinite(value)) {
      return DEFAULT_SPEECH_CHUNK_SIZE
    }

    return Math.min(2000, Math.max(100, Math.round(value)))
  } catch {
    return DEFAULT_SPEECH_CHUNK_SIZE
  }
}

async function fetchSpeechChunk(
  text: string,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal,
  })

  if (!response.ok) {
    let message = `Speech request failed (${response.status}).`

    try {
      const payload = (await response.json()) as {
        error?: string
      }

      if (payload.error) {
        message = payload.error
      }
    } catch {}

    throw new Error(message)
  }

  return response.blob()
}

export function MessageActionsBar({
  text,
  align,
  timestamp,
  forceVisible = false,
  isQueued = false,
  isFailed = false,
  onRetry,
  enableSpeech = false,
}: MessageActionsBarProps) {
  const [copied, setCopied] = useState(false)
  
  const [speaking, setSpeaking] = useState(false)
  const [speechLoading, setSpeechLoading] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)

  const speechLoadingRef = useRef(false)

  const speechAbortControllerRef =
    useRef<AbortController | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  const stopSpeech = () => {
    speechAbortControllerRef.current?.abort()
    speechAbortControllerRef.current = null

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }

    speechLoadingRef.current = false

    setSpeechLoading(false)
    setSpeaking(false)
  }

  useEffect(() => {
    return () => {
      speechAbortControllerRef.current?.abort()

      if (audioRef.current) {
        audioRef.current.pause()
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
      }
    }
  }, [])

  const playSpeechBlob = (
    blob: Blob,
    signal: AbortSignal,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        resolve()
        return
      }

      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)

      audioUrlRef.current = url
      audioRef.current = audio

      let finished = false

      const cleanup = () => {
        if (finished) return
        finished = true

        signal.removeEventListener('abort', handleAbort)

        if (audioRef.current === audio) {
          audioRef.current = null
        }

        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url)
          audioUrlRef.current = null
        }
      }

      const handleAbort = () => {
        audio.pause()
        audio.currentTime = 0

        cleanup()
        resolve()
      }

      signal.addEventListener('abort', handleAbort, {
        once: true,
      })

      audio.onended = () => {
        cleanup()
        resolve()
      }

      audio.onerror = () => {
        cleanup()
        reject(new Error('Audio playback failed.'))
      }

      audio.play().catch((error) => {
        cleanup()
        reject(error)
      })
    })
  }

  const handleSpeech = async () => {
    // Clicking while generation is pending cancels it.
    if (speechLoadingRef.current) {
      stopSpeech()
      return
    }

    // Clicking while speech is playing stops everything.
    if (speaking) {
      stopSpeech()
      return
    }

    setSpeechError(null)

    speechLoadingRef.current = true
    setSpeechLoading(true)

    const controller = new AbortController()
    speechAbortControllerRef.current = controller

    let prefetchedChunk: Promise<Blob> | null = null

    try {
      const chunkSize = await loadSpeechChunkSize()

      if (controller.signal.aborted) {
        return
      }

      const chunks = splitTextForSpeech(text, chunkSize)

      if (chunks.length === 0) {
        throw new Error('No text available for speech synthesis.')
      }

      // Generate only the first chunk initially.
      let currentBlob = await fetchSpeechChunk(
        chunks[0],
        controller.signal,
      )

      if (controller.signal.aborted) {
        return
      }

      speechLoadingRef.current = false
      setSpeechLoading(false)
      setSpeaking(true)

      for (let index = 0; index < chunks.length; index += 1) {
        if (controller.signal.aborted) {
          return
        }

        // While the current chunk is playing,
        // generate exactly one chunk ahead.
        if (index + 1 < chunks.length) {
          prefetchedChunk = fetchSpeechChunk(
            chunks[index + 1],
            controller.signal,
          )
        } else {
          prefetchedChunk = null
        }

        await playSpeechBlob(currentBlob, controller.signal)

        if (controller.signal.aborted) {
          return
        }

        if (prefetchedChunk) {
          currentBlob = await prefetchedChunk
          prefetchedChunk = null
        }
      }

      speechAbortControllerRef.current = null
      setSpeaking(false)
    } catch (error) {
      controller.abort()

      // Consume a possible rejected prefetch promise.
      if (prefetchedChunk) {
        try {
          await prefetchedChunk
        } catch {}
      }

      speechAbortControllerRef.current = null
      speechLoadingRef.current = false

      setSpeechLoading(false)
      setSpeaking(false)

      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        return
      }

      setSpeechError(
        error instanceof Error
          ? error.message
          : 'Speech synthesis failed.',
      )
    }
  } 

  const handleCopy = async () => {
    try {
      await writeTextToClipboard(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const positionClass = align === 'end' ? 'justify-end' : 'justify-start'

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-primary-600 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 duration-100 ease-out',
        forceVisible || isQueued || isFailed ? 'opacity-100' : 'opacity-0',
        positionClass,
      )}
    >
      {isFailed && onRetry && (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.6} />
              <span className="text-[11px] font-medium">Retry</span>
            </TooltipTrigger>
            <TooltipContent side="top">Resend failed message</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      )}

      {enableSpeech && text.trim() && (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              type="button"
              onClick={() => {
                void handleSpeech()
              }}
              className="inline-flex items-center justify-center rounded border border-transparent bg-transparent p-1 text-primary-700 hover:text-primary-900 hover:bg-primary-100 dark:hover:bg-primary-800"
              aria-label={
                speechLoading
                  ? 'Generating speech'
                  : speaking
                    ? 'Stop speaking'
                    : 'Read aloud'
              }
            >
              <span
                className={`text-[16px] leading-none ${
                  speechLoading ? 'animate-pulse' : ''
                }`}
                aria-hidden="true"
              >
                {speechLoading ? '⏳' : speaking ? '⏹' : '🔊'}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {speechError
                ? speechError
                : speechLoading
                  ? 'Generating speech...'
                  : speaking
                    ? 'Stop'
                    : 'Read aloud'}
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      )}      

      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger
            type="button"
            onClick={() => {
              handleCopy().catch(() => {})
            }}
            className="inline-flex items-center justify-center rounded border border-transparent bg-transparent p-1 text-primary-700 hover:text-primary-900 hover:bg-primary-100 dark:hover:bg-primary-800"
          >
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              size={16}
              strokeWidth={1.6}
            />
          </TooltipTrigger>
          <TooltipContent side="top">Copy</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
      <MessageTimestamp timestamp={timestamp} />
    </div>
  )
}
