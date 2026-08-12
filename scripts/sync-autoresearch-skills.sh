#!/usr/bin/env bash
# Sync autoresearch skills + wrappers after swarm.yaml role split.
set -euo pipefail
WS="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${HOME}/.local/bin"
SKILLS="${HOME}/.hermes/skills/swarm"

install_wrapper() {
  local name="$1" profile="$2" skill_list="$3"
  cat > "${BIN}/${name}" <<EOF
#!/usr/bin/env bash
exec hermes -p ${profile} -s ${skill_list} "\$@"
EOF
  chmod +x "${BIN}/${name}"
}

mkdir -p "${BIN}" "${SKILLS}"
for skill in autoresearch autoresearch-orchestrate autoresearch-plan autoresearch-execute; do
  mkdir -p "${SKILLS}/${skill}"
  cp -r "${WS}/skills/swarm/${skill}/"* "${SKILLS}/${skill}/"
done
rm -rf "${SKILLS}/researcher-autoresearch" 2>/dev/null || true

install_wrapper "orchestrator:autoresearch" orchestrator \
  "autoresearch-orchestrate,autoresearch-plan,autoresearch"
install_wrapper "orchestrator:autoresearch-dispatch" orchestrator \
  "autoresearch-orchestrate,autoresearch-plan,autoresearch"
install_wrapper "architect:autoresearch" architect \
  "autoresearch-execute,autoresearch"
install_wrapper "developer:autoresearch" developer \
  "autoresearch-execute,autoresearch"
rm -f "${BIN}/researcher:autoresearch"

for profile in orchestrator architect developer researcher; do
  mkdir -p "${HOME}/.hermes/profiles/${profile}/skills"
  case "${profile}" in
    orchestrator)
      for s in autoresearch autoresearch-orchestrate autoresearch-plan orchestrator-core; do
        rm -rf "${HOME}/.hermes/profiles/${profile}/skills/${s}"
        cp -r "${SKILLS}/${s}" "${HOME}/.hermes/profiles/${profile}/skills/" 2>/dev/null || true
      done
      ;;
    architect)
      for s in autoresearch autoresearch-execute architect-core; do
        rm -rf "${HOME}/.hermes/profiles/${profile}/skills/${s}"
        cp -r "${SKILLS}/${s}" "${HOME}/.hermes/profiles/${profile}/skills/" 2>/dev/null || true
      done
      ;;
    developer)
      for s in autoresearch autoresearch-execute; do
        rm -rf "${HOME}/.hermes/profiles/${profile}/skills/${s}"
        cp -r "${SKILLS}/${s}" "${HOME}/.hermes/profiles/${profile}/skills/" 2>/dev/null || true
      done
      ;;
    researcher)
      rm -rf "${HOME}/.hermes/profiles/${profile}/skills/researcher-autoresearch" \
             "${HOME}/.hermes/profiles/${profile}/skills/autoresearch" 2>/dev/null || true
      for s in researcher-core researcher-quick; do
        cp -r "${WS}/skills/swarm/${s}" "${HOME}/.hermes/profiles/${profile}/skills/" 2>/dev/null || true
      done
      ;;
  esac
done

echo "Synced autoresearch skills and wrappers."
ls -la "${BIN}/orchestrator:autoresearch" "${BIN}/orchestrator:autoresearch-dispatch" "${BIN}/architect:autoresearch" "${BIN}/developer:autoresearch"
