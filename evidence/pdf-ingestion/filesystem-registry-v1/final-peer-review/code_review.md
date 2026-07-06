# Code Review — delta 260f4022..69d5ee3f

Scope confined to evidence/pdf-ingestion/{fable5-closeout/handoff, filesystem-registry-v1}. No source outside the
registry/handoff scope touched. 29 files, +1181/-121.

filesystem_registry.py (508 lines):

- Stable record path records/<knowledge_id>/vNNNNNN.json; IDs restricted to ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$
  (no /, no leading dot, `..` impossible as full ID) — path traversal blocked.
- Symlink components rejected on root, subdirectories, record, checksum, and temp parent paths.
- Atomic write: same-directory mkstemp, fchmod 0600, fsync(file), os.replace, fsync(directory); temp unlinked on failure.
- Exclusive flock on state/registry.lock around write/transition/recover.
- Idempotency keyed on manifest idempotency_key with payload-hash conflict detection; nonce replay denied.
- Content hash = SHA-256(statement); approval_payload_hash excludes only itself (no self-reference); read-back
  verification with checksum sidecar and hmac.compare_digest.
- Transaction journal (state/transaction.json) with recover() cleanup of aborted writes.
- Immutable versioning: v1 create only FOUNDER_APPROVED; transitions restricted to
  FOUNDER_APPROVED->QUARANTINED->DEPRECATED; no hard delete; quarantine marker file; append-only audit event per action.
- Production hard-deny in _gate regardless of flags. Defaults fail-closed: write=False, dry_run=True, kill_switch=True.

canary_rollback.py: gate-only dry-run (writes 0), single-record canary, idempotent repeat required, installs
state/write-disabled immediately after canary. test_filesystem_registry.py: 22 unit tests, TemporaryDirectory only.

Non-blocking observation: transition() with previous_version=None raises TypeError instead of RegistryError
(ungraceful message, still fail-closed). Not a defect gate.

Verdict: APPROVED_FOR_MERGE
