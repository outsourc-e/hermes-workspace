package agentdetector

import (
	"math"
	"strings"
)

// Scorer is a pure, side-effect-free ensemble. Keep it deterministic for tests.
type Scorer struct{}

// Score returns score∈[0,1] and verdict. Weights mirror plan: 0.4 rules + 0.3 embedding + 0.3 llmJudge.
func (s *Scorer) Score(sig Signals, embeddingHit bool, llmJudgeScore *float64) (float64, Verdict) {
	ruleScore := s.ruleScore(sig)
	embScore := 0.0
	if embeddingHit {
		embScore = 0.85 // placeholder; real vector DB path injects similarity
	}
	judgeScore := 0.5
	if llmJudgeScore != nil {
		judgeScore = clamp(*llmJudgeScore, 0, 1)
	}

	// Weighted ensemble. When embedding/judge unavailable, renormalize.
	hasEmb := embeddingHit
	hasJudge := llmJudgeScore != nil
	wRule, wEmb, wJudge := 0.4, 0.3, 0.3
	if !hasEmb && !hasJudge {
		wRule = 1.0
		wEmb, wJudge = 0, 0
	} else if !hasEmb {
		wRule, wJudge = 0.6, 0.4
		wEmb = 0
	} else if !hasJudge {
		wRule, wEmb = 0.6, 0.4
		wJudge = 0
	}
	score := wRule*ruleScore + wEmb*embScore + wJudge*judgeScore
	score = clamp(score, 0, 1)

	var verdict Verdict
	switch {
	case score >= 0.75:
		verdict = VerdictAgent
	case score >= 0.45:
		verdict = VerdictUncertain
	default:
		verdict = VerdictHuman
	}
	return math.Round(score*1000) / 1000, verdict // 3-decimal stable for headers
}

// ruleScore: heuristics only, 0-1. Tuned conservative for observe rollout.
func (s *Scorer) ruleScore(sig Signals) float64 {
	score := 0.0

	// Tool-heavy + high depth proxy: many tools + tool_choice=required/auto with system prompt
	if sig.ToolCallCount >= 6 {
		score += 0.35
	} else if sig.ToolCallCount >= 3 {
		score += 0.20
	}
	if strings.EqualFold(sig.ToolChoice, "required") || strings.EqualFold(sig.ToolChoice, "auto") {
		if sig.HasSystemPrompt && sig.MessageCount <= 3 {
			score += 0.15
		}
	}
	// Temperature 0 + deterministic signals
	if sig.Temperature != nil && *sig.Temperature == 0 {
		score += 0.10
	}
	// Headless / automation UA
	ua := strings.ToLower(sig.UserAgent)
	if strings.Contains(ua, "headless") || strings.Contains(ua, "puppeteer") || strings.Contains(ua, "playwright") || strings.Contains(ua, "selenium") {
		score += 0.40
	}
	// No UA or generic SDK UA with tool use -> suspicious
	if ua == "" && sig.ToolCallCount > 0 {
		score += 0.15
	}
	// Model known for agent loops (keep generic, avoid brittle)
	if strings.Contains(strings.ToLower(sig.Model), "computer-use") {
		score += 0.25
	}

	return clamp(score, 0, 1)
}

// PreScore is the fast 0ms tier used in PreLLMHook before LLM cost. Only headers/behavior.
func (s *Scorer) PreScore(sig Signals) float64 {
	// Only UA + empty VK + burst proxy (burst checked via caller using telemetry/governance counters)
	score := 0.0
	ua := strings.ToLower(sig.UserAgent)
	if strings.Contains(ua, "headless") || strings.Contains(ua, "puppeteer") {
		score += 0.90
	}
	if sig.VirtualKeyID == "" && sig.ToolCallCount >= 6 {
		score += 0.30
	}
	return clamp(score, 0, 1)
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
