# Dry-run Results

- Command Executed:
  ```bash
  CAPTAIN_PDF_CANONICAL_WRITE_ENABLED=true python3 evidence/pdf-ingestion/filesystem-registry-v1/canary_rollback.py dry-run --record /home/jakky/.captain-pdf/approvals/sandbox_canary_payload.json --manifest /home/jakky/.captain-pdf/approval_manifest.json
  ```
- Exit Code: `0`
- Output: `{"result": "DRY_RUN_VALID", "writes": 0}`
- Sandbox Mutation: None (verified)
- Production Mutation: None (verified)
- Audit Mutation: None (verified)
- Verification: Configuration, Schema, Manifest, and Payload hashes were successfully gated without modifying any repository or registry state.
