import { useEffect, useState } from 'react'

type AmbientZone = 'training' | 'forge' | null

const STORAGE_KEY = 'hermes-playground-audio-muted'
const MUTE_EVENT = 'hermes-playground-audio-muted'

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let ambientCleanup: (() => void) | null = null
let currentAmbient: AmbientZone = null
let resumeHooked = false
let mutedCache = false
let queuedSounds: Array<() => void> = []

function readMuted() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function emitMute() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MUTE_EVENT, { detail: mutedCache }))
}

function applyMute() {
  if (!masterGain) return
  masterGain.gain.cancelScheduledValues(audioContext!.currentTime)
  masterGain.gain.setTargetAtTime(mutedCache ? 0 : 0.82, audioContext!.currentTime, 0.03)
}

function ensureContext() {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioContext = new Ctor()
    masterGain = audioContext.createGain()
    masterGain.connect(audioContext.destination)
    mutedCache = readMuted()
    applyMute()
  }
  hookResume()
  return audioContext
}

function hookResume() {
  if (resumeHooked || typeof window === 'undefined') return
  resumeHooked = true
  const flush = () => {
    void resumeAudio().then(() => {
      const next = queuedSounds
      queuedSounds = []
      for (const play of next) play()
    })
  }
  window.addEventListener('pointerdown', flush, { passive: true })
  window.addEventListener('keydown', flush)
  window.addEventListener('touchstart', flush, { passive: true })
}

async function resumeAudio() {
  const ctx = ensureContext()
  if (!ctx) return null
  if (ctx.state !== 'running') {
    try {
      await ctx.resume()
    } catch {
      return null
    }
  }
  return ctx.state === 'running' ? ctx : null
}

function enqueueWhenReady(play: () => void) {
  if (mutedCache) return
  queuedSounds.push(play)
}

function createNoiseBuffer(ctx: AudioContext, duration = 1.5) {
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frameCount; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount)
  }
  return buffer
}

