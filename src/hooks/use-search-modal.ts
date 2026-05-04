import { create } from 'zustand'

export const SEARCH_MODAL_EVENTS = {
  OPEN_SETTINGS: 'search-modal:open-settings',
  OPEN_USAGE: 'search-modal:open-usage',
  TOGGLE_FILE_EXPLORER: 'search-modal:toggle-file-explorer',
} as const

export type SearchScope =
  | 'all'
  | 'chats'
  | 'files'
  | 'agents'
  | 'skills'
  | 'actions'

const RECENT_SEARCHES_KEY = 'hermes-recent-searches-v1'
const RECENT_SEARCHES_LIMIT = 6

function loadRecentSearches(): Array<string> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_SEARCHES_LIMIT)
  } catch {
    return []
  }
}

function persistRecentSearches(values: Array<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(values))
  } catch {
    // localStorage unavailable; fail silently
  }
}

type SearchModalState = {
  isOpen: boolean
  query: string
  scope: SearchScope
  recentSearches: Array<string>
  openModal: () => void
  closeModal: () => void
  toggleModal: () => void
  setQuery: (value: string) => void
  clearQuery: () => void
  setScope: (value: SearchScope) => void
  recordRecentSearch: (value: string) => void
  clearRecentSearches: () => void
}

export const useSearchModal = create<SearchModalState>((set) => ({
  isOpen: false,
  query: '',
  scope: 'all',
  recentSearches: loadRecentSearches(),
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
  toggleModal: () =>
    set((state) => ({
      isOpen: !state.isOpen,
    })),
  setQuery: (value) => set({ query: value }),
  clearQuery: () => set({ query: '' }),
  setScope: (value) => set({ scope: value }),
  recordRecentSearch: (value) =>
    set((state) => {
      const trimmed = value.trim()
      if (trimmed.length < 2) return state
      const next = [
        trimmed,
        ...state.recentSearches.filter(
          (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
        ),
      ].slice(0, RECENT_SEARCHES_LIMIT)
      persistRecentSearches(next)
      return { recentSearches: next }
    }),
  clearRecentSearches: () => {
    persistRecentSearches([])
    set({ recentSearches: [] })
  },
}))

export function emitSearchModalEvent(
  eventName: (typeof SEARCH_MODAL_EVENTS)[keyof typeof SEARCH_MODAL_EVENTS],
) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(eventName))
}
