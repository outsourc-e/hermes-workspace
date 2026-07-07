/**
 * useAgoraProfile — local persistent profile for the Agora.
 *
 * v0.0: pure localStorage. v0.1+: this profile is the payload sent to
 * the WebSocket server on `join`.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  AGORA_PROFILE_STORAGE_KEY,
  type AgoraAvatarId,
  type AgoraProfile,
  type AgoraStatus,
} from '../lib/agora-types'

// The Greek pantheon — new arrivals spawn as a random little god.
const AGORA_GODS: Array<{ id: AgoraAvatarId; name: string }> = [
  { id: 'hermes', name: 'Hermes' },
  { id: 'athena', name: 'Athena' },
  { id: 'apollo', name: 'Apollo' },
  { id: 'artemis', name: 'Artemis' },
  { id: 'iris', name: 'Iris' },
  { id: 'nike', name: 'Nike' },
  { id: 'eros', name: 'Eros' },
  { id: 'pan', name: 'Pan' },
  { id: 'chronos', name: 'Chronos' },
]

function generateInitialProfile(): AgoraProfile {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `agora-${Math.random().toString(36).slice(2, 10)}`
  const god = AGORA_GODS[Math.floor(Math.random() * AGORA_GODS.length)]
  const num = Math.floor(Math.random() * 900) + 100
  return {
    id,
    handle: `${god.id}${num}`,
    displayName: `${god.name} ${num}`,
    avatarId: god.id,
    bio: '',
    status: 'online',
  }
}

function loadProfile(): AgoraProfile {
  if (typeof window === 'undefined') return generateInitialProfile()
  try {
    const raw = window.localStorage.getItem(AGORA_PROFILE_STORAGE_KEY)
    if (!raw) {
      const initial = generateInitialProfile()
      window.localStorage.setItem(
        AGORA_PROFILE_STORAGE_KEY,
        JSON.stringify(initial),
      )
      return initial
    }
    const parsed = JSON.parse(raw) as AgoraProfile
    if (
      !parsed.id ||
      !parsed.handle ||
      !parsed.displayName ||
      !parsed.avatarId
    ) {
      return generateInitialProfile()
    }
    return parsed
  } catch {
    return generateInitialProfile()
  }
}

export function useAgoraProfile() {
  const [profile, setProfile] = useState<AgoraProfile>(() => loadProfile())

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AGORA_PROFILE_STORAGE_KEY,
        JSON.stringify(profile),
      )
    } catch {
      // ignore quota / private mode
    }
  }, [profile])

  const updateProfile = useCallback((patch: Partial<AgoraProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }))
  }, [])

  const setAvatar = useCallback(
    (avatarId: AgoraAvatarId) => updateProfile({ avatarId }),
    [updateProfile],
  )

  const setStatus = useCallback(
    (status: AgoraStatus) => updateProfile({ status }),
    [updateProfile],
  )

  return { profile, updateProfile, setAvatar, setStatus }
}
