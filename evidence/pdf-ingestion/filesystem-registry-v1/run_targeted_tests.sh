#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"

python3 -m json.tool "$HERE/canonical_knowledge_record.schema.json" >/dev/null
python3 -m json.tool "$HERE/filesystem_registry_config.schema.json" >/dev/null
python3 -m py_compile "$HERE/filesystem_registry.py" "$HERE/canary_rollback.py"
(cd "$HERE" && python3 -m unittest -v test_filesystem_registry.py)
bash "$REPO/evidence/pdf-ingestion/fable5-closeout/handoff/test_secure_handoff.sh"

! rg -n 'CAPTAIN_PDF_REGISTRY_(URL|TOKEN)' \
  "$REPO/evidence/pdf-ingestion/fable5-closeout/handoff/setup_secrets.sh" \
  "$REPO/evidence/pdf-ingestion/fable5-closeout/handoff/resume_closeout.sh"
! rg -n 'production[^\n]*(write|canonical)[^\n]*(enabled|true)' "$HERE" --glob '*.py'
! find "$REPO" -type f \( -name 'secrets.env' -o -path '*/registry/sandbox/*' -o -path '*/registry/production/*' \) -print -quit | grep -q .

printf 'FILESYSTEM_REGISTRY_TARGETED_TESTS_PASS\n'
