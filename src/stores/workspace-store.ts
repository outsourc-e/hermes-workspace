import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type WorkspaceState = {
  sidebarCollapsed: boolean
  fileExplorerCollapsed: boolean
  chatFocusMode: boolean
  /** Currently active sub-page route (e.g. '/skills', '/channels') — null means chat-only */
  activeSubPage: string | null
  /** Chat panel visible alongside non-chat routes */
  chatPanelOpen: boolean
  /** Stable parent Card ID selected in the chat panel, or an explicit bootstrap. */
  chatPanelCardId: string
  /** Mobile keyboard / composer focus — hides tab bar */
  mobileKeyboardOpen: boolean
  mobileKeyboardInset: number
  mobileComposerFocused: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleFileExplorer: () => void
  setFileExplorerCollapsed: (collapsed: boolean) => void
  toggleChatFocusMode: () => void
  setChatFocusMode: (enabled: boolean) => void
  setActiveSubPage: (page: string | null) => void
  toggleChatPanel: () => void
  setChatPanelOpen: (open: boolean) => void
  setChatPanelCardId: (cardId: string) => void
  setMobileKeyboardOpen: (open: boolean) => void
  setMobileKeyboardInset: (inset: number) => void
  setMobileComposerFocused: (focused: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      fileExplorerCollapsed: true,
      chatFocusMode: false,
      activeSubPage: null,
      chatPanelOpen: false,
      chatPanelCardId: 'main',
      mobileKeyboardOpen: false,
      mobileKeyboardInset: 0,
      mobileComposerFocused: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleFileExplorer: () =>
        set((s) => ({ fileExplorerCollapsed: !s.fileExplorerCollapsed })),
      setFileExplorerCollapsed: (collapsed) =>
        set({ fileExplorerCollapsed: collapsed }),
      toggleChatFocusMode: () =>
        set((s) => ({ chatFocusMode: !s.chatFocusMode })),
      setChatFocusMode: (enabled) => set({ chatFocusMode: enabled }),
      setActiveSubPage: (page) => set({ activeSubPage: page }),
      toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
      setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
      setMobileKeyboardOpen: (open) => set({ mobileKeyboardOpen: open }),
      setMobileKeyboardInset: (inset) => set({ mobileKeyboardInset: inset }),
      setMobileComposerFocused: (focused) =>
        set({ mobileComposerFocused: focused }),
      setChatPanelCardId: (cardId) => set({ chatPanelCardId: cardId }),
    }),
    {
      name: 'hermes-workspace-v1',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        fileExplorerCollapsed: state.fileExplorerCollapsed,
        chatPanelOpen: state.chatPanelOpen,
        chatPanelCardId: state.chatPanelCardId,
      }),
    },
  ),
)
