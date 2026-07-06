# Founder Handoff — Filesystem Canonical Registry v1

Authority is the approved local filesystem registry. It does not use a Registry URL or Registry Token. Production writes and automatic promotion remain prohibited.

## 1. Provision configuration and HMAC key

```bash
bash evidence/pdf-ingestion/fable5-closeout/handoff/setup_secrets.sh
```

The script collects filesystem type, sandbox/production roots, distinct namespaces, write/dry-run/kill-switch flags, and the approval HMAC key with hidden input. It writes outside Git with directory mode `0700` and file mode `0600`.

Normal fail-closed handoff values are `CAPTAIN_PDF_REGISTRY_TYPE=filesystem`, `CAPTAIN_PDF_CANONICAL_WRITE_ENABLED=false`, `CAPTAIN_PDF_DRY_RUN=true`, and `CAPTAIN_PDF_KILL_SWITCH=true`. Never send the HMAC key through chat or place it in Git.

## 2. Prepare Founder approval

Review `evidence/pdf-ingestion/filesystem-registry-v1/FILESYSTEM_REGISTRY_CONTRACT.md` and fill a copy of `unsigned_approval_request.json` outside Git. Limit it to one generated sandbox document, one knowledge unit, `max_records=1`, and `auto_promotion=false`.

Only the Founder may run `sign_manifest.py`. The agent has not signed or executed a canary. Payload hashing excludes only the record `approval_payload_hash` field to avoid self-reference.

## 3. Sandbox canary and rollback

After targeted tests pass and the Founder supplies a valid signed manifest, temporarily enable sandbox write and disable dry-run/kill-switch in the Founder-controlled shell. Run `canary_rollback.py dry-run` before `canary`. The canary writes only sandbox, verifies read-back and idempotency, then installs the persistent sandbox `state/write-disabled` marker. Quarantine and deprecation require separate signed payload-specific manifests. Production remains denied in adapter code.

## Resume

```bash
bash evidence/pdf-ingestion/fable5-closeout/handoff/resume_closeout.sh
```
