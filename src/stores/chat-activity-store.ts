import { create } from 'zustand'

export type AgentActivity =
  | 'idle'
  | 'reading' // user sent a message, agent hasn't started responding
  | 'thinking' // waiting for first token
  | 'responding' // streaming response
  | 'tool-use' // executing a tool call
  | 'orchestrating' // subagents active

type ChatActivityState = {
  activity: AgentActivity
  localActivity: AgentActivity
  /** Timestamp of last activity change */
  changedAt: number
  setLocalActivity: (activity: AgentActivity) => void
}

export const useChatActivityStore = create<ChatActivityState>((set, get) => ({
  activity: 'idle',
  localActivity: 'idle',
  changedAt: Date.now(),

  setLocalActivity: (localActivity) => {
    if (get().localActivity !== localActivity) {
      set({ localActivity, activity: localActivity, changedAt: Date.now() })
    }
  },
}))
