# Agent Detector — Switchable observe ↔ block

Boilerplate generated at `plans/agent-detector/plugin/` (mirrors `/tmp/bifrost-analysis/bifrost/plugins/agent-detector/`).
Copy into upstream bifrost as `plugins/agent-detector/` to build. No fork required for .so mode.

## What was built

| File | Purpose | Hot path? |
|------|---------|-----------|
| `go.mod` | Own module `github.com/maximhq/bifrost/plugins/agent-detector`, go1.27 | - |
| `config.go` | `BlockMode` enum + `Config` with live validation (`UnmarshalJSON` called via `MarshalPluginConfig[Config]` in `transports/bifrost-http/server/plugins.go:140`) | read via `atomic.Pointer` |
| `signals.go` | Small `Signals` struct + `BifrostContext` keys (`agent-detector:*` not in `core/schemas/context.go:19` reservedKeys, so safe after `BlockRestrictedWrites`) | per-request |
| `scorer.go` | Pure ensemble `Score()` + `PreScore()` 0ms tier, deterministic, 3-decimal rounding | pure |
| `main.go` | `Plugin` implements `LLMPlugin` + `HTTPTransportPlugin` + `MCPPlugin` + `Cleanup`. `HTTPTransportPreHook` enriches, `PreLLMHook` fast pre-block, `PostLLMHook` observe vs block branch, `HTTPTransportPostHook` stamps `x-bf-agent-*` headers. `atomic.Pointer[Config]` swap via `UpdateConfig` on `ReloadPlugin` (`transports/bifrost-http/handlers/plugins.go:514`) | 5k RPS |
| `plugin_test.go` | 4 tests: observe passthrough, block 403, header override, scorer determinism | - |
| `version.go` | `0.1.0` | - |

## How the switch works (no restart)

```
PUT /api/plugins/agent-detector  {block_mode:"block"} 
 -> handlers/plugins.go:380 updatePlugin 
 -> normalizePluginConfig() validates via config.go:UnmarshalJSON
 -> configstore.UpdatePlugin(DB) 
 -> pluginsLoader.ReloadPlugin() 
 -> server/plugins.go:InstantiatePlugin swaps atomic.Pointer -> next request sees new mode in <100ms
```

Per-request override: `x-bf-agent-block-override: observe|block` when `allow_per_request_override=true`. Per-VK: have `governance` plugin set `ctx.SetValue(ctxKeyForcedMode, vk.BlockMode)` in its own `PreLLMHook` before this plugin runs (order via `lib.ChainMiddlewares` placement `pre_builtin`/`post_builtin` in `core/schemas/plugin.go:390`).

## Verify (when Go toolchain available)

```bash
cd /tmp/bifrost-analysis/bifrost/plugins/agent-detector
go vet ./...
go test ./... -count=1 -run Test
```

Manual E2E (already possible with running bifrost http gateway):

```bash
# Build as .so
go build -buildmode=plugin -o /tmp/agent-detector.so ./plugins/agent-detector
curl -X POST http://localhost:8080/api/plugins -d '{"name":"agent-detector","enabled":true,"path":"/tmp/agent-detector.so","config":{"block_mode":"observe"}}'

# Flip live
curl -X PUT http://localhost:8080/api/plugins/agent-detector -d '{"enabled":true,"config":{"block_mode":"block","threshold":0.8}}'
curl http://localhost:8080/api/plugins/agent-detector | jq .plugin.config
```

## Next wires (not in boilerplate yet, see PLAN.md Phase 2)

- VectorStore: pass `embeddingHit bool` from `framework/vectorstore` GetNearest in `PostLLMHook`.
- LLM judge: inject small model call via `core/bifrost.go:EmbeddingRequest`, write into `llmJudgeScore *float64` before `Score()`.
- Logstore: add `agent_score`/`agent_verdict`/`agent_blocked` columns to `framework/logstore` ClickHouse schema or JSONB `extra`.
- UI: toggle in `ui/app/workspace/plugins/` using `useUpdatePluginMutation` (same as other plugins).

## Safety

- Default `observe`. `block` only when `score >= threshold` and `mode==block`. `AllowFallbacks=false` so no silent retry.
- Streaming never blocked mid-chunk (`HTTPTransportStreamChunkHook` passthrough, see `framework/streaming/accumulator.go` pattern).
- No stream buffers in context (AGENTS.md hard rule) — only scalar Signals.
