# Approval gate test

PASS: missing manifest, invalid signature, expired manifest, nonce replay, wrong namespace,
wrong source commit, payload mismatch, missing/incorrect IDs, kill switch, disabled write,
dry-run, production target, schema, verification status, `max_records`,
`auto_promotion=false`, and idempotency requirements fail closed with `WRITE_DENIED`.
No signer was executed and no signature was generated.
