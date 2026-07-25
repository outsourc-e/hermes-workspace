# Workspace Chat Session Routing

## Purpose

Hermes Workspace supports a portable chat path through OpenAI-compatible `/v1/chat/completions`. In this mode, the browser route alone is not enough to preserve conversational context: Workspace must forward a stable server-side session identifier to the Hermes Agent gateway.

This same-ID gateway contract is distinct from Workspace lineage canonicalization, where backend compression can create a descendant with a new session ID. See [Session Lineage](./session-lineage.md) for the complete UI and degradation contract.

## Routing Contract

There are two distinct header layers:

| Layer                             | Headers                                        | Purpose                                                                                             |
| --------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace UI route resolution     | `X-Hermes-Session-Key`, `X-Hermes-Friendly-Id` | Tells the browser which Workspace chat route/friendly ID is resolved for the visible conversation.  |
| Hermes Agent gateway continuation | `X-Hermes-Session-Id`, `X-Claude-Session-Id`   | Tells the gateway which server-side Hermes session should receive the next chat completion request. |

Do not conflate these. A response can correctly resolve a Workspace route while the next gateway request still loses server-side context if `X-Hermes-Session-Id` is missing.

## Two Continuity Mechanisms

### Stable same-ID gateway continuation

This is the portable OpenAI-compatible path. Workspace sends the same persistent session key on every gateway request, and Hermes Agent continues that server-side session under the same ID. It does not depend on lineage metadata or latest-descendant support.

1. `src/routes/api/send-stream.ts` receives `sessionKey`, `friendlyId`, `message`, `history`, and optional `attachments` from the UI.
2. It resolves a persistent Workspace `sessionKey`.
3. It builds OpenAI-compatible messages, including multimodal image parts when attachments are present.
4. It calls `openaiChat(..., { sessionId: portableSessionKey })`.
5. `src/server/openai-compat-api.ts` forwards that session ID via `X-Hermes-Session-Id` and the legacy/back-compat `X-Claude-Session-Id` alias.
6. Hermes Agent continues the supplied ID instead of deriving a fresh deterministic `api-*` session from request content.

### Compression-driven descendant canonicalization

A lineage-capable backend can store a compressed continuation under a new descendant ID. Workspace then asks `GET /api/sessions/:sessionKey/latest-descendant` for the canonical tip and changes routes only for a supported, explicitly changed, matching response.

If the capability is unavailable, the request fails, or the response is malformed, Workspace keeps the requested key so ordinary history navigation can proceed. This fallback does not recreate the same-ID gateway contract. Conversely, stable gateway headers do not cause Workspace to invent or merge descendant transcripts.

The lineage tree can collapse confirmed continuation segments into one visible tip, but history still comes from the selected backend session. There is no client-side transcript concatenation.

## Original Failure Mode

The same-ID bug was coupling session-continuity headers to bearer-token presence:

```ts
if (options.sessionId && bearer) {
  headers['X-Hermes-Session-Id'] = options.sessionId
  headers['X-Claude-Session-Id'] = options.sessionId
}
```

If a bearer token was unavailable or unused, Workspace still had a local session key, but the gateway never received it. The gateway then derived sessions such as `api-*` from request content, splitting related turns and attachment-only/image requests across separate API sessions.

## Correct Same-ID Behavior

Session routing is independent of whether a bearer token is configured. If the gateway requires authentication, it enforces that separately.

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

`src/server/openai-compat-api.test.ts` covers session headers with and without a bearer token. `src/server/chat-backends.ts` forwards `options.sessionId` into `openaiChat(...)` for streaming and non-streaming OpenAI-compatible calls.

## Credential-Free Manual Verification

Reuse the canonical gateway on `127.0.0.1:8642` and Dashboard on `127.0.0.1:9119`. Do not start duplicate backends.

1. Probe the existing services and Workspace endpoint without supplying credentials:

   ```bash
   curl -i --max-time 2 http://127.0.0.1:8642/health
   curl -i --max-time 2 http://127.0.0.1:9119/
   curl -i --max-time 2 http://127.0.0.1:3000/api/sessions
   ```

2. If Workspace is not already listening, start only Workspace on `:3000`:

   ```bash
   pnpm dev --host 127.0.0.1 --port 3000
   ```

   Do not use `pnpm start:all`; it also starts another gateway.

3. Use a disposable session and non-sensitive marker text:
   - send two `/api/send-stream` turns with the same Workspace `sessionKey` and confirm both remain under that same backend ID rather than separate `api-*` sessions;
   - send an image attachment with that same key and confirm it remains in the same session;
   - separately open an existing compressed session, refresh, and confirm Workspace selects the reported descendant tip rather than treating the old and new IDs as two portable same-ID turns.

A successful health or listener probe proves reachability only. Verify the actual chat path, and do not record credentials, transcript content, attachment data, or tool output.
