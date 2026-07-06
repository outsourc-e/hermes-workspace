# Filesystem Safety Review

- Roots must be absolute, distinct, outside the repository (setup script realpath + case guard). PASS
- Root ownership (uid) and mode 0700 verified after mkdir/chmod; subdirectories 0700. PASS
- Atomic temporary write: mkstemp in target directory, fchmod 0600 before content, write+flush+fsync, os.replace
  (atomic rename), directory fsync; temp file unlinked on any exception. PASS
- Checksum sidecar (.sha256) written atomically for every record/manifest. PASS
- File locking: exclusive flock on state/registry.lock for write, transition, recover. PASS
- Idempotency: IDEMPOTENT result with payload-hash conflict detection and record re-verification. PASS
- Read-back verification inside transaction and after commit; checksum compared with hmac.compare_digest;
  permission and ownership re-checked at read time. PASS
- Recovery: transaction journal enables cleanup of aborted writes (record, sidecar, new manifest, quarantine marker,
  correlation-scoped audit events, state rollback) plus orphan temp-file sweep. PASS
- Quarantine marker under quarantine/; deprecation is a new immutable version — no hard delete anywhere. PASS
- Sandbox/production isolation: separate roots, separate namespaces (must differ), production denied in code. PASS

Verdict: PASS
