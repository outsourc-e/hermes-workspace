#!/usr/bin/env bash
# Project Workspace — one-liner installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/outsourc-e/hermes-workspace/main/install.sh | bash
#
# What it does:
#   1. Verifies Node 22+, git, pnpm
#   2. Installs hermes-agent via Nous's official upstream installer
#   3. Clones hermes-workspace
#   4. Sets up .env, enables the Hermes HTTP API, installs deps,
#      and links bundled skills
#
# Re-runnable. Will skip anything already installed.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/outsourc-e/hermes-workspace.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/hermes-workspace}"
GATEWAY_PORT="${GATEWAY_PORT:-8642}"
NOUS_INSTALLER_URL="${NOUS_INSTALLER_URL:-https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh}"

# ─── helpers ──────────────────────────────────────────────────────────────

cyan()   { printf "\033[36m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

need() { command -v "$1" &>/dev/null || { red "Missing: $1"; red "$2"; exit 1; }; }

banner() {
  cat <<'EOF'

   ╭────────────────────────────────────────────╮
   │  PROJECT WORKSPACE — zero-fork installer   │
   │  outsourc-e/hermes-workspace               │
   ╰────────────────────────────────────────────╯

EOF
}

# ensure_path: prepend a dir to PATH for this shell if it's not already there
ensure_path() {
  local candidate="$1"
  [[ -d "$candidate" ]] || return 0
  case ":$PATH:" in
    *":$candidate:"*) ;;
    *) export PATH="$candidate:$PATH" ;;
  esac
}

ensure_env_key() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp

  mkdir -p "$(dirname "$file")"
  tmp="$(mktemp)"

  if [[ -f "$file" ]]; then
    awk -v key="$key" -v value="$value" '
      BEGIN { found = 0 }
      index($0, key "=") == 1 {
        print key "=" value
        found = 1
        next
      }
      { print }
      END {
        if (!found) {
          if (NR > 0) print ""
          print key "=" value
        }
      }
    ' "$file" > "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" > "$tmp"
  fi

  mv "$tmp" "$file"
}

# ─── preflight ────────────────────────────────────────────────────────────

banner
cyan "→ Checking prerequisites…"

need node "Install Node 22+: https://nodejs.org/"
node_major=$(node -v | sed -E 's/v([0-9]+).*/\1/')
if [[ "$node_major" -lt 22 ]]; then
  red "Node $node_major detected; need 22+."
  exit 1
fi
green "  Node $(node -v) ✓"

need git "Install git: https://git-scm.com/"
green "  git $(git --version | awk '{print $3}') ✓"

need curl "Install curl (usually: apt install curl / brew install curl)"
green "  curl ✓"

if ! command -v pnpm &>/dev/null; then
  yellow "  pnpm not found — installing via corepack…"
  corepack enable 2>/dev/null || npm install -g pnpm
fi
green "  pnpm $(pnpm --version) ✓"

# ─── install hermes-agent (delegate to Nous upstream installer) ──────────
# hermes-agent is NOT on PyPI. It installs from source via Nous's own
# script, which handles PEP 668, uv, Python toolchain, Termux, etc. We
# only need to ensure `hermes` ends up on PATH before continuing.

cyan "→ Installing hermes-agent (via Nous upstream installer)…"
# Pick up hermes if it was installed in a prior run but not on PATH yet
ensure_path "$HOME/.hermes/bin"
ensure_path "$HOME/.local/bin"

if command -v hermes &>/dev/null; then
  green "  hermes-agent already installed ✓ ($(command -v hermes))"
else
  yellow "  Delegating to: $NOUS_INSTALLER_URL"
  if ! curl -fsSL "$NOUS_INSTALLER_URL" | bash; then
    red "  Nous installer failed. See its output above for details."
    red "  You can retry manually:"
    red "    curl -fsSL $NOUS_INSTALLER_URL | bash"
    exit 1
  fi
  # Nous typically installs `hermes` to ~/.hermes/bin or ~/.local/bin
  ensure_path "$HOME/.hermes/bin"
  ensure_path "$HOME/.local/bin"
  if ! command -v hermes &>/dev/null; then
    red "  hermes-agent installed, but 'hermes' is not on PATH in this shell."
    yellow "  Open a new shell (or: source ~/.bashrc / ~/.zshrc) and re-run:"
    yellow "    curl -fsSL https://hermes-workspace.com/install.sh | bash"
    exit 1
  fi
  green "  hermes-agent installed ✓ ($(command -v hermes))"
fi

# ─── clone workspace ──────────────────────────────────────────────────────

cyan "→ Cloning hermes-workspace…"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  yellow "  $INSTALL_DIR exists; pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
elif [[ -e "$INSTALL_DIR" ]]; then
  red "Path exists but is not a git repo: $INSTALL_DIR"
  red "Move/remove it or set INSTALL_DIR=..."
  exit 1
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
green "  Workspace ready at $INSTALL_DIR ✓"

# ─── env + install ────────────────────────────────────────────────────────

cyan "→ Configuring .env…"
if [[ ! -f .env ]]; then
  cp .env.example .env
fi
ensure_env_key "$INSTALL_DIR/.env" "HERMES_API_URL" "http://127.0.0.1:${GATEWAY_PORT}"
green "  .env ready ✓"

cyan "→ Enabling Hermes HTTP API…"
HERMES_ENV_PATH="$(hermes config env-path 2>/dev/null || true)"
if [[ -z "$HERMES_ENV_PATH" ]]; then
  HERMES_ENV_PATH="$HOME/.hermes/.env"
fi
ensure_env_key "$HERMES_ENV_PATH" "API_SERVER_ENABLED" "true"
green "  Hermes env updated: $HERMES_ENV_PATH ✓"

cyan "→ Installing npm deps (pnpm install)…"
pnpm install --silent
green "  deps installed ✓"

# ─── seed Hermes skills (Conductor needs workspace-dispatch) ─────────────

cyan "→ Linking bundled skills into ~/.hermes/skills…"
HERMES_SKILLS_DIR="$HOME/.hermes/skills"
mkdir -p "$HERMES_SKILLS_DIR"
if [[ -d "$INSTALL_DIR/skills" ]]; then
  for skill_path in "$INSTALL_DIR/skills"/*/; do
    skill_name=$(basename "$skill_path")
    target="$HERMES_SKILLS_DIR/$skill_name"
    if [[ -e "$target" || -L "$target" ]]; then
      continue
    fi
    ln -sf "$skill_path" "$target" 2>/dev/null && \
      green "  linked $skill_name ✓" || true
  done
fi

# ─── done ─────────────────────────────────────────────────────────────────

bold ""
bold "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
green "  Install complete!"
bold "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat <<EOF

Next steps (two terminals):

  1) Start the Hermes gateway:
       hermes gateway run
     (first run may prompt for hermes setup)

  2) Start the workspace UI:
       cd $INSTALL_DIR && pnpm dev

  3) Open http://localhost:3000

If the gateway was already running before this install,
restart it so API_SERVER_ENABLED=true takes effect.

EOF

cyan "Happy building. 🚀"
