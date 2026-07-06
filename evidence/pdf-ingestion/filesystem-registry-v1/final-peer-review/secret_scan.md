# Secret Scan

- Staged delta for canary evidence commit (17 files): git diff --cached --check clean; pattern scan for private
  keys, HMAC key material, full signatures, GitHub tokens (ghp_/github_pat_), AWS keys (AKIA): 0 hits
- Tracked-file name scan on merged tree: no secrets.env, founder_hmac key, signed approval_manifest.json,
  sandbox_canary_payload.json, or registry runtime roots tracked
- approval_manifest_template.json and unsigned_approval_request.json contain FILL placeholders and empty
  signature fields only
- Handoff scripts collect secrets with hidden input and write outside Git (0700/0600); test_secure_handoff.sh
  proves no secret reaches stdout/stderr/xtrace
- Evidence files reference protected paths by name only, never contents

Verdict: PASS — no secret tracked
