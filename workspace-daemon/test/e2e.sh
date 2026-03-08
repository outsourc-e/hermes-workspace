#!/usr/bin/env bash

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=3099
BASE_URL="http://127.0.0.1:${PORT}"
TMP_DIR="$(mktemp -d)"
DB_PATH="${TMP_DIR}/workspace-daemon.sqlite"
PROJECT_DIR="${TMP_DIR}/project"
LOG_PATH="${TMP_DIR}/daemon.log"
DAEMON_PID=""
FAILURES=0
CHECKS=0

mkdir -p "${PROJECT_DIR}"

cleanup() {
  if [[ -n "${DAEMON_PID}" ]] && kill -0 "${DAEMON_PID}" 2>/dev/null; then
    kill "${DAEMON_PID}" 2>/dev/null || true
    wait "${DAEMON_PID}" 2>/dev/null || true
  fi
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

record_pass() {
  CHECKS=$((CHECKS + 1))
  printf 'PASS: %s\n' "$1"
}

record_fail() {
  CHECKS=$((CHECKS + 1))
  FAILURES=$((FAILURES + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

extract_json() {
  local input="$1"
  local expression="$2"
  printf '%s' "${input}" | node -e '
const fs = require("fs");
const expression = process.argv[1];
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const value = expression
  .split(".")
  .filter(Boolean)
  .reduce((current, key) => (current == null ? undefined : current[key]), data);
if (value === undefined) {
  process.exit(1);
}
if (typeof value === "object") {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
' "${expression}"
}

assert_task_statuses() {
  local tasks_json="$1"
  local task_a_id="$2"
  local task_b_id="$3"
  local task_c_id="$4"

  TASKS_JSON="${tasks_json}" TASK_A_ID="${task_a_id}" TASK_B_ID="${task_b_id}" TASK_C_ID="${task_c_id}" node - <<'EOF'
const tasks = JSON.parse(process.env.TASKS_JSON);
const expected = new Map([
  [process.env.TASK_A_ID, "ready"],
  [process.env.TASK_B_ID, "pending"],
  [process.env.TASK_C_ID, "pending"],
]);

for (const [taskId, status] of expected) {
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task) {
    console.error(`Missing task ${taskId}`);
    process.exit(1);
  }
  if (task.status !== status) {
    console.error(`Task ${task.name} expected ${status} but got ${task.status}`);
    process.exit(1);
  }
}
EOF
}

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response
  local status

  if [[ -n "${body}" ]]; then
    response="$(curl -sS -X "${method}" "${BASE_URL}${path}" -H 'Content-Type: application/json' -d "${body}" -w $'\n%{http_code}')"
  else
    response="$(curl -sS -X "${method}" "${BASE_URL}${path}" -w $'\n%{http_code}')"
  fi

  status="${response##*$'\n'}"
  REQUEST_BODY="${response%$'\n'*}"

  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    printf 'Request failed: %s %s\nStatus: %s\nBody: %s\n' "${method}" "${path}" "${status}" "${REQUEST_BODY}" >&2
    return 1
  fi
}

printf 'Starting daemon on port %s\n' "${PORT}"
(
  cd "${ROOT_DIR}" &&
    PORT="${PORT}" WORKSPACE_DAEMON_DB_PATH="${DB_PATH}" npm start
) >"${LOG_PATH}" 2>&1 &
DAEMON_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    record_pass "health check reachable"
    break
  fi
  sleep 0.5
done

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  record_fail "health check reachable"
  printf 'Daemon log:\n' >&2
  cat "${LOG_PATH}" >&2
  printf 'Summary: %s checks, %s failed\n' "${CHECKS}" "${FAILURES}" >&2
  exit 1
fi

request POST /api/projects "{\"name\":\"E2E Project\",\"path\":\"${PROJECT_DIR}\"}"
PROJECT_JSON="${REQUEST_BODY}"
PROJECT_ID="$(extract_json "${PROJECT_JSON}" "id")"
record_pass "project created"

request POST /api/phases "{\"project_id\":\"${PROJECT_ID}\",\"name\":\"Phase 1\",\"sort_order\":1}"
PHASE_JSON="${REQUEST_BODY}"
PHASE_ID="$(extract_json "${PHASE_JSON}" "id")"
record_pass "phase created"

request POST /api/missions "{\"phase_id\":\"${PHASE_ID}\",\"name\":\"Mission 1\"}"
MISSION_JSON="${REQUEST_BODY}"
MISSION_ID="$(extract_json "${MISSION_JSON}" "id")"
record_pass "mission created"

request POST /api/tasks "{\"mission_id\":\"${MISSION_ID}\",\"name\":\"Task A\",\"sort_order\":1}"
TASK_A_ID="$(extract_json "${REQUEST_BODY}" "id")"
record_pass "task A created"

request POST /api/tasks "{\"mission_id\":\"${MISSION_ID}\",\"name\":\"Task B\",\"sort_order\":2,\"depends_on\":[\"${TASK_A_ID}\"]}"
TASK_B_ID="$(extract_json "${REQUEST_BODY}" "id")"
record_pass "task B created"

request POST /api/tasks "{\"mission_id\":\"${MISSION_ID}\",\"name\":\"Task C\",\"sort_order\":3,\"depends_on\":[\"${TASK_A_ID}\",\"${TASK_B_ID}\"]}"
TASK_C_ID="$(extract_json "${REQUEST_BODY}" "id")"
record_pass "task C created"

request POST /api/agents '{"name":"codex-e2e","role":"coder","adapter_type":"codex"}'
AGENT_ID="$(extract_json "${REQUEST_BODY}" "id")"
if [[ -n "${AGENT_ID}" ]]; then
  record_pass "codex agent registered"
else
  record_fail "codex agent registered"
fi

request POST "/api/missions/${MISSION_ID}/start"
record_pass "mission started"

request GET "/api/tasks?mission_id=${MISSION_ID}"
TASKS_JSON="${REQUEST_BODY}"
if assert_task_statuses "${TASKS_JSON}" "${TASK_A_ID}" "${TASK_B_ID}" "${TASK_C_ID}"; then
  record_pass "task dependency statuses verified"
else
  record_fail "task dependency statuses verified"
fi

if [[ "${FAILURES}" -eq 0 ]]; then
  printf 'Summary: PASS (%s checks)\n' "${CHECKS}"
  exit 0
fi

printf 'Summary: FAIL (%s/%s checks failed)\n' "${FAILURES}" "${CHECKS}" >&2
exit 1
