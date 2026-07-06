# Idempotency Verification

- Replay Idempotency Check: Repeating the write request with the same idempotency key returned `{"result": "IDEMPOTENT"}` (PASS)
- Record Count Limit: The total sandbox record count did not increase and remained at exactly `1` (PASS)
- Post-canary Lockout: Re-running the canary tool after completion correctly rejected writes with `WRITE_DENIED FAIL_CLOSED: sandbox write disabled after canary` (PASS)
- Payload Conflict Guard: The registry is verified to reject repeat requests with different payload hashes under the same idempotency key, throwing `WRITE_DENIED: idempotency key payload conflict` (PASS)
