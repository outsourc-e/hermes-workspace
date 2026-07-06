# Production Guard — post-merge verification (2026-07-06)

- Production root /home/jakky/.local/share/captain-pdf/registry/production: 0 files (record count unchanged)
- Production tree hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (empty, unchanged)
- Sandbox state/write-disabled marker: PRESENT
- Sandbox record count: exactly 1 (the AGY canary record)
- Merged code defaults: CAPTAIN_PDF_CANONICAL_WRITE_ENABLED=False, CAPTAIN_PDF_DRY_RUN=True,
  CAPTAIN_PDF_KILL_SWITCH=True (verified at filesystem_registry.py lines 87-89)
- Production hard-deny present: "production write is not approved" (line 189)
- Write-enabled processes: none running
- Runtime secrets, signed manifest, HMAC key: not tracked by Git
- No production approval or production manifest created
- Approved level after merge: SANDBOX_CANARY_VERIFIED (NOT PRODUCTION_WRITE_APPROVED)
