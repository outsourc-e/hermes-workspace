# Canary Write Result

- Command Executed:
  ```bash
  CAPTAIN_PDF_CANONICAL_WRITE_ENABLED=true CAPTAIN_PDF_DRY_RUN=false CAPTAIN_PDF_KILL_SWITCH=false python3 evidence/pdf-ingestion/filesystem-registry-v1/canary_rollback.py canary --record /home/jakky/.captain-pdf/approvals/sandbox_canary_payload.json --manifest /home/jakky/.captain-pdf/approval_manifest.json
  ```
- Exit Code: `0`
- Output: `{"result": "CANARY_CREATED", "repeat": "IDEMPOTENT", "write_disabled": true}`
- Records Created: `1`
- Created Path: `/home/jakky/.local/share/captain-pdf/registry/sandbox/records/canary-knowledge-6f9278c4468f96a3cb835ad7/v000001.json`
- Verification status: `FOUNDER_APPROVED`
