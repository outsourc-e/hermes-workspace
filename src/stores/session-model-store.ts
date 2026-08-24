import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Per-session model preference.
 *
 * Stored locally in the browser keyed by sessionKey, so a user can pick a
 * different model for one chat without affecting the global default in
 * `~/.hermes/config.yaml` or any other channel (Telegram, Discord, etc.).
 *
 * On every send, the workspace passes this value as the `model` field in
 * the chat-completion request body. The gateway uses it for that request
 * only; nothing else mutates.
 *
 * Cleared automatically when the session is deleted.
 */
export const NEW_CHAT_MODEL_KEY = '__new_chat__'

export function getSessionModelKey(
  sessionKey: string | null | undefined,
): string {
  const normalized = typeof sessionKey === 'string' ? sessionKey.trim() : ''
  return normalized || NEW_CHAT_MODEL_KEY
}

type State = {
  models: Record<string, string>
}

type Actions = {
  getModel: (sessionKey: string | null | undefined) => string | undefined
  setModel: (sessionKey: string, model: string) => void
  clearModel: (sessionKey: string) => void
}

export const useSessionModelStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      models: {},
      getModel: (sessionKey) => {
        if (!sessionKey) return undefined
        return get().models[sessionKey]
      },
      setModel: (sessionKey, model) => {
        if (!sessionKey) return
        const trimmed = model.trim()
        if (!trimmed) return
        set((state) => ({
          models: { ...state.models, [sessionKey]: trimmed },
        }))
      },
      clearModel: (sessionKey) => {
        if (!sessionKey) return
        set((state) => {
          if (!(sessionKey in state.models)) return state
          const next = { ...state.models }
          delete next[sessionKey]
          return { models: next }
        })
      },
    }),
    {
      name: 'hermes-session-model',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ models: state.models }),
    },
  ),
)
