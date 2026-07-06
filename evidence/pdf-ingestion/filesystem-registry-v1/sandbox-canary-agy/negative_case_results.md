# Negative Case Results

- Invalid Schema Field: Boolean/numeric checks, missing required keys, or invalid timestamp strings are rejected (PASS)
- Content Hash Mismatch: Modifying the statement content without updating `content_hash` triggers rejection (PASS)
- Commit SHA Mismatch: Record's source commit not matching the manifest's commit SHA causes write denial (PASS)
- Environment Mismatch: Records with `registry_environment` set to `production` are rejected on the sandbox registry (PASS)
- Nonce Replay: Reuse of an active manifest nonce is blocked with `manifest nonce replay` (PASS)
- Write Lockout: Subsequent writes are blocked post-canary by the `state/write-disabled` file (PASS)
- Namespace Mismatch: Namespace parameters not matching the registry's namespace configuration trigger rejection (PASS)
