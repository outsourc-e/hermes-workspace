# Approval Gate Review

Gate order in _gate() (all fail-closed, WriteDenied):

1. record.registry_environment must equal registry environment
2. production hard-deny (unconditional)
3. manifest presence and environment match
4. sandbox state/write-disabled marker denies post-canary writes
5. kill switch (default true) denies
6. canonical_write_enabled (default false) denies
7. dry_run (default true) denies
8. HMAC signature verification (compare_digest)
9. timezone-aware unexpired expiry
10. commit_sha == source_commit
11. payload_sha256 == payload_hash(record) == approval_payload_hash
12. knowledge_id/document_id must be listed in manifest
13. namespace match (manifest, record, registry)
14. full record schema validation
15. max_records == 1
16. auto_promotion is False and founder_approval is True
17. idempotency_key and nonce present
18. approval_manifest_id == manifest_id

sign_manifest.py requires manifest_id, refuses FILL placeholders and auto_promotion != false; payload hashing
excludes only approval_payload_hash (byte-compatible with the registry). Verdict: PASS
