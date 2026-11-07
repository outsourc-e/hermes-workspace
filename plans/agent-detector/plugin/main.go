// Package agentdetector implements a Bifrost plugin that detects AI agent traffic
// with a live-switchable block_mode: observe (default, never blocks) vs block (403).
//
// Wiring: see transports/bifrost-http/server/plugins.go:loadBuiltinPlugin and
// framework/plugins/loader.go:SharedObjectPluginLoader. Hot reload via
// transports/bifrost-http/handlers/plugins.go:380 updatePlugin -> ReloadPlugin swaps
// Config atomically (atomic.Pointer) so Pre/PostLLMHook have no mutex on 5k RPS path.
package agentdetector

import (
	"context"
	"fmt"
	"math/rand"
	"sync/atomic"

	"github.com/maximhq/bifrost/core/schemas"
)

// Plugin implements schemas.LLMPlugin + schemas.HTTPTransportPlugin + schemas.BasePlugin.
// It also supports PreMCPHook for agent-depth detection (core/mcp/agent.go).
type Plugin struct {
	cfg    atomic.Pointer[Config]
	logger schemas.Logger
	scorer *Scorer
}

const PluginName = "agent-detector"

// Init is called by server/plugins.go:InstantiatePlugin for builtin, or via
// framework/plugins loader for .so. raw is the JSON-decoded TablePlugin.Config map.
func Init(_ context.Context, raw any, logger schemas.Logger) (*Plugin, error) {
	p := &Plugin{logger: logger, scorer: &Scorer{}}
	cfg := defaultConfig()
	if raw != nil {
		// Reuse the same helper builtins use: transports/bifrost-http/server/plugins.go:MarshalPluginConfig
		// We do manual decode to avoid import cycle.
		if m, ok := raw.(map[string]any); ok {
			b, _ := marshalMap(m)
			var decoded Config
			if err := decoded.UnmarshalJSON(b); err != nil {
				return nil, fmt.Errorf("agent-detector: invalid config: %w", err)
			}
			cfg = &decoded
		} else if c, ok := raw.(*Config); ok && c != nil {
			cfg = c
		}
	}
	p.cfg.Store(cfg)
	if logger != nil {
		logger.Info("agent-detector initialized block_mode=%s threshold=%.2f pre=%.2f", cfg.BlockMode, cfg.Threshold, cfg.PreThreshold)
	}
	return p, nil
}

// UpdateConfig swaps config live. Called from ReloadPlugin path without restarting process.
// Exposed so server/plugins.go can call it when the plugin is already loaded.
func (p *Plugin) UpdateConfig(next *Config) {
	if next == nil {
		return
	}
	p.cfg.Store(next)
	if p.logger != nil {
		p.logger.Info("agent-detector config reloaded block_mode=%s threshold=%.2f", next.BlockMode, next.Threshold)
	}
}

func (p *Plugin) GetName() string { return PluginName }
func (p *Plugin) Cleanup() error  { return nil }

// --- Config helpers for the framework's Normalize/Redact hooks ---

// MarshalForStorage implements plugins.ConfigMarshallerPlugin if the loader checks for it.
// Returning JSON bytes ensures env var refs etc. survive DB round-trip (handlers/plugins.go:333).
func (p *Plugin) MarshalForStorage() ([]byte, error) { return p.cfg.Load().MarshalForStorage() }
func (p *Plugin) Redacted() any                      { return p.cfg.Load().Redacted() }

// effectiveMode resolves per-request override > global. Never reads DB here — only context.
func (p *Plugin) effectiveMode(ctx *schemas.BifrostContext) BlockMode {
	if ctx != nil {
		if v, ok := ctx.Value(ctxKeyForcedMode).(BlockMode); ok && v.Valid() {
			return v
		}
		if v, ok := ctx.Value(ctxKeyForcedMode).(string); ok {
			bm := BlockMode(v)
			if bm.Valid() {
				return bm
			}
		}
		// Per-VK override could be set by governance plugin earlier in PreLLMHook chain
		// if you wire: governance sets ctxKeyForcedMode from VK metadata. Fallback here.
	}
	return p.cfg.Load().BlockMode
}

// --- HTTPTransportPlugin ---

func (p *Plugin) HTTPTransportPreAuthHook(_ *schemas.BifrostContext, _ *schemas.HTTPRequest) (*schemas.HTTPResponse, error) {
	return nil, nil
}

