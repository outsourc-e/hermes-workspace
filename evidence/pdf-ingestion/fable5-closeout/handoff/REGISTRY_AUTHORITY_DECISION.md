# Registry Authority Decision

Status: `APPROVED_WITH_CONDITIONS`

## Approved authority

Founder approved Local Filesystem Canonical Knowledge Registry v1 for `captain-pdf-knowledge-ingestion`. The implementation authority is `evidence/pdf-ingestion/filesystem-registry-v1/FILESYSTEM_REGISTRY_CONTRACT.md`; record and configuration schema authorities are the two JSON Schema files in that directory.

## Runtime boundaries

- Sandbox root: `/home/jakky/.local/share/captain-pdf/registry/sandbox`
- Production root: `/home/jakky/.local/share/captain-pdf/registry/production`
- Sandbox implementation and read-only production validation: approved.
- Sandbox canary: conditional on a valid Founder-signed manifest.
- Production canonical write: not approved and hard-denied in adapter code.
- Automatic promotion: prohibited.
- Network API, new database, service, and cost: not approved or required.

## Authentication

Authority uses current OS-user ownership, `0700` directories, `0600` files, explicit environment/namespace, Founder HMAC approval manifest, write flag, dry-run flag, kill switch, nonce/idempotency state, and append-only audit events. Registry URL and Registry Token are not part of the filesystem contract.

## Remaining Founder gate

No valid signed sandbox canary manifest is available. `unsigned_approval_request.json` is the handoff artifact. No signer or canary may run until the Founder supplies the signature and HMAC authorization outside Git.
