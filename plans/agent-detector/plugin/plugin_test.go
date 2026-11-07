package agentdetector

import (
	"context"
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
)

func mustInit(t *testing.T, mode BlockMode, threshold float64) *Plugin {
	t.Helper()
	cfg := defaultConfig()
	cfg.BlockMode = mode
	cfg.Threshold = threshold
	p, err := Init(context.Background(), map[string]any{
		"block_mode": string(mode),
		"threshold":  threshold,
	}, nil)
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	return p
}

func TestObserveNeverBlocks(t *testing.T) {
	p := mustInit(t, BlockModeObserve, 0.5)
	ctx := schemas.NewBifrostContext(context.Background(), schemas.NoDeadline)
	ctx.SetValue(schemas.BifrostContextKeyRequestID, "rid-observe")
	ctx.SetValue(ctxKeySignals, Signals{UserAgent: "HeadlessChrome", ToolCallCount: 6, HasSystemPrompt: true, ToolChoice: "required", MessageCount: 1})
	resp := &schemas.BifrostResponse{}
	gotResp, gotErr, err := p.PostLLMHook(ctx, resp, nil)
	if err != nil {
		t.Fatalf("PostLLMHook err %v", err)
	}
	if gotErr != nil {
		t.Fatalf("observe must not return error, got %v", gotErr)
	}
	if gotResp != resp {
		t.Fatalf("observe must pass through response")
	}
	if blocked, _ := ctx.Value(ctxKeyBlocked).(bool); blocked {
		t.Fatalf("observe must not set blocked")
	}
	if would, _ := ctx.Value(ctxKeyWouldBlock).(bool); !would {
		t.Fatalf("observe should set would_block when over threshold")
	}
}

func TestBlockModeBlocks(t *testing.T) {
	p := mustInit(t, BlockModeBlock, 0.5)
	ctx := schemas.NewBifrostContext(context.Background(), schemas.NoDeadline)
	ctx.SetValue(schemas.BifrostContextKeyRequestID, "rid-block")
	ctx.SetValue(ctxKeySignals, Signals{UserAgent: "puppeteer", ToolCallCount: 6, HasSystemPrompt: true, ToolChoice: "required", MessageCount: 1})
	resp := &schemas.BifrostResponse{}
	_, gotErr, _ := p.PostLLMHook(ctx, resp, nil)
	if gotErr == nil {
		t.Fatalf("block must return BifrostError")
	}
	if gotErr.StatusCode == nil || *gotErr.StatusCode != 403 {
		t.Fatalf("expected 403 got %v", gotErr.StatusCode)
	}
	if gotErr.AllowFallbacks != nil && *gotErr.AllowFallbacks {
		t.Fatalf("blocked error must have AllowFallbacks=false")
	}
}

func TestPerRequestOverride(t *testing.T) {
	p := mustInit(t, BlockModeObserve, 0.5)
	// Flip to block via header override when allowed
	cfg := p.cfg.Load()
	cfg.AllowPerRequestOverride = boolPtr(true)
	p.UpdateConfig(cfg)

	ctx := schemas.NewBifrostContext(context.Background(), schemas.NoDeadline)
	ctx.SetValue(schemas.BifrostContextKeyRequestID, "rid-override")
	ctx.SetValue(ctxKeySignals, Signals{UserAgent: "puppeteer", ToolCallCount: 6, HasSystemPrompt: true, ToolChoice: "required", MessageCount: 1})
	ctx.SetValue(ctxKeyForcedMode, BlockModeBlock)

	_, gotErr, _ := p.PostLLMHook(ctx, &schemas.BifrostResponse{}, nil)
	if gotErr == nil {
		t.Fatalf("override to block must block")
	}
}

func TestConfigValidation(t *testing.T) {
	var c Config
	if err := c.UnmarshalJSON([]byte(`{"block_mode":"invalid"}`)); err == nil {
		t.Fatalf("expected validation error for bad block_mode")
	}
}

func TestScorerDeterministic(t *testing.T) {
	s := &Scorer{}
	sig := Signals{UserAgent: "HeadlessChrome/124", ToolCallCount: 6, HasSystemPrompt: true, ToolChoice: "required", MessageCount: 2}
	score, verdict := s.Score(sig, false, nil)
	if verdict != VerdictAgent {
		t.Fatalf("expected agent got %s score %v", verdict, score)
	}
	sig2 := Signals{UserAgent: "Mozilla/5.0", ToolCallCount: 0, MessageCount: 1}
	_, v2 := s.Score(sig2, false, nil)
	if v2 != VerdictHuman {
		t.Fatalf("expected human got %s", v2)
	}
}