function connectTone(ctx: AudioContext, frequency: number, type: OscillatorType, start: number, duration: number, gainValue: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(masterGain!)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

function connectWhoosh(ctx: AudioContext, start: number, duration: number, fromHz: number, toHz: number, gainValue: number) {
  const source = ctx.createBufferSource()
  source.buffer = createNoiseBuffer(ctx, duration + 0.2)
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(fromHz, start)
  filter.frequency.exponentialRampToValueAtTime(toHz, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(masterGain!)
  source.start(start)
  source.stop(start + duration + 0.05)
}

async function runSound(play: (ctx: AudioContext, start: number) => void) {
  if (mutedCache) return
  const ctx = await resumeAudio()
  if (!ctx) {
    enqueueWhenReady(() => {
      const readyCtx = ensureContext()
      if (!readyCtx || readyCtx.state !== 'running' || mutedCache) return
      play(readyCtx, readyCtx.currentTime + 0.02)
    })
    return
  }
  play(ctx, ctx.currentTime + 0.02)
}

function stopAmbient() {
  ambientCleanup?.()
  ambientCleanup = null
  currentAmbient = null
}

async function startTrainingAmbient() {
  const ctx = await resumeAudio()
  if (!ctx || mutedCache) return
  stopAmbient()
  currentAmbient = 'training'
  const low = ctx.createOscillator()
  const pad = ctx.createOscillator()
  const hiss = ctx.createBufferSource()
  const lowGain = ctx.createGain()
  const padGain = ctx.createGain()
  const hissGain = ctx.createGain()
  const hissFilter = ctx.createBiquadFilter()
  low.type = 'triangle'
  low.frequency.value = 72
  pad.type = 'sine'
  pad.frequency.value = 144
  hiss.buffer = createNoiseBuffer(ctx, 2.5)
  hiss.loop = true
  hissFilter.type = 'lowpass'
  hissFilter.frequency.value = 480
  lowGain.gain.value = 0.028
  padGain.gain.value = 0.016
  hissGain.gain.value = 0.01
  low.connect(lowGain)
  pad.connect(padGain)
  hiss.connect(hissFilter)
  hissFilter.connect(hissGain)
  lowGain.connect(masterGain!)
  padGain.connect(masterGain!)
  hissGain.connect(masterGain!)
  low.start()
  pad.start()
  hiss.start()
  ambientCleanup = () => {
    low.stop()
    pad.stop()
    hiss.stop()
    low.disconnect()
    pad.disconnect()
    hiss.disconnect()
    lowGain.disconnect()
    padGain.disconnect()
    hissGain.disconnect()
    hissFilter.disconnect()
  }
}

async function startForgeAmbient() {
  const ctx = await resumeAudio()
  if (!ctx || mutedCache) return
  stopAmbient()
  currentAmbient = 'forge'
  const pulse = ctx.createOscillator()
  const bass = ctx.createOscillator()
  const noise = ctx.createBufferSource()
  const pulseGain = ctx.createGain()
  const bassGain = ctx.createGain()
  const noiseGain = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  pulse.type = 'sawtooth'
  pulse.frequency.value = 110
  bass.type = 'triangle'
  bass.frequency.value = 55
  noise.buffer = createNoiseBuffer(ctx, 1.5)
  noise.loop = true
  filter.type = 'highpass'
  filter.frequency.value = 320
  pulseGain.gain.value = 0.016
  bassGain.gain.value = 0.026
  noiseGain.gain.value = 0.007
  lfo.type = 'sine'
  lfo.frequency.value = 2.2
  lfoGain.gain.value = 18
  lfo.connect(lfoGain)
  lfoGain.connect(pulse.frequency)
  pulse.connect(pulseGain)
  bass.connect(bassGain)
  noise.connect(filter)
  filter.connect(noiseGain)
  pulseGain.connect(masterGain!)
  bassGain.connect(masterGain!)
  noiseGain.connect(masterGain!)
  pulse.start()
  bass.start()
  noise.start()
  lfo.start()
  ambientCleanup = () => {
    pulse.stop()
    bass.stop()
    noise.stop()
    lfo.stop()
    pulse.disconnect()
    bass.disconnect()
    noise.disconnect()
    lfo.disconnect()
    pulseGain.disconnect()
    bassGain.disconnect()
    noiseGain.disconnect()
    lfoGain.disconnect()
    filter.disconnect()
  }
}

export const playgroundAudio = {
  playTitleEntry() {
    void runSound((ctx, start) => {
      connectTone(ctx, 392, 'triangle', start, 0.18, 0.06)
      connectTone(ctx, 523.25, 'sine', start + 0.12, 0.22, 0.05)
      connectTone(ctx, 659.25, 'triangle', start + 0.26, 0.48, 0.07)
      connectWhoosh(ctx, start, 0.42, 240, 1200, 0.018)
    })
  },
  playPortalWhoosh() {
    void runSound((ctx, start) => {
      connectWhoosh(ctx, start, 0.54, 180, 1800, 0.03)
      connectTone(ctx, 220, 'sawtooth', start, 0.28, 0.018)
      connectTone(ctx, 440, 'triangle', start + 0.18, 0.24, 0.022)
    })
  },
  playQuestComplete() {
    void runSound((ctx, start) => {
      connectTone(ctx, 523.25, 'triangle', start, 0.18, 0.05)
      connectTone(ctx, 659.25, 'triangle', start + 0.11, 0.2, 0.055)
      connectTone(ctx, 783.99, 'sine', start + 0.24, 0.48, 0.06)
    })
  },
  playPortalUnlock() {
    void runSound((ctx, start) => {
      connectWhoosh(ctx, start, 0.42, 320, 2400, 0.028)
      connectTone(ctx, 392, 'triangle', start + 0.04, 0.16, 0.03)
      connectTone(ctx, 587.33, 'sine', start + 0.18, 0.28, 0.04)
      connectTone(ctx, 880, 'triangle', start + 0.3, 0.55, 0.045)
    })
  },
  playRewardPickup() {
    void runSound((ctx, start) => {
      connectTone(ctx, 880, 'sine', start, 0.12, 0.04)
      connectTone(ctx, 1174.66, 'triangle', start + 0.08, 0.18, 0.03)
    })
  },
  playHit() {
    void runSound((ctx, start) => {
      connectWhoosh(ctx, start, 0.14, 1200, 220, 0.024)
      connectTone(ctx, 180, 'square', start, 0.12, 0.025)
    })
  },
  playDefeat() {
    void runSound((ctx, start) => {
      connectTone(ctx, 330, 'triangle', start, 0.18, 0.03)
      connectTone(ctx, 196, 'sawtooth', start + 0.12, 0.28, 0.035)
      connectWhoosh(ctx, start + 0.08, 0.5, 1400, 110, 0.03)
    })
  },
  playLowHpWarning() {
    void runSound((ctx, start) => {
      connectTone(ctx, 220, 'sine', start, 0.18, 0.02)
      connectTone(ctx, 196, 'triangle', start + 0.12, 0.32, 0.028)
    })
  },
  setAmbient(zone: AmbientZone) {
    if (zone === currentAmbient) return
    if (!zone) {
      stopAmbient()
      return
    }
    if (zone === 'training') {
      void startTrainingAmbient()
      return
    }
    if (zone === 'forge') {
      void startForgeAmbient()
      return
    }
    stopAmbient()
  },
  getMuted() {
    mutedCache = readMuted()
    return mutedCache
  },
  setMuted(next: boolean) {
    mutedCache = next
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore storage failures
      }
    }
    applyMute()
    if (next) stopAmbient()
    emitMute()
  },
  toggleMuted() {
    this.setMuted(!this.getMuted())
  },
}

export function usePlaygroundAudioMuted() {
  const [muted, setMuted] = useState(() => playgroundAudio.getMuted())

  useEffect(() => {
    const onMuted = (event: Event) => {
      setMuted(Boolean((event as CustomEvent<boolean>).detail))
    }
    window.addEventListener(MUTE_EVENT, onMuted)
    return () => window.removeEventListener(MUTE_EVENT, onMuted)
  }, [])

  return muted
}
