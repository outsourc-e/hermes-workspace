# agent-detector — Bifrost Plugin (switchable observe ↔ block)

Live-toggle without restart via `PUT /api/plugins/agent-detector` (see `transports/bifrost-http/handlers/plugins.go:380`).

## Modes

| `block_mode` | Behavior | When to use |
|---|---|---|
| `observe` | Never blocks. Stamps `x-bf-agent-*` headers, writes audit log (`would_block=1` when over threshold). Zero risk. | Initial rollout, shadow tuning |
| `block` | Returns `403 agent_blocked` (no provider cost) when `score >= threshold`. `AllowFallbacks=false`. | Production enforcement |

Global `block_mode` is overridden by (highest wins):
1. `x-bf-agent-block-override: observe|block` header if `allow_per_request_override=true`
2. Per VirtualKey metadata (governance sets `ctxKeyForcedMode`)
3. Global `config.block_mode`

## Config

```json
{
  "block_mode": "observe",
  "threshold": 0.75,
  "pre_threshold": 0.95,
  "allow_per_request_override": false,
  "block_response_code": 403,
  "block_message": "Request flagged as automated agent traffic",
  "sampling_rate": 1.0
}
```

Validation in `config.go:UnmarshalJSON`.

## Toggle live

```bash
# observe (safe default)
curl -X PUT http://localhost:8080/api/plugins/agent-detector \
 -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
 -d '{"enabled":true,"config":{"block_mode":"observe","threshold":0.75}}'

# flip to block (hot, <100ms via ReloadPlugin atomic swap)
curl -X PUT http://localhost:8080/api/plugins/agent-detector \
 -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
 -d '{"enabled":true,"config":{"block_mode":"block","threshold":0.8}}'

curl http://localhost:8080/api/plugins/agent-detector | jq .plugin.config.block_mode
```

Per-request test:

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
 -H "x-bf-agent-block-override: block" \
 -H "User-Agent: HeadlessChrome/124 Puppeteer" \
 -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}' -i
# -> 403 + x-bf-agent-verdict: agent + x-bf-agent-score + x-bf-agent-blocked:1 (in block)
# -> 200 + x-bf-agent-would-block:1 (in observe)
```

## Build

```bash
# as .so custom plugin (no bifrost fork)
go build -buildmode=plugin -o /tmp/agent-detector.so ./plugins/agent-detector
curl -X POST http://localhost:8080/api/plugins \
 -d '{"name":"agent-detector","enabled":true,"path":"/tmp/agent-detector.so","config":{"block_mode":"observe"}}'

# as builtin (add case in transports/bifrost-http/server/plugins.go:loadBuiltinPlugin)
```

## Headers added

- `x-bf-agent-verdict: human|agent|uncertain`
- `x-bf-agent-score: 0.000-1.000`
- `x-bf-agent-mode: observe|block`
- `x-bf-agent-blocked: 1` (only when actually blocked)
- `x-bf-agent-would-block: 1` (observe shadow)

## Next wiring

- Vector phase: inject `embeddingHit` in `PostLLMHook` from `framework/vectorstore`.
- LLM judge: call `ollama` provider via `core/bifrost.go` `EmbeddingRequest`/`ChatRequest`.
- Logstore: extend `TableLog` with `agent_*` columns or JSONB `extra`.
