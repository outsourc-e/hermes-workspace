'use client'

const STORAGE_KEY = 'claude-session-pinged'

export async function generateFingerprint(): Promise<string> {
  const data = `${navigator.userAgent}${window.screen.width}${navigator.language}`
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex.slice(0, 16)
}

function isAlreadyPingedToday(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const storedDate = localStorage.getItem(STORAGE_KEY)
  if (!storedDate) {
    return false
  }

  const today = new Date().toISOString().split('T')[0]
  return storedDate === today
}

function markAsPingedToday(): void {
  if (typeof window === 'undefined') {
    return
  }

  const today = new Date().toISOString().split('T')[0]
  localStorage.setItem(STORAGE_KEY, today)
}

async function sendPing(fingerprint: string): Promise<void> {
  const pingUrl = process.env.NEXT_PUBLIC_PING_URL
  if (!pingUrl) {
    return
  }

  const payload = {
    id: fingerprint,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? '2.0.0',
    ts: Date.now(),
    mobile: window.innerWidth < 768,
  }

  await fetch(pingUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function pingActiveUser(): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  if (isAlreadyPingedToday()) {
    return
  }

  try {
    const fingerprint = await generateFingerprint()
    await sendPing(fingerprint)
    markAsPingedToday()
  } catch {
    // Ignore telemetry failures.
  }
}
