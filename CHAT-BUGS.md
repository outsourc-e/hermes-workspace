# Chat UX Bugs — 2026-03-14

## BUG-1: Message ordering race condition
**Symptom:** When user sends a message while Aurora is mid-response, the user message gets "lost" — appears out of order or doesn't show until after the assistant response completes.
**Root cause hypothesis:** The SSE stream delivers the assistant response, which triggers a refetch of message history. The user's optimistic message (added immediately on send) gets overwritten by the server history which hasn't processed it yet. The dedup logic in chat-screen.tsx (line 659) sorts non-optimistic before optimistic, so the server copy wins — but if the server hasn't received the user message yet (it's still in the HTTP POST pipeline), only the assistant response appears.
**Files:** src/screens/chat/chat-screen.tsx (dedup logic ~650-740), SSE handler
**Fix approach:** 
1. Don't remove optimistic messages until the server response CONFIRMS receipt (match by nonce/clientId)
2. Keep optimistic messages pinned in their original position even during SSE refetches
3. Add a sequence number to messages so ordering is deterministic regardless of arrival time

## BUG-2: Excessive bottom gap on mobile chat
**Symptom:** Large gap between last message and composer on mobile. Feels wasteful compared to ChatGPT app.
**Root cause:** 
- Message list padding: `calc(var(--chat-composer-height, 96px) + var(--safe-b) + 20px)` — the 96px fallback is too large, and 20px extra breathing room is excessive
- Composer position: `bottom: calc(tabBarH + 4px)` when tab bar is visible — but on chat route the tab bar is hidden, so this should be 0
- The `--chat-composer-height` variable may not be updating dynamically when composer is single-line vs multi-line
**Files:** 
- src/screens/chat/components/chat-message-list.tsx (line 412 — paddingBottom)
- src/screens/chat/components/chat-composer.tsx (line 1524-1560 — positioning)
**Fix approach:**
1. Reduce fallback from 96px to 56px (single-line composer height)
2. Reduce breathing room from 20px to 8px
3. Ensure --chat-composer-height CSS var updates on every resize/input
4. On chat route, tab bar is hidden — confirm composer `bottom: 0` not `bottom: tabBarH`