func (p *Plugin) HTTPTransportPreHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest) (*schemas.HTTPResponse, error) {
	if ctx == nil || req == nil {
		return nil, nil
	}
	cfg := p.cfg.Load()
	sig := extractSignalsHTTP(req, ctx)
	ctx.SetValue(ctxKeySignals, sig)

	// Per-request header override (only when allowed)
	if cfg.AllowPerRequestOverride != nil && *cfg.AllowPerRequestOverride {
		if v := req.CaseInsensitiveHeaderLookup("x-bf-agent-block-override"); v == BlockModeObserve || v == BlockModeBlock {
			ctx.SetValue(ctxKeyForcedMode, BlockMode(v))
		}
	}
	return nil, nil
}

func (p *Plugin) HTTPTransportPostHook(ctx *schemas.BifrostContext, _ *schemas.HTTPRequest, resp *schemas.HTTPResponse) error {
	if ctx == nil || resp == nil {
		return nil
	}
	if resp.Headers == nil {
		resp.Headers = map[string]string{}
	}
	if v, ok := ctx.Value(ctxKeyVerdict).(Verdict); ok && v != "" {
		resp.Headers["x-bf-agent-verdict"] = string(v)
	}
	if v, ok := ctx.Value(ctxKeyScore).(float64); ok {
		resp.Headers["x-bf-agent-score"] = fmt.Sprintf("%.3f", v)
	}
	if blocked, ok := ctx.Value(ctxKeyBlocked).(bool); ok && blocked {
		resp.Headers["x-bf-agent-blocked"] = "1"
	}
	if would, ok := ctx.Value(ctxKeyWouldBlock).(bool); ok && would {
		resp.Headers["x-bf-agent-would-block"] = "1"
	}
	resp.Headers["x-bf-agent-mode"] = string(p.effectiveMode(ctx))
	return nil
}

func (p *Plugin) HTTPTransportStreamChunkHook(_ *schemas.BifrostContext, _ *schemas.HTTPRequest, chunk *schemas.BifrostStreamChunk) (*schemas.BifrostStreamChunk, error) {
	// Never block mid-stream — would corrupt SSE. Only observe.
	return chunk, nil
}

// --- LLMPlugin ---

func (p *Plugin) PreRequestHook(_ *schemas.BifrostContext, _ *schemas.BifrostRequest) error {
	return nil
}

func (p *Plugin) PreLLMHook(ctx *schemas.BifrostContext, req *schemas.BifrostRequest) (*schemas.BifrostRequest, *schemas.LLMPluginShortCircuit, error) {
	if ctx == nil || req == nil {
		return req, nil, nil
	}
	// Enrich signals with LLM fields
	if sig, ok := ctx.Value(ctxKeySignals).(Signals); ok {
		enrichSignalsFromRequest(&sig, req)
		ctx.SetValue(ctxKeySignals, sig)
		// Fast pre-LLM block (0ms tier) — only in block mode and only for high-confidence header signals
		if p.effectiveMode(ctx) == BlockModeBlock {
			pre := p.scorer.PreScore(sig)
			ctx.SetValue(ctxKeyPreScore, pre)
			if pre >= p.cfg.Load().PreThreshold {
				ctx.SetValue(ctxKeyVerdict, VerdictAgent)
				ctx.SetValue(ctxKeyScore, pre)
				ctx.SetValue(ctxKeyBlocked, true)
				return nil, shortCircuitResponse(p.cfg.Load(), pre, VerdictAgent, "pre_llm"), nil
			}
		}
	}
	return req, nil, nil
}

