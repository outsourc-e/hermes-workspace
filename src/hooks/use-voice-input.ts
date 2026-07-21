'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error'

type UseVoiceInputOptions = {
  lang?: string
  interim?: boolean
  transcribe?: (blob: Blob) => Promise<string>
  onResult?: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (error: string) => void
}

type UseVoiceInputReturn = {
  state: VoiceInputState
  isListening: boolean
  isSupported: boolean
  transcript: string
  start: () => void
  stop: () => void
  toggle: () => void
}

type SpeechRecognitionInstance = any
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null

  const win = window as any
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

function supportsRecorderTranscription() {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    typeof MediaRecorder === 'undefined'
  ) {
    return false
  }
  return 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices
}

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus'
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm'
  }
  return 'audio/mp4'
}

export function useVoiceInput(
  options: UseVoiceInputOptions = {},
): UseVoiceInputReturn {
  const {
    lang = 'en-US',
    interim = true,
    transcribe,
    onResult,
    onInterim,
    onError,
  } = options
  const [state, setState] = useState<VoiceInputState>('idle')
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Array<Blob>>([])
  const recorderMimeTypeRef = useRef('audio/webm')
  const isSupported = transcribe
    ? supportsRecorderTranscription()
    : typeof window !== 'undefined' && Boolean(getSpeechRecognition())

  const callbacksRef = useRef({ onResult, onInterim, onError, transcribe })
  callbacksRef.current = { onResult, onInterim, onError, transcribe }

  const cleanupRecorder = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder) {
      recorder.stream.getTracks().forEach((track) => track.stop())
    }
    recorderRef.current = null
    recordedChunksRef.current = []
  }, [])

  const stop = useCallback(() => {
    if (callbacksRef.current.transcribe) {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        setState('idle')
        cleanupRecorder()
        return
      }
      setState('processing')
      recorder.stop()
      return
    }

    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      // already stopped
    }
    setState('idle')
  }, [cleanupRecorder])

  const start = useCallback(async () => {
    if (callbacksRef.current.transcribe) {
      if (!supportsRecorderTranscription()) {
        callbacksRef.current.onError?.('Audio recording not supported in this browser')
        setState('error')
        return
      }

      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
        cleanupRecorder()
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mimeType = pickRecorderMimeType()
        recorderMimeTypeRef.current = mimeType
        const recorder = new MediaRecorder(stream, { mimeType })
        recordedChunksRef.current = []

        recorder.onstart = () => {
          setState('listening')
          setTranscript('')
        }

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data)
          }
        }

        recorder.onerror = () => {
          cleanupRecorder()
          setState('error')
          callbacksRef.current.onError?.('Recording failed')
        }

        recorder.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, {
            type: recorderMimeTypeRef.current,
          })
          cleanupRecorder()

          if (blob.size === 0) {
            setState('idle')
            return
          }

          setState('processing')
          try {
            const text = await callbacksRef.current.transcribe!(blob)
            const trimmed = text.trim()
            setTranscript(trimmed)
            if (trimmed) {
              callbacksRef.current.onResult?.(trimmed)
            }
            setState('idle')
          } catch (error) {
            setState('error')
            callbacksRef.current.onError?.(
              error instanceof Error ? error.message : 'Transcription failed',
            )
          }
        }

        recorderRef.current = recorder
        recorder.start(100)
        return
      } catch (error) {
        setState('error')
        callbacksRef.current.onError?.(
          error instanceof Error ? error.message : 'Microphone access denied',
        )
        return
      }
    }

    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      callbacksRef.current.onError?.(
        'Speech recognition not supported in this browser',
      )
      setState('error')
      return
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        /* */
      }
    }

    const recognition = new SpeechRecognition()
    recognition.lang = lang
    recognition.interimResults = interim
    recognition.continuous = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setState('listening')
      setTranscript('')
    }

    recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result?.[0]) continue
        const text = result[0].transcript
        if (result.isFinal) {
          finalText += text
        } else {
          interimText += text
        }
      }

      if (finalText) {
        setTranscript(finalText)
        callbacksRef.current.onResult?.(finalText)
      }
      if (interimText) {
        setTranscript(interimText)
        callbacksRef.current.onInterim?.(interimText)
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        setState('idle')
        return
      }
      setState('error')
      callbacksRef.current.onError?.(event.error)
    }

    recognition.onend = () => {
      setState('idle')
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [cleanupRecorder, interim, lang])

  const toggle = useCallback(() => {
    if (state === 'listening') {
      stop()
    } else {
      void start()
    }
  }, [state, start, stop])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          /* */
        }
      }
      if (recorderRef.current) {
        try {
          recorderRef.current.stop()
        } catch {
          /* */
        }
      }
      cleanupRecorder()
    }
  }, [cleanupRecorder])

  return {
    state,
    isListening: state === 'listening',
    isSupported,
    transcript,
    start: () => {
      void start()
    },
    stop,
    toggle,
  }
}
