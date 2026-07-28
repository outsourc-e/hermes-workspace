import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import {
  fetchChatSessionCardsPage,
  mergeChatSessionCardPages,
  sessionCardQueryKeys,
} from '../chat-queries'

export function useChatSessionCardInventory(options: { enabled?: boolean } = {}) {
  const query = useInfiniteQuery({
    queryKey: sessionCardQueryKeys.chatInventory(false),
    queryFn: ({ pageParam }) =>
      fetchChatSessionCardsPage(pageParam === null ? undefined : pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: options.enabled ?? true,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  })
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
