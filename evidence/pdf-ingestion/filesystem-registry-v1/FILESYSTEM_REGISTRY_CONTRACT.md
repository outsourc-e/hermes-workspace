# Filesystem Canonical Registry v1 Contract

Authority is a local filesystem owned by the runtime user. It has no listener,
network dependency, database, or service. Production writes are hard-denied in v1.

## Roots and layout

Approved runtime roots are outside Git:

- sandbox: `/home/jakky/.local/share/captain-pdf/registry/sandbox`
- production: `/home/jakky/.local/share/captain-pdf/registry/production`

Roots and directories are `0700`; records, checksums, manifests, state, locks, quarantine
markers, and audit events are `0600`. Existing symlink components are rejected. Validated
IDs form paths as `records/<knowledge_id>/vNNNNNN.json`; `/`, `..`, whitespace, and other
characters outside `[A-Za-z0-9._-]` are rejected.

## Schema authority

`canonical_knowledge_record.schema.json` is the record authority and
`filesystem_registry_config.schema.json` is the configuration authority. Runtime
validation in `filesystem_registry.py` enforces the same closed field set and critical
constraints without adding a package dependency. `content_hash` is SHA-256 of UTF-8
`statement`. `approval_payload_hash` is SHA-256 of canonical JSON for the record with
only `approval_payload_hash` omitted, avoiding a self-reference.

## Governance and writes

Every write requires an explicit sandbox target, inactive kill switch, enabled write
flag, inactive dry-run, valid unexpired Founder HMAC manifest, unused nonce, matching
commit/payload/IDs/namespace, valid schema and verification, `max_records=1`,
`auto_promotion=false`, and an idempotency key. Production is denied in code regardless
of flags. Initial state is `FOUNDER_APPROVED`; v1 permits only immutable transitions
`FOUNDER_APPROVED -> QUARANTINED -> DEPRECATED`. It never hard-deletes or promotes.

Writes use a same-directory temporary file, `fsync`, atomic rename, directory `fsync`,
checksum sidecar, read-back verification, an exclusive lock, nonce/idempotency state,
and one immutable audit-event file per action. Recovery removes abandoned temp files.

## Canary and rollback

No canary may run without a Founder-signed manifest and HMAC key. Use `canary_rollback.py
dry-run` first, then `canary`; the utility limits creation to the approved single record,
verifies idempotent replay/read-back, and installs `state/write-disabled` immediately.
Quarantine and rollback require separately signed payload-specific manifests:

```text
python3 canary_rollback.py quarantine --record quarantine.json --manifest quarantine-manifest.json
python3 canary_rollback.py rollback --record deprecated.json --manifest rollback-manifest.json
```

Rollback means a new `DEPRECATED` version; original versions and audit evidence remain.
Recovery is `python3 canary_rollback.py recover`. Never remove registry files manually.
