# Permission validation

Status: PASS.

- Protected and approval directories: `0700`.
- Sandbox/production roots and their empty structure: `0700`.
- Protected config, HMAC key, unsigned request, and payload: `0600`.
- Owner for every checked path: `jakky`.
- Protected/runtime paths are outside the Git repository and are not tracked.
- No symlink was accepted at protected or registry root paths.
