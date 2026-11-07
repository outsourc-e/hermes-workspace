#!/bin/bash
# launch-chrome-nano.sh — opens your installed Chrome 151 on M2 Max with Nano flags + Antigravity-friendly remote debugging
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME" ]; then echo "Chrome not found at $CHROME"; exit 1; fi
echo "[nano:launch] Starting Chrome with Gemini Nano flags (M2 Max 64GB optimized)..."
# Use a dedicated user-data-dir so flags don't pollute main profile; share with Antigravity by pointing it to this profile if needed
USER_DATA_DIR="$HOME/.chrome-nano-profile"
mkdir -p "$USER_DATA_DIR"
exec "$CHROME" \
  --user-data-dir="$USER_DATA_DIR" \
  --enable-features=OptimizationGuideOnDeviceModel,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultilingual \
  --optimization-guide-on-device-model \
  --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check \
  about:blank &
echo "[nano:launch] Chrome PID $! — then open chrome://flags and verify, or run pnpm nano:check"
echo "[nano:launch] Antigravity: set chromeDevToolsPort=9222 or point built-in browser to this profile"
