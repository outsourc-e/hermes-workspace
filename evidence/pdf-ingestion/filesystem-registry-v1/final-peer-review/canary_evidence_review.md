# Canary Evidence Review — sandbox-canary-agy

- Files: 16 evidence files + evidence.sha256, all present
- sha256sum -c evidence.sha256 (repo-relative, from repo root): all 16 OK
- sha256(evidence.sha256) = 6e07e1ce98a21c9826e5e0975ad6cc1a4ea8e015386a0d78f03b7c9e7a4054c1 — matches handoff report
- final_status.md: SANDBOX_CANARY_PASS, 10/10, executor AGY, code commit 69d5ee3f, records created 1,
  final canonical write=false, final dry-run=true, source code modified=false — matches handoff claims
- Live cross-check on host: sandbox has exactly 1 record version (v000001.json for
  canary-knowledge-6f9278c4468f96a3cb835ad7), state/write-disabled marker present, production root 0 files
- Secret scan: no HMAC key, no secrets.env contents, no full manifest signature. Disclosed nonce and idempotency
  key are single-use values already consumed and replay-blocked (nonces.json), not secrets
- No runtime registry record files copied into Git; evidence is markdown reports only
- Source modification check: git status on source worktree showed no tracked-file modifications by AGY
- Manifest expiry 2026-07-05T20:09:04+00:00 has passed — the sandbox manifest cannot be reused

Verdict: PASS
