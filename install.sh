#!/usr/bin/env bash
# Project Workspace — one-liner installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/outsourc-e/hermes-workspace/main/install.sh | bash
#
# What it does:
#   1. Verifies Node 22+, Python 3.11+, pnpm
#   2. Installs hermes-agent via pip (vanilla, no fork)
#   3. Clones hermes-workspace
#   4. Sets up .env, installs deps, starts both servers
#
# Re-runnable. Will skip anything already installed.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/outsourc-e/hermes-workspace.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/hermes-workspace}"
GATEWAY_PORT="${GATEWAY_PORT:-8642}"
WORKSPACE_PORT="${WORKSPACE_PORT:-3000}"

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

need python3 "Install Python 3.11+: https://www.python.org/"
py_major=$(python3 -c 'import sys; print(sys.version_info[0])')
py_minor=$(python3 -c 'import sys; print(sys.version_info[1])')
if [[ "$py_major" -lt 3 ]] || { [[ "$py_major" -eq 3 ]] && [[ "$py_minor" -lt 11 ]]; }; then
  red "Python $py_major.$py_minor detected; need 3.11+."
  exit 1
fi
green "  Python $(python3 --version | awk '{print $2}') ✓"

if ! command -v pnpm &>/dev/null; then
  yellow "  pnpm not found — installing via corepack…"
  corepack enable 2>/dev/null || npm install -g pnpm
fi
green "  pnpm $(pnpm --version) ✓"

# ─── install hermes-agent (vanilla, no fork) ──────────────────────────────

cyan "→ Installing hermes-agent (vanilla from PyPI)…"
if python3 -c "import project_agent" &>/dev/null; then
  green "  hermes-agent already installed ✓"
else
  # Detect PEP 668 environments (Debian 12+, Ubuntu 23.04+, recent Fedora, etc.)
  is_externally_managed() {
    python3 - <<'PY' 2>/dev/null
import sys, sysconfig, pathlib
p = pathlib.Path(sysconfig.get_paths()["stdlib"]).parent / "EXTERNALLY-MANAGED"
sys.exit(0 if p.exists() else 1)
PY
  }

  install_with_pipx() {
    if ! command -v pipx &>/dev/null; then return 1; fi
    pipx install --force "hermes-agent[cron]" && pipx ensurepath >/dev/null 2>&1
  }

  install_with_venv() {
    local venv_dir="$HOME/.local/share/hermes-agent/venv"
    local bin_dir="$HOME/.local/bin"
    yellow "  Creating isolated venv at $venv_dir"
    python3 -m venv "$venv_dir"
    "$venv_dir/bin/pip" install --upgrade pip >/dev/null
    "$venv_dir/bin/pip" install --upgrade "hermes-agent[cron]"
    mkdir -p "$bin_dir"
    ln -sf "$venv_dir/bin/project-agent" "$bin_dir/project-agent" 2>/dev/null || true
    ln -sf "$venv_dir/bin/hermes-agent" "$bin_dir/hermes-agent" 2>/dev/null || true
    case ":$PATH:" in
      *":$bin_dir:"*) ;;
      *) yellow "  Add to your shell rc: export PATH=\"$bin_dir:\$PATH\"" ;;
    esac
  }

  if is_externally_managed; then
    yellow "  PEP 668 environment detected (system Python is externally managed)"
    if install_with_pipx; then
      green "  hermes-agent installed via pipx ✓"
    else
      yellow "  pipx not available — falling back to isolated venv"
      install_with_venv
      green "  hermes-agent installed in venv ✓"
    fi
  else
    python3 -m pip install --user --upgrade "hermes-agent[cron]"
    green "  hermes-agent installed ✓"
  fi
fi

# ─── clone workspace ──────────────────────────────────────────────────────

cyan "→ Cloning hermes-workspace…"
if [[ -d "$INSTALL_DIR" ]]; then
  yellow "  $INSTALL_DIR exists; pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
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
if ! grep -q "HERMES_API_URL=" .env 2>/dev/null; then
  printf '\nHERMES_API_URL=http://127.0.0.1:%s\n' "$GATEWAY_PORT" >> .env
fi
green "  .env ready ✓"

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

  3) Open http://localhost:$WORKSPACE_PORT

Optional auto-start:
  pnpm start:all   # launches both in one command (see package.json)

EOF

cyan "Happy building. 🚀"
