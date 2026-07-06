#!/usr/bin/env python3
"""Read-only external-registry preflight probe (Gate 2 evidence generator).

Verifies, without writing anything: endpoint reachability, TLS certificate,
authentication acceptance, and namespace read access. Prints a redacted
evidence JSON to stdout (and optionally to a file). The token value is never
printed; only its presence and length class are recorded.

Usage:
  set -a; source ~/.captain-pdf/secrets.env; set +a
  python3 verify_external_registry.py [--namespace captain-pdf-test] [--out evidence.json]

Exit codes: 0 = all probes PASS, 2 = BLOCKED (env unset), 3 = one or more probes FAIL.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ENDPOINT_ENV = "CAPTAIN_PDF_REGISTRY_URL"
TOKEN_ENV = "CAPTAIN_PDF_REGISTRY_TOKEN"
TIMEOUT_S = 30


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def tls_probe(host: str, port: int) -> dict:
    ctx = ssl.create_default_context()
    with socket.create_connection((host, port), timeout=TIMEOUT_S) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            cert = tls.getpeercert()
    return {
        "status": "PASS",
        "protocol_floor": "verified by default context (hostname + chain checked)",
        "subject": dict(x[0] for x in cert.get("subject", ())),
        "issuer": dict(x[0] for x in cert.get("issuer", ())),
        "not_after": cert.get("notAfter"),
    }


def http_get(url: str, token: str | None) -> dict:
    req = urllib.request.Request(url, method="GET")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            body = resp.read(4096)
            return {"status_code": resp.status, "content_type": resp.headers.get("Content-Type"),
                    "body_prefix_sha256_len": len(body)}
    except urllib.error.HTTPError as exc:
        return {"status_code": exc.code, "error": exc.reason}
    except (urllib.error.URLError, OSError) as exc:
        return {"status_code": None, "error": str(getattr(exc, "reason", exc))}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--namespace", default="captain-pdf-test")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    endpoint = os.environ.get(ENDPOINT_ENV, "")
    token = os.environ.get(TOKEN_ENV, "")
    evidence: dict = {
        "probe": "verify_external_registry",
        "timestamp": utc_now(),
        "namespace_requested": args.namespace,
        "endpoint_env_set": bool(endpoint),
        "token_env_set": bool(token),
        "token_redacted": "present" if token else "absent",
    }

    if not endpoint or not token:
        evidence["result"] = "BLOCKED"
        evidence["reason"] = "required registry environment is incomplete"
        print(json.dumps(evidence, indent=2))
        return 2

    parsed = urllib.parse.urlparse(endpoint)
    evidence["endpoint_scheme"] = parsed.scheme
    evidence["endpoint_host"] = parsed.hostname
    if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1"):
        evidence["result"] = "FAIL"
        evidence["reason"] = "non-https endpoint refused for non-local host"
        print(json.dumps(evidence, indent=2))
        return 3

    checks: dict = {}
    if parsed.scheme == "https":
        try:
            checks["tls"] = tls_probe(parsed.hostname, parsed.port or 443)
        except (ssl.SSLError, OSError) as exc:
            checks["tls"] = {"status": "FAIL", "error": type(exc).__name__}
    else:
        checks["tls"] = {"status": "SKIPPED", "reason": "local http endpoint"}

    base = endpoint.rstrip("/")
    checks["unauthenticated_root"] = http_get(base + "/", token=None)
    checks["authenticated_root"] = http_get(base + "/", token=token or None)
    checks["namespace_read"] = http_get(
        base + "/namespaces/" + urllib.parse.quote(args.namespace), token=token or None
    )

    tls_ok = checks["tls"]["status"] in ("PASS", "SKIPPED")
    auth_ok = checks["authenticated_root"].get("status_code") not in (None, 401, 403)
    ns_ok = checks["namespace_read"].get("status_code") not in (None, 401, 403, 404)
    evidence["checks"] = checks
    evidence["result"] = "PASS" if (tls_ok and auth_ok and ns_ok) else "FAIL"

    out = json.dumps(evidence, indent=2)
    print(out)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(out + "\n")
    return 0 if evidence["result"] == "PASS" else 3


if __name__ == "__main__":
    sys.exit(main())
