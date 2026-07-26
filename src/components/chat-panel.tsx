/**
 * ChatPanel — collapsible Card-native chat overlay for non-chat routes.
 *
 * Stable parent Card IDs own selection and full-chat routing. `new` and `main`
 * are the only bootstrap exceptions; every other selection must resolve through
 * the complete, validated Session Card projection.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowExpand01Icon,
  Cancel01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import type { SessionRouteResolutionPayload } from '@/routes/chat/-session-route-state'
import { ChatScreen } from '@/screens/chat/chat-screen'
import {
  fetchSessionCards,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'
import {
  applySessionRouteResolution,
  resolveSessionCardProducerNavigation,
  resolveSessionCardRouteState,
} from '@/routes/chat/-session-route-state'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { Button } from '@/components/ui/button'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type BootstrapRecovery = {
  friendlyId: string
  sessionKey: string
}

function unavailableMessage(
  resolution: ReturnType<typeof resolveSessionCardRouteState>,
): string {
  if (!resolution || resolution.status === 'selected') return ''
  if (resolution.status === 'bootstrap') return ''
  if (resolution.status === 'unavailable') {
    return resolution.reason === 'query'
      ? 'The validated Session Card list could not be loaded.'
      : 'The validated Session Card projection is incomplete.'
  }
  if (resolution.reason === 'child') {
    return 'Child and branch activity can only be inspected under its parent Card.'
  }
  if (resolution.reason === 'continuation') {
    return 'Continuation segments cannot be opened directly. Select the parent Card.'
  }
  return 'This conversation is not present in the validated Session Card list.'
}

export function ChatPanel() {
  const isOpen = useWorkspaceStore((state) => state.chatPanelOpen)
  const selectedCardId = useWorkspaceStore((state) => state.chatPanelCardId)
  const setChatPanelOpen = useWorkspaceStore((state) => state.setChatPanelOpen)
  const setChatPanelCardId = useWorkspaceStore(
    (state) => state.setChatPanelCardId,
  )
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [bootstrapRecovery, setBootstrapRecovery] =
    useState<BootstrapRecovery | null>(null)
  const [showCardList, setShowCardList] = useState(false)

  const sessionCardsQuery = useQuery({
    queryKey: sessionCardQueryKeys.list(false),
    queryFn: () => fetchSessionCards(),
    retry: 1,
    staleTime: 5_000,
    refetchInterval: 5_000,
  })
  const cardRouteResolution = resolveSessionCardRouteState({
    routeKey: selectedCardId,
    queryStatus: sessionCardsQuery.status,
    response: sessionCardsQuery.data,
  })
  const activeCard =
    cardRouteResolution?.status === 'selected'
      ? cardRouteResolution.card
      : undefined
  const authoritativeCards =
    sessionCardsQuery.status === 'success' &&
    sessionCardsQuery.data.completeness === 'complete'
      ? sessionCardsQuery.data.cards
      : undefined
  const isExplicitBootstrap =
    selectedCardId === 'new' || selectedCardId === 'main'
  const isNewChat = selectedCardId === 'new' && !bootstrapRecovery
  const activeFriendlyId =
    activeCard?.cardId ?? bootstrapRecovery?.friendlyId ?? selectedCardId
  const panelTitle =
    activeCard?.title ??
    (selectedCardId === 'new'
      ? 'New Chat'
      : selectedCardId === 'main'
        ? 'Main Chat'
        : 'Conversation unavailable')
  const expandCardId =
    activeCard?.cardId ??
    (isExplicitBootstrap && !bootstrapRecovery ? selectedCardId : undefined)

  useEffect(() => {
    if (!bootstrapRecovery || sessionCardsQuery.status !== 'success') {
      return
    }
    const target = resolveSessionCardProducerNavigation(
      sessionCardsQuery.data,
      [bootstrapRecovery.sessionKey, bootstrapRecovery.friendlyId],
    )
    if (!target) return
    setBootstrapRecovery(null)
    setChatPanelCardId(target.cardId)
  }, [
    bootstrapRecovery,
    sessionCardsQuery.data,
    sessionCardsQuery.status,
    setChatPanelCardId,
  ])

  const handleSessionResolved = useCallback(
    (payload: SessionRouteResolutionPayload) => {
      const transition = applySessionRouteResolution({
        queryClient,
        activeFriendlyId,
        fallbackSessionKey: bootstrapRecovery?.sessionKey ?? activeFriendlyId,
        payload,
      })
      setBootstrapRecovery(transition.resolvedRoute)
      void queryClient.invalidateQueries({
        queryKey: sessionCardQueryKeys.list(false),
      })
    },
    [activeFriendlyId, bootstrapRecovery?.sessionKey, queryClient],
  )

  const handleExpand = useCallback(() => {
    if (!expandCardId) return
    setChatPanelOpen(false)
    navigate({
      to: '/chat/$sessionKey',
      params: { sessionKey: expandCardId },
    })
  }, [expandCardId, navigate, setChatPanelOpen])

  const handleClose = useCallback(() => {
    setShowCardList(false)
    setChatPanelOpen(false)
  }, [setChatPanelOpen])

  const handleNewChat = useCallback(() => {
    setBootstrapRecovery(null)
    setShowCardList(false)
    setChatPanelCardId('new')
  }, [setChatPanelCardId])

  const handleSelectCard = useCallback(
    (cardId: string) => {
      setBootstrapRecovery(null)
      setShowCardList(false)
      setChatPanelCardId(cardId)
    },
    [setChatPanelCardId],
  )

  const isPostBootstrapRecovery = bootstrapRecovery !== null
  const isBootstrapRecoveryUnavailable =
    isPostBootstrapRecovery &&
    (sessionCardsQuery.status === 'error' ||
      (sessionCardsQuery.status === 'success' &&
        sessionCardsQuery.data.completeness !== 'complete'))
  const bootstrapRecoveryMessage =
    sessionCardsQuery.status === 'error'
      ? 'The validated Session Card list could not be loaded.'
      : 'The validated Session Card projection is incomplete.'
  const canRenderChat =
    cardRouteResolution?.status === 'selected' ||
    (cardRouteResolution?.status === 'bootstrap' && !isPostBootstrapRecovery)
  const resolutionMessage = unavailableMessage(cardRouteResolution)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/20 z-10 min-[1200px]:hidden"
            onClick={handleClose}
            aria-hidden
          />
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 bottom-0 top-[var(--titlebar-h,0px)] h-[calc(100dvh-var(--titlebar-h,0px))] max-h-[calc(100dvh-var(--titlebar-h,0px))] w-[420px] max-w-[100vw] border-l overflow-hidden flex flex-col z-20 shadow-xl"
            style={{
              background: 'var(--theme-bg)',
              borderColor: 'var(--theme-border)',
            }}
          >
            <div className="flex items-center justify-between h-10 px-3 border-b border-primary-200 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowCardList((visible) => !visible)}
                  className="text-xs font-medium text-primary-700 hover:text-primary-900 truncate max-w-[200px] transition-colors"
                  title={panelTitle}
                  aria-expanded={showCardList}
                  aria-controls="chat-panel-card-list"
                >
                  {panelTitle}
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                <TooltipProvider>
                  <TooltipRoot>
                    <TooltipTrigger
                      onClick={handleNewChat}
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-primary-600 hover:text-primary-900"
                          aria-label="New chat"
                        >
                          <HugeiconsIcon
                            icon={PencilEdit02Icon}
                            size={14}
                            strokeWidth={1.5}
                          />
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">New chat</TooltipContent>
                  </TooltipRoot>
                  <TooltipRoot>
                    <TooltipTrigger
                      onClick={handleExpand}
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-primary-600 hover:text-primary-900"
                          aria-label="Expand to full chat"
                          disabled={!expandCardId}
                        >
                          <HugeiconsIcon
                            icon={ArrowExpand01Icon}
                            size={14}
                            strokeWidth={1.5}
                          />
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom">Full view</TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={handleClose}
                  className="text-primary-600 hover:text-primary-900"
                  aria-label="Close chat panel"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {showCardList && (
                <motion.div
                  id="chat-panel-card-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="border-b border-primary-200 overflow-hidden"
                >
                  <div className="max-h-48 overflow-y-auto py-1">
                    {sessionCardsQuery.isPending ? (
                      <p className="px-3 py-2 text-xs text-primary-500">
                        Loading conversations…
                      </p>
                    ) : !authoritativeCards ? (
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <p className="text-xs text-primary-500">
                          Conversations unavailable.
                        </p>
                        <button
                          type="button"
                          className="text-xs font-medium text-accent-600 hover:text-accent-700"
                          onClick={() => void sessionCardsQuery.refetch()}
                        >
                          Retry
                        </button>
                      </div>
                    ) : authoritativeCards.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-primary-500">
                        No conversations yet.
                      </p>
                    ) : (
                      authoritativeCards.map((card) => (
                        <button
                          key={card.cardId}
                          type="button"
                          aria-label={`Open ${card.title}`}
                          aria-current={
                            card.cardId === activeCard?.cardId
                              ? 'page'
                              : undefined
                          }
                          onClick={() => handleSelectCard(card.cardId)}
                          className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
                            card.cardId === activeCard?.cardId
                              ? 'bg-accent-500/10 text-accent-600'
                              : 'text-primary-700 hover:bg-primary-100'
                          }`}
                        >
                          {card.title}
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
              {canRenderChat ? (
                <ChatScreen
                  activeFriendlyId={activeFriendlyId}
                  activeCard={activeCard}
                  sessionCards={authoritativeCards}
                  isNewChat={isNewChat}
                  forcedSessionKey={bootstrapRecovery?.sessionKey}
                  onSessionResolved={
                    isExplicitBootstrap || bootstrapRecovery
                      ? handleSessionResolved
                      : undefined
                  }
                  compact
                  embedded
                />
              ) : isPostBootstrapRecovery && !isBootstrapRecoveryUnavailable ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-primary-700">
                  <h2 className="text-base font-semibold">
                    Resolving conversation
                  </h2>
                  <p className="text-sm text-primary-500">
                    Waiting for the authoritative parent Card before enabling
                    chat.
                  </p>
                  <button
                    type="button"
                    className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs text-white"
                    onClick={() => void sessionCardsQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : isPostBootstrapRecovery ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-primary-700">
                  <h2 className="text-base font-semibold">
                    Conversation unavailable
                  </h2>
                  <p className="text-sm text-primary-500">
                    {bootstrapRecoveryMessage}
                  </p>
                  <button
                    type="button"
                    className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs text-white"
                    onClick={() => void sessionCardsQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : cardRouteResolution === null ? (
                <div className="flex h-full items-center justify-center text-sm text-primary-400">
                  Resolving conversation…
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-primary-700">
                  <h2 className="text-base font-semibold">
                    Conversation unavailable
                  </h2>
                  <p className="text-sm text-primary-500">
                    {resolutionMessage}
                  </p>
                  <button
                    type="button"
                    className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs text-white"
                    onClick={() => void sessionCardsQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
