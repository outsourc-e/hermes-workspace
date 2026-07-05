#!/usr/bin/env python3
"""Founder-authorized sandbox canary and immutable rollback utility."""
from __future__ import annotations

import argparse
import json
import os
from dataclasses import replace
from pathlib import Path

from filesystem_registry import FilesystemRegistry, RegistryConfig, RegistryError, WriteDenied


def load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["dry-run", "canary", "quarantine", "rollback", "recover"])
    parser.add_argument("--record")
    parser.add_argument("--manifest")
    args = parser.parse_args()
    try:
        config = RegistryConfig.from_env()
        registry = FilesystemRegistry(config, "sandbox")
        if args.command == "recover":
            print(json.dumps({"result": "RECOVERED", "removed": registry.recover()}))
            return 0
        if not args.record or not args.manifest:
            raise RegistryError("--record and --manifest are required")
        record, manifest = load(args.record), load(args.manifest)
        key = os.environ.get("CAPTAIN_PDF_APPROVAL_HMAC_KEY", "")
        if not key:
            raise WriteDenied("approval HMAC key missing")
        if args.command == "dry-run":
            preview = FilesystemRegistry(replace(config, dry_run=False), "sandbox")
            preview._gate(record, manifest, key)
            print(json.dumps({"result": "DRY_RUN_VALID", "writes": 0}))
            return 0
        registry._gate(record, manifest, key)
        if args.command in {"quarantine", "rollback"}:
            target = "QUARANTINED" if args.command == "quarantine" else "DEPRECATED"
            print(json.dumps(registry.transition(record, manifest, key, target)))
            return 0

        created = registry.write(record, manifest, key)
        repeated = registry.write(record, manifest, key)
        if repeated["result"] != "IDEMPOTENT":
            raise RegistryError("repeat create was not idempotent")
        verified = registry.read(record["knowledge_id"], 1)
        if verified != record:
            raise RegistryError("canary read-back mismatch")

        # Quarantine and rollback/deprecation require separately signed manifests.
        # Stop after the one-record canary; no automatic promotion is possible.
        registry._atomic_json(
            registry.root / "state" / "write-disabled",
            {"canonical_write_enabled": False, "dry_run": True, "reason": "canary completed"},
        )
        print(json.dumps({"result": "CANARY_CREATED", "repeat": "IDEMPOTENT", "write_disabled": True}))
        return 0
    except (RegistryError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
