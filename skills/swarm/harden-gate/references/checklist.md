# Harden checklist templates

## Shared

```text
HARDEN_CHECKLIST:
- [ ] files_exist — FILES_CHANGED paths readable
- [ ] no_secrets — no tokens/keys in diff or new files
- [ ] in_scope — no work outside spec non-goals
- [ ] no_blocker — BLOCKER empty / resolved
```

## Developer

```text
- [ ] test_evidence — claimed test/build has log or exit code
- [ ] minimal_diff — no unrelated refactors
- [ ] coverage_or_waiver — tests for critical paths, or written waiver
```

## Writer

```text
- [ ] facts_match_impl — APIs/paths/versions match code
- [ ] no_unverified_claims — no bare perf/security assertions
- [ ] a11y_brand — spec constraints addressed if required
```

## Pass example

```text
STATE: DONE
EXECUTOR: developer
REVIEW_OUTCOME: approved
HARDEN_OUTCOME: pass
HARDEN_CHECKLIST:
- [x] files_exist
- [x] no_secrets
- [x] in_scope
- [x] no_blocker
- [x] test_evidence — ran: pnpm test (exit 0), log mission/.../test.log
- [x] minimal_diff
- [x] coverage_or_waiver
RESULT: Harden pass. Tests green; no secrets; files match checkpoint.
NEXT_ACTION: learning
```

## Fail example

```text
STATE: DONE
EXECUTOR: writer
REVIEW_OUTCOME: approved
HARDEN_OUTCOME: fail
HARDEN_CHECKLIST:
- [x] files_exist
- [x] no_secrets
- [ ] facts_match_impl — doc says POST /v1/boards; code exposes /api/retros
RESULT: Harden fail. Fix API path in doc before learning/publish.
NEXT_ACTION: fix:facts_match_impl
```
