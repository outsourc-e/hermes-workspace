# Read-back Verification

- Read-Back Integrity: The written record was retrieved and matches the input payload exactly (PASS)
- Schema Verification: Validated against `canonical_knowledge_record.schema.json` constraints (PASS)
- Content Hash Verification: Content hash (`2e7d12dd4f15f3d4e29c046717a33240744eeda5d1eebe6677d93d6d74162065`) matches the SHA-256 of the statement field: `"Generated filesystem sandbox canary statement."` (PASS)
- Payload Hash Verification: Omission of `approval_payload_hash` in SHA-256 computation matches signature manifest `payload_sha256` (`fc2f898f2e9447fcdfc5ea5ea6d7b99686e757d8f163fd8f2ce31cb2ecdc6d35`) (PASS)
- Manifest Link Verification: The record's `approval_manifest_id` matches the written manifest file `canary-manifest-34b499a04a9038470e3d6dac` (PASS)
- Sidecar Checksum Check: File content exactly matches the checksum specified in the `.sha256` sidecar (PASS)
