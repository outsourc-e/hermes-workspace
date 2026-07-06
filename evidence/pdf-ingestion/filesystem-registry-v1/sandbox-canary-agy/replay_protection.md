# Replay Protection

- Nonce Tracking: The registry records utilized nonces in `/home/jakky/.local/share/captain-pdf/registry/sandbox/state/nonces.json` (PASS)
- Replay Block: Re-executing a transaction using a recorded nonce raises `WriteDenied: manifest nonce replay` (PASS)
- Transaction Safety: Verified via targeted unit test `test_nonce_replay` to guarantee nonce consumption happens atomically upon transaction completion (PASS)