func (p *Plugin) PostLLMHook(ctx *schemas.BifrostContext, resp *schemas.BifrostResponse, berr *schemas.BifrostError) (*schemas.BifrostResponse, *schemas.BifrostError, error) {
	if ctx == nil {
		return resp, berr, nil
	}
	// If upstream already errored and it's not our block, still score for audit
	sig, _ := ctx.Value(ctxKeySignals).(Signals)
	// TODO: wire embeddingHit + llmJudgeScore from vectorstore/llm call when ready.
	// Phase 1: rules only (no extra latency).
	score, verdict := p.scorer.Score(sig, false, nil)
	ctx.SetValue(ctxKeyScore, score)
	ctx.SetValue(ctxKeyVerdict, verdict)

	// Respect sampling in observe mode
	cfg := p.cfg.Load()
	if cfg.SamplingRate < 1.0 && cfg.BlockMode == BlockModeObserve {
		if rand.Float64() > cfg.SamplingRate { //nolint:gosec
			// Still set headers, skip audit log write
			ctx.SetValue(ctxKeyWouldBlock, verdict == VerdictAgent && score >= cfg.Threshold)
			return resp, berr, nil
		}
	}

	mode := p.effectiveMode(ctx)
	shouldBlock := verdict == VerdictAgent && score >= cfg.Threshold

	if mode == BlockModeBlock && shouldBlock {
		// Preserve original status for audit
		if resp != nil {
			ctx.SetValue(ctxKeyOriginalStatus, 200)
		} else if berr != nil && berr.StatusCode != nil {
			ctx.SetValue(ctxKeyOriginalStatus, *berr.StatusCode)
		}
		ctx.SetValue(ctxKeyBlocked, true)
		// Log before short-circuit so logging plugin in PostLLMHook chain sees blocked=true
		if p.logger != nil {
			p.logger.Warn("agent-detector BLOCK rid=%s mode=block score=%.3f verdict=%s model=%s", sig.RequestID, score, verdict, sig.Model)
		}
		ctx.Log(schemas.LogLevelWarn, fmt.Sprintf("agent-detector blocked score=%.3f verdict=%s", score, verdict))
		return nil, shortCircuitError(cfg, score, verdict), nil
	}

	// Observe mode: never block, but stamp would_block for UI/shadow analysis
	if mode == BlockModeObserve && shouldBlock {
		ctx.SetValue(ctxKeyWouldBlock, true)
		if p.logger != nil {
			p.logger.Info("agent-detector OBSERVE rid=%s score=%.3f verdict=%s would_block=1", sig.RequestID, score, verdict)
		}
		ctx.Log(schemas.LogLevelInfo, fmt.Sprintf("agent-detector would_block score=%.3f verdict=%s", score, verdict))
	}
	return resp, berr, nil
}

// --- MCPPlugin (agent depth) ---

func (p *Plugin) PreMCPHook(ctx *schemas.BifrostContext, req *schemas.BifrostMCPRequest) (*schemas.BifrostMCPRequest, *schemas.MCPPluginShortCircuit, error) {
	// Example: if MCP tool loop depth > threshold, boost score. Real wiring reads ctx values set by core/mcp/agent.go
	return req, nil, nil
}
func (p *Plugin) PostMCPHook(ctx *schemas.BifrostContext, resp *schemas.BifrostMCPResponse, berr *schemas.BifrostError) (*schemas.BifrostMCPResponse, *schemas.BifrostError, error) {
	return resp, berr, nil
}

// --- helpers ---

func shortCircuitError(cfg *Config, score float64, verdict Verdict) *schemas.BifrostError {
	code := cfg.BlockResponseCode
	if code == 0 {
		code = 403
	}
	msg := cfg.BlockMessage
	if msg == "" {
		msg = "Request flagged as automated agent traffic"
	}
	// Include score/verdict in ExtraFields so logging/otel can surface without parsing message.
	return &schemas.BifrostError{
		Type:       "agent_blocked",
		Message:    msg,
		StatusCode: &code,
		// Do not fallback — this is a policy decision, not a transient provider error.
		AllowFallbacks: boolPtr(false),
		ExtraFields: schemas.BifrostErrorExtraFields{
			// RawResponse carries structured reason for the audit log writer (plugins/logging).
			RawResponse: []byte(fmt.Sprintf(`{"agent_score":%.3f,"agent_verdict":"%s","agent_mode":"block"}`, score, verdict)),
		},
	}
}

func shortCircuitResponse(cfg *Config, score float64, verdict Verdict, stage string) *schemas.LLMPluginShortCircuit {
	return &schemas.LLMPluginShortCircuit{
		Response: nil,
		Error:    shortCircuitError(cfg, score, verdict),
	}
}

// marshalMap helper without importing transports lib.
func marshalMap(m map[string]any) ([]byte, error) {
	// Use sonic via stdlib fallback to avoid cycle.
	// Minimal: use encoding/json for this helper — sonic not required here.
	// Keep it simple to avoid extra deps.
	b, err := sonic.Marshal(m)
	if err != nil {
		return nil, err
	}
	return b, nil
}
