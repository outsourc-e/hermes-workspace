#!/usr/bin/env bash
# One-command resume for the captain-pdf external closeout.
# Loads founder-provisioned secrets (if present), re-checks all three external
# blockers, and reports exactly what is now unblocked. Read-only.
set -uo pipefail

HANDOFF="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HANDOFF" rev-parse --show-toplevel)"
SECRETS="$HOME/.captain-pdf/secrets.env"

echo "== captain-pdf closeout resume — $(date -u +%Y-%m-%dT%H:%M:%SZ) =="

if [[ -f "$SECRETS" ]]; then
  if [[ "$(stat -c %a "$SECRETS")" != "600" || "$(stat -c %u "$SECRETS")" != "$(id -u)" ]]; then echo "[1] BLOCKED: insecure secrets.env ownership or mode"; exit 2; fi
  set -a; # shellcheck disable=SC1090
  source "$SECRETS"; set +a
  echo "[1] secrets.env loaded (mode checked)"
else
  echo "[1] BLOCKED: $SECRETS absent — run setup_secrets.sh first"
fi

if [[ -n "${CAPTAIN_PDF_REGISTRY_URL:-}" && -n "${CAPTAIN_PDF_REGISTRY_TOKEN:-}" && -n "${CAPTAIN_PDF_REGISTRY_TEST_NAMESPACE:-}" ]]; then
  echo "[2] registry env present — running read-only probe"
  python3 "$HANDOFF/verify_external_registry.py" --namespace "$CAPTAIN_PDF_REGISTRY_TEST_NAMESPACE" \
    --out "$REPO/evidence/pdf-ingestion/fable5-closeout/gate2_registry_probe.json" \
    | grep -E '"result"|"reason"'
else
  echo "[2] BLOCKED: registry URL, token, or test namespace unset"
fi

if [[ -f "$HOME/.captain-pdf/approval_manifest.json" && -n "${CAPTAIN_PDF_APPROVAL_HMAC_KEY:-}" ]]; then
  echo "[3] founder manifest + HMAC key present — write canary may proceed (run via system branch harness)"
else
  echo "[3] BLOCKED: founder-signed manifest and/or HMAC key absent"
fi

if timeout "${GITHUB_AUTH_TIMEOUT_SECONDS:-10}s" env \
  GIT_TERMINAL_PROMPT=0 GH_PROMPT_DISABLED=1 \
  gh auth status >/dev/null 2>&1; then
  echo "[4] github auth configured (read-only check)"
else
  echo "[4] GITHUB_AUTH_ACTION_REQUIRED"
fi

echo "== done — hand results back to the orchestration agent to continue the mission =="
