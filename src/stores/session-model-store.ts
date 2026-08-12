import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Per-Card model preference.
 *
 * Stored locally in the browser keyed by Card ID, so a user can pick a
 * different model for one chat without affecting the global default in
 * `~/.hermes/config.yaml` or any other channel (Telegram, Discord, etc.).
 *
 * On every send, the workspace passes this value as the `model` field in
 * the chat-completion request body. The gateway uses it for that request
 * only; nothing else mutates.
 *
 * Backend continuation segment keys are never accepted by call sites. The
 * preference is cleared automatically when its Card is deleted.
 */
type State = {
  models: Record<string, string>
}

type Actions = {
  getModel: (cardId: string | null | undefined) => string | undefined
  setModel: (cardId: string, model: string) => void
  clearModel: (cardId: string) => void
}

export const useSessionModelStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      models: {},
      getModel: (cardId) => {
        if (!cardId) return undefined
        return get().models[cardId]
      },
      setModel: (cardId, model) => {
        if (!cardId) return
        const trimmed = model.trim()
        if (!trimmed) return
        set((state) => ({
          models: { ...state.models, [cardId]: trimmed },
        }))
      },
      clearModel: (cardId) => {
        if (!cardId) return
        set((state) => {
          if (!(cardId in state.models)) return state
          const next = { ...state.models }
          delete next[cardId]
          return { models: next }
        })
      },
    }),
    {
      name: 'hermes-card-model',
      storage: createJSONStorage(() => {
        localStorage.removeItem('hermes-session-model')
        return localStorage
      }),
      partialize: (state) => ({ models: state.models }),
    },
  ),
)
