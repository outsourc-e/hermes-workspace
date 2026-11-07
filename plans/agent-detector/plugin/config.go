package agentdetector

import (
	"encoding/json"
	"fmt"

	"github.com/bytedance/sonic"
)

// BlockMode controls enforcement. Switchable live via PUT /api/plugins/agent-detector.
type BlockMode string

const (
	BlockModeObserve BlockMode = "observe" // log + header only, never block (default, safe for rollout)
	BlockModeBlock   BlockMode = "block"   // hard block with 403 when score >= threshold
)

func (m BlockMode) Valid() bool { return m == BlockModeObserve || m == BlockModeBlock }

// Config is persisted as TablePlugin.Config JSON via handlers/plugins.go:342 normalizePluginConfig.
// All fields are JSON-serializable. No secrets — Redacted() is identity.
type Config struct {
	// Global mode. Overridden by per-VK and per-request header when allowed.
	BlockMode BlockMode `json:"block_mode"`
	// Threshold for post-LLM scoring. Block/flag only when score >= threshold.
	Threshold float64 `json:"threshold"`
	// PreThreshold for pre-LLM fast path (header/behavioral only, no LLM cost). Only in block mode.
	PreThreshold float64 `json:"pre_threshold"`
	// Allow x-bf-agent-block-override: observe|block header to override for testing.
	AllowPerRequestOverride *bool `json:"allow_per_request_override,omitempty"`
	// HTTP status for blocked requests.
	BlockResponseCode int `json:"block_response_code"`
	// JSON message for blocked requests.
	BlockMessage string `json:"block_message"`
	// When >0, observe mode samples audit logs (1.0 = 100%). 0 means log all.
	SamplingRate float64 `json:"sampling_rate"`
}

func boolPtr(b bool) *bool { return &b }

func defaultConfig() *Config {
	return &Config{
		BlockMode:               BlockModeObserve,
		Threshold:               0.75,
		PreThreshold:            0.95,
		AllowPerRequestOverride: boolPtr(false),
		BlockResponseCode:       403,
		BlockMessage:            "Request flagged as automated agent traffic",
		SamplingRate:            1.0,
	}
}

// UnmarshalJSON applies defaults and validation. Called via MarshalPluginConfig[Config]
// in transports/bifrost-http/server/plugins.go:loadBuiltinPlugin.
func (c *Config) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		*c = *defaultConfig()
		return nil
	}
	type alias Config
	aux := &struct {
		*alias
	}{alias: (*alias)(c)}
	// Start from defaults so omitted fields keep safe values.
	*c = *defaultConfig()
	if err := sonic.Unmarshal(data, aux); err != nil {
		return fmt.Errorf("agent-detector config: %w", err)
	}
	if !c.BlockMode.Valid() {
		return fmt.Errorf("block_mode must be %q or %q, got %q", BlockModeObserve, BlockModeBlock, c.BlockMode)
	}
	if c.Threshold < 0 || c.Threshold > 1 {
		return fmt.Errorf("threshold must be in [0,1], got %v", c.Threshold)
	}
	if c.PreThreshold < 0 || c.PreThreshold > 1 {
		return fmt.Errorf("pre_threshold must be in [0,1], got %v", c.PreThreshold)
	}
	if c.BlockResponseCode < 400 || c.BlockResponseCode > 599 {
		return fmt.Errorf("block_response_code must be 4xx/5xx, got %d", c.BlockResponseCode)
	}
	if c.SamplingRate < 0 || c.SamplingRate > 1 {
		return fmt.Errorf("sampling_rate must be in [0,1], got %v", c.SamplingRate)
	}
	return nil
}

func (c *Config) MarshalJSON() ([]byte, error) {
	type alias Config
	return json.Marshal((*alias)(c))
}

// MarshalForStorage is called by handlers/plugins.go:333 via NormalizePluginConfig.
func (c *Config) MarshalForStorage() ([]byte, error) { return sonic.Marshal(c) }

// Redacted returns API-safe view. No secrets here.
func (c *Config) Redacted() *Config { return c }
