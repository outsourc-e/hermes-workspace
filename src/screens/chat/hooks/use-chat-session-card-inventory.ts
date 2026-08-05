import { useEffect, useMemo } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchChatSessionCardsPage,
  mergeChatSessionCardPages,
  sessionCardQueryKeys,
} from '../chat-queries'

export function useChatSessionCardInventory(
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: sessionCardQueryKeys.chatInventory(false),
    queryFn: ({ pageParam }) =>
      fetchChatSessionCardsPage(pageParam === null ? undefined : pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (
      !enabled ||
      typeof window === 'undefined' ||
      typeof EventSource === 'undefined'
    ) {
      return
    }

    const source = new EventSource('/api/events')
    const handleCardActivity = () => {
      void queryClient.invalidateQueries({
        queryKey: sessionCardQueryKeys.chatInventory(false),
        exact: true,
        refetchType: 'active',
      })
    }
    source.addEventListener('card_activity', handleCardActivity)

    return () => {
      source.removeEventListener('card_activity', handleCardActivity)
      source.close()
    }
  }, [enabled, queryClient])

  const sessionCardList = useMemo(
    () => mergeChatSessionCardPages(query.data?.pages ?? []),
    [query.data?.pages],
  )

  return {
    ...query,
    sessionCardList,
    olderSessionsError:
      query.isFetchNextPageError && query.error instanceof Error
        ? query.error.message
        : null,
    loadOlderSessions: () => query.fetchNextPage(),
  }
}
