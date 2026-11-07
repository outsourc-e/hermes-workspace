#!/usr/bin/env bash
# cos-chat.sh — open an interactive chief-of-staff session on the DAY model.
# Voice path: speak while this terminal is focused (Holdor dictates) or use the
# Hermes Workspace PWA voice input locally (http://127.0.0.1:3001).
# For remote devices over Tailscale, see docs/tailscale-optional.md.
# The nightly batch brain (Qwen3.8) is separate — this is your always-awake deputy.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.hermes/hermes-agent/venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="${COS_SESSION:-chief-of-staff}"
exec hermes chat --create-if-missing --continue "$SESSION" "$@"
