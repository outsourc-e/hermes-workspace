#!/usr/bin/env python3
"""Founder-run approval-manifest signer.

Signs a manifest with HMAC-SHA256 using the key in CAPTAIN_PDF_APPROVAL_HMAC_KEY,
byte-for-byte compatible with src/approval_gate.py at commit 244621d0
(canonical JSON: sort_keys=True, separators=(",", ":"), ensure_ascii=False;
signature computed over all fields except "signature").

This tool is for the FOUNDER. Running it constitutes the founder's approval;
orchestration agents must not run it.

Usage:
  set -a; source ~/.captain-pdf/secrets.env; set +a
  python3 sign_manifest.py manifest.json [--payload payload.json] [--out signed_manifest.json]

--payload: optionally computes payload_sha256 from a payload JSON file and
inserts it before signing. "AUTO" nonce/idempotency_key are replaced with
fresh random values. The key is never printed.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys

KEY_ENV = "CAPTAIN_PDF_APPROVAL_HMAC_KEY"
REQUIRED_FIELDS = (
    "manifest_id", "environment", "document_ids", "knowledge_ids", "namespace", "schema_version",
    "expires_at", "commit_sha", "payload_sha256", "max_records", "nonce",
    "idempotency_key", "approved_by", "founder_approval", "auto_promotion", "signature",
)


def canonical_json(data) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--payload", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    key = os.environ.get(KEY_ENV, "")
    if not key:
        print(f"BLOCKED: {KEY_ENV} not set (load it via setup_secrets.sh + source)", file=sys.stderr)
        return 2

    with open(args.manifest, encoding="utf-8") as fh:
        manifest = json.load(fh)

    if args.payload:
        with open(args.payload, encoding="utf-8") as fh:
            payload = json.load(fh)
        payload_body = {k: v for k, v in payload.items() if k != "approval_payload_hash"}
        manifest["payload_sha256"] = hashlib.sha256(canonical_json(payload_body).encode("utf-8")).hexdigest()

    if manifest.get("nonce") == "AUTO":
        manifest["nonce"] = secrets.token_hex(16)
    if manifest.get("idempotency_key") == "AUTO":
        manifest["idempotency_key"] = secrets.token_hex(16)

    unfilled = [k for k, v in manifest.items() if isinstance(v, str) and v.startswith("FILL")]
    if unfilled:
        print(f"REFUSED: unfilled placeholder fields: {', '.join(unfilled)}", file=sys.stderr)
        return 3
    missing = [f for f in REQUIRED_FIELDS if f not in manifest]
    if missing:
        print(f"REFUSED: missing required fields: {', '.join(missing)}", file=sys.stderr)
        return 3
    if manifest.get("auto_promotion") is not False:
        print("REFUSED: auto_promotion must be false", file=sys.stderr)
        return 3

    body = {k: v for k, v in manifest.items() if k != "signature"}
    manifest["signature"] = hmac.new(
        key.encode("utf-8"), canonical_json(body).encode("utf-8"), hashlib.sha256
    ).hexdigest()

    out_path = args.out or args.manifest
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.chmod(out_path, 0o600)
    print(f"Signed manifest written securely: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
