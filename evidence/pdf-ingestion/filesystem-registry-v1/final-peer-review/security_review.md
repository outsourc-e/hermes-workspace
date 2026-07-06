# Security Review

- HMAC-SHA256 manifest signature over canonical JSON, verified with hmac.compare_digest (timing-safe). PASS
- Expiry must be timezone-aware and in the future. PASS
- Commit match: manifest.commit_sha must equal record.source_commit (40-hex enforced). PASS
- Payload hash match required in both directions (manifest.payload_sha256 == payload_hash(record) == record.approval_payload_hash). PASS
- Namespace, knowledge_id, document_id, manifest_id all cross-checked manifest<->record. PASS
- max_records=1, auto_promotion=false, founder_approval=true enforced. PASS
- Nonce replay denied via persisted nonces.json under exclusive lock. PASS
- Root/dir 0700 and file 0600 with ownership checks on read and on stored-manifest comparison. PASS
- Symlink rejection on every path component used. PASS
- Production environment hard-denied in code before any flag evaluation. PASS
- Secret exposure: no HMAC key, secrets.env content, or full signature in code, evidence, or Git. PASS
- setup_secrets.sh: hidden input, xtrace-safe, 0600/0700, roots must be absolute, distinct, and outside the repository. PASS

Verdict: PASS
