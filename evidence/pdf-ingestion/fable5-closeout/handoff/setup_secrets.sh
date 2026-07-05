#!/usr/bin/env bash
# Founder-run secure secret provisioning for captain-pdf external gates.
set +x
set -euo pipefail

umask 077

DEST_DIR="$(realpath -m -- "${CAPTAIN_PDF_SECRET_DIR:-${HOME}/.captain-pdf}")"
DEST="${DEST_DIR}/secrets.env"
TEMP_FILE=""

cleanup() {
  if [[ -n "${TEMP_FILE}" && -e "${TEMP_FILE}" ]]; then
    rm -f -- "${TEMP_FILE}"
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 1' HUP INT TERM

REPO_ROOT="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(realpath -m -- "${REPO_ROOT}")"
fi
case "${DEST_DIR}" in
  "${REPO_ROOT}"|"${REPO_ROOT}"/*)
    printf 'REFUSED: destination must be outside the repository\n' >&2
    exit 1
    ;;
esac

values=()
names=(
  CAPTAIN_PDF_REGISTRY_URL
  CAPTAIN_PDF_REGISTRY_TOKEN
  CAPTAIN_PDF_APPROVAL_HMAC_KEY
  CAPTAIN_PDF_REGISTRY_NAMESPACE
  CAPTAIN_PDF_REGISTRY_TEST_NAMESPACE
)

for name in "${names[@]}"; do
  value=""
  printf 'Enter %s (input hidden): ' "${name}" >&2
  IFS= read -r -s value
  printf '\n' >&2
  if [[ -z "${value}" ]]; then
    printf 'REFUSED: every required value must be provided\n' >&2
    exit 1
  fi
  values+=("${value}")
done

if [[ "${values[3]}" == "${values[4]}" ]]; then
  printf 'REFUSED: production and test namespaces must differ\n' >&2
  exit 1
fi

if [[ -L "${DEST_DIR}" ]]; then
  printf 'REFUSED: destination directory must not be a symbolic link\n' >&2
  exit 1
fi
mkdir -p -- "${DEST_DIR}"
chmod 0700 -- "${DEST_DIR}"
if [[ "$(stat -c %u -- "${DEST_DIR}")" != "$(id -u)" ]]; then
  printf 'REFUSED: destination directory is not owned by the current user\n' >&2
  exit 1
fi

TEMP_FILE="$(mktemp "${DEST_DIR}/.secrets.env.tmp.XXXXXX")"
chmod 0600 -- "${TEMP_FILE}"
for index in "${!names[@]}"; do
  printf '%s=%q\n' "${names[$index]}" "${values[$index]}" >> "${TEMP_FILE}"
done
mv -f -- "${TEMP_FILE}" "${DEST}"
TEMP_FILE=""
chmod 0600 -- "${DEST}"

printf 'Secure configuration written.\n'
