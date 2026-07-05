#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SETUP="${HERE}/setup_secrets.sh"
RESUME="${HERE}/resume_closeout.sh"
ROOT="$(git -C "${HERE}" rev-parse --show-toplevel)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "${TMP}"' EXIT

pass=0
check() { printf 'PASS: %s\n' "$1"; pass=$((pass + 1)); }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
inputs() { printf '%s\n' filesystem '/tmp/captain-pdf-sandbox-test' '/tmp/captain-pdf-production-test' 'captain-pdf-prod' 'captain-pdf-test' false true true 'hmac-value-4y'; }
run_setup() { inputs | HOME="$1" CAPTAIN_PDF_SECRET_DIR="$1/.captain-pdf" bash "$SETUP"; }

bash -n "$SETUP" "$RESUME" && check 'Bash syntax'

trace_home="${TMP}/trace-home"
mkdir -p "$trace_home"
trace_output="$(inputs | HOME="$trace_home" CAPTAIN_PDF_SECRET_DIR="$trace_home/.captain-pdf" bash -x "$SETUP" 2>&1)"
[[ "$trace_output" != *'hmac-value-4y'* ]] || fail 'xtrace disclosed input'
check 'xtrace disabled before input'

missing_home="${TMP}/missing-home"; mkdir -p "$missing_home"
if printf '%s\n' filesystem /tmp/s /tmp/p prod test false true true '' | HOME="$missing_home" CAPTAIN_PDF_SECRET_DIR="$missing_home/.captain-pdf" bash "$SETUP" >/dev/null 2>&1; then fail 'missing value accepted'; fi
[[ ! -e "$missing_home/.captain-pdf/secrets.env" ]] || fail 'missing value wrote file'
check 'missing value rejected'

collision_home="${TMP}/collision-home"; mkdir -p "$collision_home"
if printf '%s\n' filesystem /tmp/s /tmp/p same same false true true key | HOME="$collision_home" CAPTAIN_PDF_SECRET_DIR="$collision_home/.captain-pdf" bash "$SETUP" >/dev/null 2>&1; then fail 'namespace collision accepted'; fi
check 'namespace collision rejected'

mode_home="${TMP}/mode-home"; mkdir -p "$mode_home"
output="$(run_setup "$mode_home" 2>&1)"
[[ "$(stat -c %a "$mode_home/.captain-pdf")" == 700 ]] || fail 'directory mode'
check 'directory mode 0700'
[[ "$(stat -c %a "$mode_home/.captain-pdf/secrets.env")" == 600 ]] || fail 'secret file mode'
[[ "$(stat -c %u "$mode_home/.captain-pdf/secrets.env")" == "$(id -u)" ]] || fail 'secret file owner'
check 'secret file mode 0600 and current owner'
[[ "$output" != *'hmac-value-4y'* && "$output" != *'captain-pdf-prod'* ]] || fail 'secret disclosed in output'
check 'no secret in stdout/stderr'

old_inode="$(stat -c %i "$mode_home/.captain-pdf/secrets.env")"
run_setup "$mode_home" >/dev/null 2>&1
[[ "$(stat -c %i "$mode_home/.captain-pdf/secrets.env")" != "$old_inode" ]] || fail 'destination not atomically replaced'
check 'atomic replacement'

interrupt_home="${TMP}/interrupt-home"; mkdir -p "$interrupt_home/bin"
cat > "$interrupt_home/bin/chmod" <<'EOF'
#!/usr/bin/env bash
/usr/bin/chmod "$@"
if [[ "${*: -1}" == *'.secrets.env.tmp.'* ]]; then
  kill -TERM "$PPID"
fi
EOF
/usr/bin/chmod +x "$interrupt_home/bin/chmod"
inputs | PATH="$interrupt_home/bin:$PATH" HOME="$interrupt_home" CAPTAIN_PDF_SECRET_DIR="$interrupt_home/.captain-pdf" bash "$SETUP" >/dev/null 2>&1 || true
if find "$interrupt_home/.captain-pdf" -name '.secrets.env.tmp.*' -print -quit | grep -q .; then fail 'interrupt left temporary file'; fi
[[ ! -e "$interrupt_home/.captain-pdf/secrets.env" ]] || fail 'interrupt installed destination file'
check 'interrupt cleanup'

if git -C "$ROOT" ls-files --error-unmatch '.captain-pdf/secrets.env' >/dev/null 2>&1; then fail 'secret path tracked'; fi
check 'secret path not tracked by Git'

! rg -n 'sign_manifest\.py' "$RESUME" >/dev/null || fail 'resume invokes signer'
check 'signer not executed by resume'

! rg -n 'canonical_write[^[:space:]]*[[:space:]]*(true|1|enabled)' "$SETUP" "$RESUME" >/dev/null || fail 'canonical write enabled'
check 'canonical write remains disabled'

github_home="${TMP}/github-home"; mkdir -p "$github_home/bin"
cat > "$github_home/bin/gh" <<'EOF'
#!/usr/bin/env bash
[[ "${GIT_TERMINAL_PROMPT:-}" == 0 ]] || exit 91
[[ "${GH_PROMPT_DISABLED:-}" == 1 ]] || exit 92
printf ok > "$GITHUB_AUTH_TEST_MARKER"
printf 'Username: ' >&2
sleep 30
EOF
/usr/bin/chmod +x "$github_home/bin/gh"
SECONDS=0
auth_marker="$github_home/auth-env-ok"
resume_output="$(PATH="$github_home/bin:$PATH" HOME="$github_home" GITHUB_AUTH_TEST_MARKER="$auth_marker" GITHUB_AUTH_TIMEOUT_SECONDS=1 bash "$RESUME" 2>&1)"
resume_status=$?
[[ "$SECONDS" -lt 4 ]] || fail 'github auth check hung'
[[ -e "$auth_marker" ]] || fail 'noninteractive auth environment missing'
[[ "$resume_status" -eq 0 ]] || fail 'resume result was not deterministic'
[[ "$resume_output" == *'GITHUB_AUTH_ACTION_REQUIRED'* ]] || fail 'missing github auth action result'
[[ "$resume_output" != *'Username:'* && "$resume_output" != *'Password:'* ]] || fail 'credential prompt leaked'
[[ "$resume_output" == *'filesystem registry configuration incomplete'* ]] || fail 'missing registry secrets did not fail closed'
check 'github auth missing is noninteractive, bounded, and deterministic'
check 'registry secrets missing remains fail closed'

! rg -n 'git[^\n]*push|remote[[:space:]]+set-url' "$RESUME" >/dev/null || fail 'resume can push or change remote'
check 'github check is read-only'

printf 'Targeted secure handoff tests passed: %d\n' "$pass"
