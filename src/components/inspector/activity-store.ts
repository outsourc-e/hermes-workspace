import { create } from 'zustand'

export type ActivityEvent = {
  type: string
  time: string
  text: string
}

type ActivityState = {
  events: Array<ActivityEvent>
  push: (event: ActivityEvent) => void
  clear: () => void
}

export const useActivityStore = create<ActivityState>((set) => ({
  events: [],
  push: (event) =>
    set((state) => ({
      events: [...state.events, event],
    })),
  clear: () => set({ events: [] }),
}))

export function pushActivity(event: ActivityEvent) {
  useActivityStore.getState().push(event)
}
