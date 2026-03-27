#!/bin/bash
# Simple Hermes chat loop — no TUI, works perfectly in embedded terminals
HERMES=~/.openclaw/workspace/hermes-agent/.venv/bin/hermes
# Use ANTHROPIC_API_KEY from environment — set in your .env or shell profile
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Warning: ANTHROPIC_API_KEY not set. Export it or add to ~/.hermes/.env"
fi

echo "Hermes Agent (simple mode) — type your message, press Enter"
echo "Type 'exit' to quit"
echo "---"

while true; do
  printf '\033[1;36m> \033[0m'
  read -r cmd
  [ "$cmd" = "exit" ] && break
  [ -z "$cmd" ] && continue
  $HERMES chat -q "$cmd" 2>/dev/null
  echo ""
done
