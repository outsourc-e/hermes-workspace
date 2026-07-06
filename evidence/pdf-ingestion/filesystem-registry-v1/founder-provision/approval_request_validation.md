# Approval request validation

Status: PASS, unsigned.

One generated sandbox payload and its signable request were created outside Git. Checks
passed for record schema, canonical payload hash, sandbox environment/namespace, exact
runtime commit, exact document/knowledge IDs, two-hour expiry, cryptographic nonce,
unique idempotency key, `max_records=1`, `founder_approval=true`,
`auto_promotion=false`, and empty signature. Forbidden placeholder count: `0`.

The unsigned request was explicitly rejected by HMAC signature validation. The signer
was not executed.
