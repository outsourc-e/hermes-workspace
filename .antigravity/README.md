# Antigravity — AI Protect Setup (M2 Max 64GB + Chrome 151)

This folder documents Antigravity integration for AI Protect.

## 1. Chrome DevTools MCP (docs/devtools/agents/get-started)

Antigravity has browser sub-agent built-in (Antigravity 2.0). For AI Protect:

- Command palette → `/browser Navigate to chrome://on-device-internals` → verify `available`
- Or terminal: `npx -y chrome-devtools-mcp@latest --help` → see `chrome-devtools-mcp` README.

If you use Gemini CLI inside Antigravity:
```bash
gemini extensions install --auto-update https://github.com/ChromeDevTools/chrome-devtools-mcp
```

## 2. Built-in browser flags
Launch with Nano flags once (flags persist in profile `~/.chrome-nano-profile`):
```bash
pnpm nano:launch   # opens chrome --enable-features=OptimizationGuideOnDeviceModel,PromptAPIForGeminiNano --remote-debugging-port=9222
# then in Antigravity: attach to 9222 via .vscode/launch.json "Antigravity: Attach to Chrome"
```

## 3. Tasks
Use `Cmd+Shift+P → Tasks: Run Task` → `nano:check`, `test:live (M2 Max)`, `chrome-devtools-mcp: start`

