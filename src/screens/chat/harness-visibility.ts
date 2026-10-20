import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'hermes-workspace:hidden-harnesses:v1'
const CHANGE_EVENT = 'hermes-workspace:harness-visibility-change'

function readHiddenHarnesses(): Array<string> {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

function writeHiddenHarnesses(ids: Array<string>) {
  const normalized = [...new Set(ids)].sort()
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useHarnessVisibility() {
  const [hiddenIds, setHiddenIds] = useState<Array<string>>(
    readHiddenHarnesses,
  )

  useEffect(() => {
    const refresh = () => setHiddenIds(readHiddenHarnesses())
    window.addEventListener('storage', refresh)
    window.addEventListener(CHANGE_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(CHANGE_EVENT, refresh)
    }
  }, [])

  const toggleHarness = useCallback((id: string) => {
    const current = readHiddenHarnesses()
    writeHiddenHarnesses(
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    )
  }, [])

  const showAllHarnesses = useCallback(() => writeHiddenHarnesses([]), [])

  return {
    hiddenIds,
    hiddenSet: new Set(hiddenIds),
    toggleHarness,
    showAllHarnesses,
  }
}
