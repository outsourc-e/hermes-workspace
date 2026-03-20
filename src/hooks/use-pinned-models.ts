/**
 * Phase 4.2: Pinned Models
 *
 * Persist user's favorite models for quick access in model switcher
 */
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pinnedModels'

function getPinnedFromStorage(): Array<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePinnedToStorage(pinned: Array<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned))
  } catch {
    // Ignore storage errors
  }
}

export function usePinnedModels() {
  const [pinned, setPinned] = useState<Array<string>>(getPinnedFromStorage)

  const togglePin = (modelId: string) => {
    setPinned((prev) => {
      const isPinned = prev.includes(modelId)
      const next = isPinned
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]

      savePinnedToStorage(next)
      return next
    })
  }

  const isPinned = (modelId: string): boolean => {
    return pinned.includes(modelId)
  }

  // Sync with localStorage changes from other tabs
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setPinned(getPinnedFromStorage())
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return {
    pinned,
    togglePin,
    isPinned,
  }
}
