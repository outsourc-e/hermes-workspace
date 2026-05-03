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

const FUNNY_ANIMALS = [
  'Owl', 'Fox', 'Wolf', 'Otter', 'Hawk', 'Lynx', 'Crow', 'Stag', 'Heron',
]

function generateInitialProfile(): AgoraProfile {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `agora-${Math.random().toString(36).slice(2, 10)}`
  const animal = FUNNY_ANIMALS[Math.floor(Math.random() * FUNNY_ANIMALS.length)]
  const num = Math.floor(Math.random() * 9000) + 1000
  const handle = `${animal.toLowerCase()}${num}`
  return {
    id,
    handle,
    displayName: `Builder ${animal}`,
    avatarId: 'hermes',
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
      window.localStorage.setItem(AGORA_PROFILE_STORAGE_KEY, JSON.stringify(initial))
      return initial
    }
    const parsed = JSON.parse(raw) as AgoraProfile
    if (!parsed.id || !parsed.handle || !parsed.displayName || !parsed.avatarId) {
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
      window.localStorage.setItem(AGORA_PROFILE_STORAGE_KEY, JSON.stringify(profile))
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
