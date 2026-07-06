#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import hmac
import io
import json
import os
import stat
import tempfile
import threading
import unittest
import sys

import canary_rollback
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from filesystem_registry import (
    FilesystemRegistry, RegistryConfig, RegistryError, WriteDenied,
    canonical_bytes, payload_hash,
)

KEY = "unit-test-key-not-a-secret"
COMMIT = "a" * 40


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        self.config = RegistryConfig(
            "filesystem", base / "sandbox", base / "production", "pdf-prod", "pdf-test",
            True, False, False,
        )
        self.registry = FilesystemRegistry(self.config, "sandbox")

    def tearDown(self):
        self.temp.cleanup()

    def record(self, knowledge="knowledge-1", document="document-1", **changes):
        statement = changes.pop("statement", "Generated sandbox test statement.")
        value = {
            "schema_version": "1", "registry_environment": "sandbox",
            "registry_namespace": "pdf-test", "knowledge_id": knowledge,
            "document_id": document, "source_hash": hashlib.sha256(b"source").hexdigest(),
            "content_hash": hashlib.sha256(statement.encode()).hexdigest(), "page_number": 1,
            "source_excerpt": "Generated sandbox excerpt.", "statement": statement,
            "knowledge_type": "test_fact", "verification_status": "FOUNDER_APPROVED",
            "approval_manifest_id": "manifest-1", "approval_payload_hash": "0" * 64,
            "source_commit": COMMIT, "model_id": "test-model", "prompt_version": "v1",
            "record_version": 1, "previous_version": None, "status": "FOUNDER_APPROVED",
            "created_at": datetime.now(timezone.utc).isoformat(), "created_by": "targeted-test",
            "correlation_id": "correlation-1",
        }
        value.update(changes)
        return value

    def manifest(self, record, *, nonce="nonce-1", idem="idem-1", **changes):
        body = {
            "manifest_id": record["approval_manifest_id"], "environment": "sandbox",
            "document_ids": [record["document_id"]], "knowledge_ids": [record["knowledge_id"]],
            "namespace": "pdf-test", "schema_version": "1",
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "commit_sha": record["source_commit"], "payload_sha256": payload_hash(record),
            "max_records": 1, "nonce": nonce, "idempotency_key": idem,
            "approved_by": "founder", "founder_approval": True, "auto_promotion": False,
        }
        record["approval_payload_hash"] = body["payload_sha256"]
        body["payload_sha256"] = payload_hash(record)
        record["approval_payload_hash"] = body["payload_sha256"]
        changes = dict(changes)
        body.update(changes)
        body["signature"] = hmac.new(KEY.encode(), canonical_bytes(body), hashlib.sha256).hexdigest()
        return body

    def write_one(self):
        record = self.record()
        manifest = self.manifest(record)
        return record, manifest, self.registry.write(record, manifest, KEY)

    def test_schema_valid_and_invalid(self):
        record = self.record(); self.manifest(record)
        self.registry.validate_record(record)
        del record["statement"]
        with self.assertRaises(WriteDenied): self.registry.validate_record(record)

    def test_boolean_numeric_fields_rejected(self):
        for field in ("page_number", "record_version", "previous_version"):
            record = self.record(**{field: True})
            self.manifest(record)
            with self.assertRaises(WriteDenied):
                self.registry.validate_record(record)

    def test_path_traversal_and_invalid_id(self):
        for bad in ("../escape", "/absolute", "white space"):
            record = self.record(knowledge=bad); manifest = self.manifest(record)
            with self.assertRaises(WriteDenied): self.registry.write(record, manifest, KEY)

    def test_symlink_rejected(self):
        base = Path(self.temp.name); target = base / "target"; target.mkdir()
        (base / "linked").symlink_to(target, target_is_directory=True)
        config = copy.copy(self.config)
        object.__setattr__(config, "sandbox_root", base / "linked" / "registry")
        with self.assertRaises(RegistryError): FilesystemRegistry(config, "sandbox")

    def test_atomic_write_and_interrupted_cleanup(self):
        self.write_one()
        self.assertFalse(list(self.config.sandbox_root.rglob(".*.tmp.*")))
        path = self.config.sandbox_root / "state" / "failure.json"
        with mock.patch("filesystem_registry.os.replace", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt): self.registry._atomic_json(path, {"x": 1})
        self.assertFalse(list(self.config.sandbox_root.rglob(".*.tmp.*")))

    def test_duplicate_create_is_idempotent(self):
        record, manifest, first = self.write_one()
        second = self.registry.write(record, manifest, KEY)
        self.assertEqual(first["result"], "CREATED")
        self.assertEqual(second["result"], "IDEMPOTENT")
        self.assertEqual(len(list((self.config.sandbox_root / "records").glob("*/*.json"))), 1)

    def test_concurrent_write_has_one_record(self):
        record = self.record(); manifest = self.manifest(record)
        results = []
        def run():
            try: results.append(self.registry.write(record, manifest, KEY)["result"])
            except Exception as exc: results.append(type(exc).__name__)
        threads = [threading.Thread(target=run) for _ in range(2)]
        [thread.start() for thread in threads]; [thread.join() for thread in threads]
        self.assertIn("CREATED", results)
        self.assertEqual(len(list((self.config.sandbox_root / "records").glob("*/*.json"))), 1)

    def test_content_hash_mismatch(self):
        record = self.record(content_hash="b" * 64); manifest = self.manifest(record)
        with self.assertRaisesRegex(WriteDenied, "content hash"): self.registry.write(record, manifest, KEY)

    def test_readback_mismatch_and_corrupt_record(self):
        record, _, result = self.write_one(); path = Path(result["path"])
        path.write_text("{}")
        with self.assertRaisesRegex(RegistryError, "checksum"): self.registry.read(record["knowledge_id"], 1)
        digest = hashlib.sha256(b"not-json").hexdigest()
        path.write_bytes(b"not-json")
        path.with_suffix(".json.sha256").write_text(json.dumps({"sha256": digest}))
        os.chmod(path.with_suffix(".json.sha256"), 0o600)
        with self.assertRaisesRegex(RegistryError, "corrupt"): self.registry.read(record["knowledge_id"], 1)
        checksum = path.with_suffix(".json.sha256")
        checksum.unlink(); checksum.symlink_to(path)
        with self.assertRaisesRegex(RegistryError, "unsafe"):
            self.registry.read(record["knowledge_id"], 1)

    def test_dry_run_validates_without_write(self):
        record = self.record(); manifest = self.manifest(record)
        record_path = Path(self.temp.name) / "record.json"
        manifest_path = Path(self.temp.name) / "manifest.json"
        record_path.write_text(json.dumps(record)); manifest_path.write_text(json.dumps(manifest))
        env = {
            "CAPTAIN_PDF_REGISTRY_TYPE": "filesystem",
            "CAPTAIN_PDF_REGISTRY_SANDBOX_ROOT": str(self.config.sandbox_root),
            "CAPTAIN_PDF_REGISTRY_PRODUCTION_ROOT": str(self.config.production_root),
            "CAPTAIN_PDF_REGISTRY_NAMESPACE": "pdf-prod",
            "CAPTAIN_PDF_REGISTRY_TEST_NAMESPACE": "pdf-test",
            "CAPTAIN_PDF_CANONICAL_WRITE_ENABLED": "true",
            "CAPTAIN_PDF_DRY_RUN": "true", "CAPTAIN_PDF_KILL_SWITCH": "false",
            "CAPTAIN_PDF_APPROVAL_HMAC_KEY": KEY,
        }
        argv = ["canary_rollback.py", "dry-run", "--record", str(record_path), "--manifest", str(manifest_path)]
        with mock.patch.dict(os.environ, env), mock.patch.object(sys, "argv", argv), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(canary_rollback.main(), 0)
        self.assertIn("DRY_RUN_VALID", output.getvalue())
        self.assertFalse(self.config.sandbox_root.exists())

    def test_disk_full_fails_closed(self):
        record = self.record(); manifest = self.manifest(record)
        with mock.patch.object(self.registry, "_write_checksum", side_effect=OSError(28, "disk full")):
            with self.assertRaises(OSError): self.registry.write(record, manifest, KEY)
        with self.assertRaisesRegex(RegistryError, "incomplete transaction"):
            self.registry.read("knowledge-1", 1)
        self.registry.recover()
        self.assertFalse((self.config.sandbox_root / "records" / "knowledge-1" / "v000001.json").exists())

    def test_missing_invalid_and_expired_approval(self):
        record = self.record()
        with self.assertRaisesRegex(WriteDenied, "missing"): self.registry.write(record, {}, KEY)
        manifest = self.manifest(record); manifest["signature"] = "0" * 64
        with self.assertRaisesRegex(WriteDenied, "signature"): self.registry.write(record, manifest, KEY)
        manifest = self.manifest(record, expires_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat())
        with self.assertRaisesRegex(WriteDenied, "expired"): self.registry.write(record, manifest, KEY)

    def test_manifest_id_collision_is_denied(self):
        self.write_one()
        record = self.record("knowledge-2", "document-2", statement="Different statement.", correlation_id="correlation-2")
        manifest = self.manifest(record, nonce="nonce-2", idem="idem-2")
        with self.assertRaisesRegex(WriteDenied, "manifest id collision"):
            self.registry.write(record, manifest, KEY)

    def test_concurrent_recovery_waits_for_lock(self):
        self.registry._prepare_root()
        lock_path = self.config.sandbox_root / "state" / "registry.lock"
        finished = []
        with open(lock_path, "a+b") as lock:
            import fcntl, time
            fcntl.flock(lock, fcntl.LOCK_EX)
            worker = threading.Thread(target=lambda: finished.append(self.registry.recover()))
            worker.start(); time.sleep(0.05)
            self.assertTrue(worker.is_alive())
            fcntl.flock(lock, fcntl.LOCK_UN)
        worker.join(timeout=2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(finished, [0])

    def test_nonce_replay(self):
        self.write_one()
        record = self.record("knowledge-2", "document-2", statement="Different statement.", approval_manifest_id="manifest-2", correlation_id="correlation-2")
        manifest = self.manifest(record, nonce="nonce-1", idem="idem-2")
        with self.assertRaisesRegex(WriteDenied, "nonce replay"): self.registry.write(record, manifest, KEY)

    def test_wrong_namespace_commit_and_payload(self):
        cases = [
            ("namespace", "wrong", "namespace"),
            ("commit_sha", "b" * 40, "source commit"),
            ("payload_sha256", "c" * 64, "payload hash"),
            ("environment", "production", "manifest environment"),
        ]
        for field, value, message in cases:
            record = self.record(); manifest = self.manifest(record, **{field: value})
            with self.assertRaisesRegex(WriteDenied, message): self.registry.write(record, manifest, KEY)

    def test_remaining_approval_gate_conditions(self):
        manifest_cases = [
            ({"knowledge_ids": []}, "knowledge id"), ({"document_ids": []}, "document id"),
            ({"max_records": 2}, "max_records"), ({"auto_promotion": True}, "policy"),
            ({"founder_approval": False}, "policy"), ({"idempotency_key": ""}, "idempotency"),
        ]
        for changes, message in manifest_cases:
            record = self.record(); manifest = self.manifest(record, **changes)
            with self.assertRaisesRegex(WriteDenied, message):
                self.registry.write(record, manifest, KEY)
        record = self.record(verification_status="UNVERIFIED"); manifest = self.manifest(record)
        with self.assertRaisesRegex(WriteDenied, "verification"):
            self.registry.write(record, manifest, KEY)

    def test_kill_switch_and_flags(self):
        record = self.record(); manifest = self.manifest(record)
        for enabled, dry, kill, message in ((True, False, True, "kill"), (False, False, False, "write flag"), (True, True, False, "dry-run")):
            cfg = RegistryConfig("filesystem", self.config.sandbox_root, self.config.production_root, "pdf-prod", "pdf-test", enabled, dry, kill)
            with self.assertRaisesRegex(WriteDenied, message): FilesystemRegistry(cfg, "sandbox").write(record, manifest, KEY)

    def transition_record(self, previous, status, version, manifest_id, correlation):
        record = copy.deepcopy(previous)
        record.update(status=status, record_version=version, previous_version=version - 1,
                      approval_manifest_id=manifest_id, correlation_id=correlation,
                      created_at=datetime.now(timezone.utc).isoformat())
        return record

    def test_quarantine_deprecation_and_rollback(self):
        first, _, _ = self.write_one()
        quarantined = self.transition_record(first, "QUARANTINED", 2, "manifest-2", "correlation-2")
        manifest2 = self.manifest(quarantined, nonce="nonce-2", idem="idem-2")
        self.assertEqual(self.registry.transition(quarantined, manifest2, KEY, "QUARANTINED")["result"], "QUARANTINED")
        self.assertEqual(self.registry.transition(quarantined, manifest2, KEY, "QUARANTINED")["result"], "IDEMPOTENT")
        self.assertTrue((self.config.sandbox_root / "quarantine" / "knowledge-1.json").exists())
        deprecated = self.transition_record(quarantined, "DEPRECATED", 3, "manifest-3", "correlation-3")
        replay = self.manifest(deprecated, nonce="nonce-2", idem="idem-replay")
        with self.assertRaisesRegex(WriteDenied, "nonce replay"):
            self.registry.transition(deprecated, replay, KEY, "DEPRECATED")
        manifest3 = self.manifest(deprecated, nonce="nonce-3", idem="idem-3")
        self.assertEqual(self.registry.transition(deprecated, manifest3, KEY, "DEPRECATED")["result"], "DEPRECATED")
        self.assertEqual(self.registry.read("knowledge-1", 1)["status"], "FOUNDER_APPROVED")

    def test_modes_audit_and_no_secret_disclosure(self):
        output = io.StringIO()
        with redirect_stdout(output): self.write_one()
        self.assertNotIn(KEY, output.getvalue())
        self.assertEqual(stat.S_IMODE(self.config.sandbox_root.stat().st_mode), 0o700)
        for path in self.config.sandbox_root.rglob("*"):
            expected = 0o700 if path.is_dir() else 0o600
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), expected, str(path))
        self.assertTrue(list((self.config.sandbox_root / "audit").glob("*.json")))

    def test_recovery(self):
        self.registry._prepare_root()
        orphan = self.config.sandbox_root / "records" / ".record.tmp.orphan"
        orphan.write_text("partial"); os.chmod(orphan, 0o600)
        self.assertEqual(self.registry.recover(), 1)
        self.assertFalse(orphan.exists())

    def test_production_write_never_creates_root(self):
        record = self.record(registry_environment="production", registry_namespace="pdf-prod")
        manifest = self.manifest(record, namespace="pdf-prod")
        production = FilesystemRegistry(self.config, "production")
        with self.assertRaisesRegex(WriteDenied, "production write"): production.write(record, manifest, KEY)
        self.assertFalse(self.config.production_root.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
