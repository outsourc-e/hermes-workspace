# Workspace Chat Session Routing

## Purpose

Hermes Workspace supports a portable chat path through OpenAI-compatible `/v1/chat/completions`. In this mode, the browser route alone is not enough to preserve conversational context: Workspace must forward a stable server-side session identifier to the Hermes Agent gateway.

This document records the routing contract and the failure mode that caused related turns and attachments to be stored as separate `api-*` sessions.

## Routing Contract

There are two distinct header layers:

| Layer | Headers | Purpose |
| --- | --- | --- |
| Workspace UI route resolution | `X-Hermes-Session-Key`, `X-Hermes-Friendly-Id` | Tells the browser which Workspace chat route/friendly ID is resolved for the visible conversation. |
| Hermes Agent gateway continuation | `X-Hermes-Session-Id`, `X-Claude-Session-Id` | Tells the gateway which server-side Hermes session should receive the next chat completion request. |

Do not conflate these. A response can correctly resolve a Workspace route while the next gateway request still loses server-side context if `X-Hermes-Session-Id` is missing.

## Portable OpenAI-Compatible Flow

1. `src/routes/api/send-stream.ts` receives `sessionKey`, `friendlyId`, `message`, `history`, and optional `attachments` from the UI.
2. It resolves a persistent Workspace `sessionKey`.
3. It builds OpenAI-compatible messages, including multimodal image parts when attachments are present.
4. It calls `openaiChat(..., { sessionId: portableSessionKey })`.
5. `src/server/openai-compat-api.ts` forwards that session ID to the gateway via:
   - `X-Hermes-Session-Id`
   - `X-Claude-Session-Id` as a legacy/back-compat alias.
6. Hermes Agent uses the provided session ID for continuity instead of deriving a fresh deterministic `api-*` session from the request payload.

## Failure Mode

The bug was coupling session-continuity headers to bearer-token presence:

```ts
if (options.sessionId && bearer) {
  headers['X-Hermes-Session-Id'] = options.sessionId
  headers['X-Claude-Session-Id'] = options.sessionId
}
```

That made routing depend on auth configuration. If a bearer token was unavailable or not used, Workspace still had a local session key, but the gateway never received it. The gateway then derived sessions such as `api-*` from request content, which could split related turns and attachment-only/image requests across separate API sessions.

## Correct Behavior

Session routing is independent of whether a bearer token is configured. If the gateway requires auth, its auth check enforces the bearer token separately.

```ts
const bearer = getBearerToken()
if (bearer) {
  headers['Authorization'] = `Bearer ${bearer}`
}

if (options.sessionId) {
  headers['X-Hermes-Session-Id'] = options.sessionId
  headers['X-Claude-Session-Id'] = options.sessionId
}
```

## Regression Coverage

`src/server/openai-compat-api.test.ts` should cover both cases:

- session headers are sent when a bearer token is present
- session headers are still sent when no bearer token is present

`src/server/chat-backends.ts` should forward `options.sessionId` into `openaiChat(...)` for both streaming and non-streaming OpenAI-compatible calls.

## Manual Verification Recipe

1. Run the targeted test:

   ```bash
   pnpm vitest run src/server/openai-compat-api.test.ts
   ```

2. Build production assets:

   ```bash
   pnpm build
   ```

3. Restart Workspace where deployed:

   ```bash
   systemctl --user restart hermes-workspace.service
   systemctl --user is-active hermes-workspace.service
   ```

4. Send two `/api/send-stream` turns with the same `sessionKey` and a unique token in the first prompt.
5. Search session history for that token. Both turns should appear under the same `session_id` equal to the supplied Workspace session key, not separate `api-*` sessions.
6. Send an image attachment with the same `sessionKey`; session history should show `[screenshot]` in that same session.

## Operational Notes

- Keep credentials redacted when inspecting `.env`, service files, or built bundles.
- In zero-fork deployments, Workspace commonly talks to Hermes Agent gateway on `127.0.0.1:8642` and Dashboard on `127.0.0.1:9119`.
- A successful `/health` probe means the gateway is reachable; it does not prove session continuity is wired correctly. Verify the actual chat path.
