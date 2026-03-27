#!/bin/bash
# Simple Hermes chat loop — no TUI, works perfectly in embedded terminals
HERMES=~/.openclaw/workspace/hermes-agent/.venv/bin/hermes
export ANTHROPIC_API_KEY=$(grep -o 'sk-ant-[^"]*' ~/.hermes/auth-profiles.json 2>/dev/null | head -1)

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
