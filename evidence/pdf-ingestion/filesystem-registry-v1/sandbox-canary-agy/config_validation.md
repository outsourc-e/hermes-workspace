# Config Validation

- `CAPTAIN_PDF_REGISTRY_TYPE`: `filesystem` (PASS)
- Sandbox Root: `/home/jakky/.local/share/captain-pdf/registry/sandbox` (PASS)
- Production Root: `/home/jakky/.local/share/captain-pdf/registry/production` (PASS)
- Production Namespace: `captain-pdf-production` (PASS)
- Sandbox Namespace: `captain-pdf-sandbox` (PASS)
- Namespace Separation: Sandbox and Production namespaces are distinct (PASS)
- `CAPTAIN_PDF_CANONICAL_WRITE_ENABLED` (initial): `false` (PASS)
- `CAPTAIN_PDF_DRY_RUN` (initial): `true` (PASS)
- `CAPTAIN_PDF_KILL_SWITCH`: `false` (PASS)
- HMAC Key Leakage Check: No HMAC key, length, prefix, or hash disclosed (PASS)
