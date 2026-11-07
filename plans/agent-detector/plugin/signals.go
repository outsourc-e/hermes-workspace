package agentdetector

import (
	"strings"
	"time"

	"github.com/maximhq/bifrost/core/schemas"
)

// Signals are the small, fixed-size features extracted on the hot path.
// Never store stream payloads here — only scalars/IDs (AGENTS.md:115).
type Signals struct {
	UserAgent        string
	VirtualKeyID     string
	Model            string
	Provider         schemas.ModelProvider
	ToolChoice       string
	Temperature      *float64
	HasSystemPrompt  bool
	MessageCount     int
	MCPClientCount   int
	ToolCallCount    int
	RequestID        string
	ObservedAt       time.Time
}

// Verdict is the scored outcome attached to BifrostContext after PostLLMHook.
type Verdict string

const (
	VerdictHuman     Verdict = "human"
	VerdictAgent     Verdict = "agent"
	VerdictUncertain Verdict = "uncertain"
)

// Context keys for this plugin only — not in reservedKeys map (core/schemas/context.go:19),
// so SetValue is safe after BlockRestrictedWrites.
const (
	ctxKeySignals          schemas.BifrostContextKey = "agent-detector:signals"
	ctxKeyScore            schemas.BifrostContextKey = "agent-detector:score"
	ctxKeyVerdict          schemas.BifrostContextKey = "agent-detector:verdict"
	ctxKeyBlocked          schemas.BifrostContextKey = "agent-detector:blocked"
	ctxKeyForcedMode       schemas.BifrostContextKey = "agent-detector:forced_mode"
	ctxKeyWouldBlock       schemas.BifrostContextKey = "agent-detector:would_block"
	ctxKeyPreScore         schemas.BifrostContextKey = "agent-detector:pre_score"
	ctxKeyOriginalStatus   schemas.BifrostContextKey = "agent-detector:orig_status"
)

// extractSignals builds Signals from HTTP + BifrostContext (cheap, runs in HTTPTransportPreHook/PreLLMHook).
func extractSignalsHTTP(req *schemas.HTTPRequest, ctx *schemas.BifrostContext) Signals {
	s := Signals{ObservedAt: time.Now()}
	if req != nil {
		s.UserAgent = req.CaseInsensitiveHeaderLookup("user-agent")
		// Normalize UA for rules
		s.UserAgent = strings.TrimSpace(s.UserAgent)
	}
	if ctx != nil {
		if v, _ := ctx.Value(schemas.BifrostContextKeyRequestID).(string); v != "" {
			s.RequestID = v
		}
		if v, _ := ctx.Value(schemas.BifrostContextKeyGovernanceVirtualKeyID).(string); v != "" {
			s.VirtualKeyID = v
		} else if v, _ := ctx.Value(schemas.BifrostContextKeyVirtualKey).(string); v != "" {
			s.VirtualKeyID = v
		}
	}
	return s
}

func enrichSignalsFromRequest(s *Signals, req *schemas.BifrostRequest) {
	if req == nil || s == nil {
		return
	}
	s.Model = req.Model
	s.Provider = req.Provider
	if req.Params != nil {
		s.Temperature = req.Params.Temperature
		if req.Params.ToolChoice != nil {
			s.ToolChoice = string(*req.Params.ToolChoice)
		}
	}
	// Chat messages
	if req.ChatRequest != nil {
		s.MessageCount = len(req.ChatRequest.Messages)
		for _, m := range req.ChatRequest.Messages {
			if m.Role == "system" && m.Content != nil {
				s.HasSystemPrompt = true
				break
			}
		}
		if req.ChatRequest.Tools != nil {
			s.ToolCallCount = len(req.ChatRequest.Tools)
		}
	}
	// MCP clients count if present on context is added by caller after extract
}
