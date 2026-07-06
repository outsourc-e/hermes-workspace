#!/usr/bin/env python3
"""Governed, local-only Captain PDF filesystem registry v1."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import hmac
import json
import os
import re
import stat
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
HASH_RE = re.compile(r"^[a-f0-9]{64}$")
COMMIT_RE = re.compile(r"^[a-f0-9]{40}$")
STATUSES = {"CANDIDATE", "VERIFIED", "FOUNDER_APPROVED", "CANONICAL", "QUARANTINED", "DEPRECATED"}
REQUIRED_RECORD_FIELDS = {
    "schema_version", "registry_environment", "registry_namespace", "knowledge_id",
    "document_id", "source_hash", "content_hash", "page_number", "source_excerpt",
    "statement", "knowledge_type", "verification_status", "approval_manifest_id",
    "approval_payload_hash", "source_commit", "model_id", "prompt_version",
    "record_version", "previous_version", "status", "created_at", "created_by",
    "correlation_id",
}


class RegistryError(RuntimeError):
    pass


class WriteDenied(RegistryError):
    def __init__(self, reason: str):
        super().__init__(f"WRITE_DENIED FAIL_CLOSED: {reason}")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def payload_hash(record: dict[str, Any]) -> str:
    return sha256_bytes(canonical_bytes({k: v for k, v in record.items() if k != "approval_payload_hash"}))


def _bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    if value.lower() not in {"true", "false"}:
        raise RegistryError(f"{name} must be true or false")
    return value.lower() == "true"


@dataclass(frozen=True)
class RegistryConfig:
    registry_type: str
    sandbox_root: Path
    production_root: Path
    production_namespace: str
    sandbox_namespace: str
    canonical_write_enabled: bool
    dry_run: bool
    kill_switch: bool

    @classmethod
    def from_env(cls) -> "RegistryConfig":
        required = [
            "CAPTAIN_PDF_REGISTRY_TYPE", "CAPTAIN_PDF_REGISTRY_SANDBOX_ROOT",
            "CAPTAIN_PDF_REGISTRY_PRODUCTION_ROOT", "CAPTAIN_PDF_REGISTRY_NAMESPACE",
            "CAPTAIN_PDF_REGISTRY_TEST_NAMESPACE",
        ]
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise RegistryError("missing registry configuration")
        return cls(
            os.environ[required[0]], Path(os.environ[required[1]]), Path(os.environ[required[2]]),
            os.environ[required[3]], os.environ[required[4]],
            _bool_env("CAPTAIN_PDF_CANONICAL_WRITE_ENABLED", False),
            _bool_env("CAPTAIN_PDF_DRY_RUN", True),
            _bool_env("CAPTAIN_PDF_KILL_SWITCH", True),
        )

    def validate(self) -> None:
        if self.registry_type != "filesystem":
            raise RegistryError("registry_type must be filesystem")
        if not self.sandbox_root.is_absolute() or not self.production_root.is_absolute():
            raise RegistryError("registry roots must be absolute")
        if self.sandbox_root == self.production_root:
            raise RegistryError("sandbox and production roots must differ")
        if not ID_RE.fullmatch(self.production_namespace) or not ID_RE.fullmatch(self.sandbox_namespace):
            raise RegistryError("invalid namespace")
        if self.production_namespace == self.sandbox_namespace:
            raise RegistryError("sandbox and production namespaces must differ")


class FilesystemRegistry:
    def __init__(self, config: RegistryConfig, environment: str):
        config.validate()
        if environment not in {"sandbox", "production"}:
            raise RegistryError("invalid registry environment")
        self.config = config
        self.environment = environment
        self.root = config.sandbox_root if environment == "sandbox" else config.production_root
        self.namespace = config.sandbox_namespace if environment == "sandbox" else config.production_namespace
        self._reject_symlink_components(self.root)

    @staticmethod
    def _reject_symlink_components(path: Path) -> None:
        current = Path(path.anchor)
        for part in path.parts[1:]:
            current = current / part
            if current.is_symlink():
                raise RegistryError("symlink path rejected")

    def _prepare_root(self) -> None:
        self._reject_symlink_components(self.root)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.root, 0o700)
        info = self.root.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise RegistryError("registry root ownership or mode invalid")
        for name in ("records", "manifests", "audit", "state", "quarantine"):
            path = self.root / name
            if path.is_symlink():
                raise RegistryError("symlink path rejected")
            path.mkdir(mode=0o700, exist_ok=True)
            os.chmod(path, 0o700)

    @staticmethod
    def _validate_id(value: str, label: str) -> None:
        if not isinstance(value, str) or not ID_RE.fullmatch(value):
            raise WriteDenied(f"invalid {label}")

    @staticmethod
    def validate_record(record: dict[str, Any]) -> None:
        if set(record) != REQUIRED_RECORD_FIELDS:
            raise WriteDenied("record schema fields invalid")
        if record["schema_version"] != "1" or record["registry_environment"] not in {"sandbox", "production"}:
            raise WriteDenied("record schema version or environment invalid")
        for field in ("registry_namespace", "knowledge_id", "document_id", "approval_manifest_id", "correlation_id"):
            FilesystemRegistry._validate_id(record[field], field)
        if not HASH_RE.fullmatch(record["source_hash"]) or not HASH_RE.fullmatch(record["content_hash"]):
            raise WriteDenied("record hash invalid")
        if record["content_hash"] != sha256_bytes(record["statement"].encode()):
            raise WriteDenied("content hash mismatch")
        if not HASH_RE.fullmatch(record["approval_payload_hash"]) or not COMMIT_RE.fullmatch(record["source_commit"]):
            raise WriteDenied("approval hash or source commit invalid")
        if type(record["page_number"]) is not int or record["page_number"] < 1:
            raise WriteDenied("page number invalid")
        if record["verification_status"] not in {"VERIFIED", "FOUNDER_APPROVED"}:
            raise WriteDenied("verification status invalid")
        if record["status"] not in STATUSES:
            raise WriteDenied("status invalid")
        if type(record["record_version"]) is not int or record["record_version"] < 1:
            raise WriteDenied("record version invalid")
        if record["previous_version"] is not None and (type(record["previous_version"]) is not int or record["previous_version"] < 1):
            raise WriteDenied("previous version invalid")
        for field in ("source_excerpt", "statement", "knowledge_type", "model_id", "prompt_version", "created_by"):
            if not isinstance(record[field], str) or not record[field]:
                raise WriteDenied(f"{field} invalid")
        try:
            parsed = datetime.fromisoformat(record["created_at"].replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError
        except (ValueError, AttributeError):
            raise WriteDenied("created_at invalid") from None

    @staticmethod
    def _validate_manifest_signature(manifest: dict[str, Any], key: str) -> None:
        signature = manifest.get("signature", "")
        body = {k: v for k, v in manifest.items() if k != "signature"}
        expected = hmac.new(key.encode(), canonical_bytes(body), hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected):
            raise WriteDenied("approval manifest signature invalid")

    def _gate(self, record: dict[str, Any], manifest: dict[str, Any], key: str) -> None:
        if record.get("registry_environment") != self.environment:
            raise WriteDenied("registry environment mismatch")
        if self.environment == "production":
            raise WriteDenied("production write is not approved")
        if not manifest:
            raise WriteDenied("approval manifest missing")
        if manifest.get("environment") != self.environment:
            raise WriteDenied("manifest environment mismatch")
        if (self.root / "state" / "write-disabled").exists():
            raise WriteDenied("sandbox write disabled after canary")
        if self.config.kill_switch:
            raise WriteDenied("kill switch active")
        if not self.config.canonical_write_enabled:
            raise WriteDenied("write flag disabled")
        if self.config.dry_run:
            raise WriteDenied("dry-run active")
        self._validate_manifest_signature(manifest, key)
        try:
            expires = datetime.fromisoformat(str(manifest["expires_at"]).replace("Z", "+00:00"))
        except (KeyError, ValueError):
            raise WriteDenied("manifest expiry invalid") from None
        if expires.tzinfo is None or expires <= datetime.now(timezone.utc):
            raise WriteDenied("approval manifest expired")
        if manifest.get("commit_sha") != record.get("source_commit"):
            raise WriteDenied("source commit mismatch")
        if manifest.get("payload_sha256") != payload_hash(record) or record.get("approval_payload_hash") != manifest.get("payload_sha256"):
            raise WriteDenied("payload hash mismatch")
        if record.get("knowledge_id") not in manifest.get("knowledge_ids", []):
            raise WriteDenied("knowledge id not approved")
        if record.get("document_id") not in manifest.get("document_ids", []):
            raise WriteDenied("document id not approved")
        if manifest.get("namespace") != self.namespace or record.get("registry_namespace") != self.namespace:
            raise WriteDenied("namespace mismatch")
        self.validate_record(record)
        if manifest.get("max_records") != 1:
            raise WriteDenied("max_records invalid")
        if manifest.get("auto_promotion") is not False or manifest.get("founder_approval") is not True:
            raise WriteDenied("founder approval policy invalid")
        if not manifest.get("idempotency_key") or not manifest.get("nonce"):
            raise WriteDenied("idempotency key or nonce missing")
        if record.get("approval_manifest_id") != manifest.get("manifest_id"):
            raise WriteDenied("manifest id mismatch")

    def _atomic_json(self, path: Path, value: Any) -> str:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if path.parent.is_symlink() or path.is_symlink():
            raise RegistryError("symlink path rejected")
        os.chmod(path.parent, 0o700)
        data = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True).encode() + b"\n"
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.tmp.", dir=path.parent)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb", closefd=True) as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, path)
            os.chmod(path, 0o600)
            dir_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except BaseException:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass
            raise
        return sha256_bytes(data)

    def _write_checksum(self, path: Path, digest: str) -> None:
        checksum = path.with_suffix(path.suffix + ".sha256")
        self._atomic_json(checksum, {"sha256": digest, "file": path.name})

    def _load_state(self, name: str) -> dict[str, Any]:
        path = self.root / "state" / name
        if not path.exists():
            return {}
        return json.loads(path.read_text())

    def _audit(self, action: str, record: dict[str, Any], result: str) -> None:
        event = {
            "action": action, "result": result, "knowledge_id": record["knowledge_id"],
            "record_version": record["record_version"], "correlation_id": record["correlation_id"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        event_id = f"{event['timestamp'].replace(':', '').replace('+', '_')}-{record['correlation_id']}-{action}.json"
        self._atomic_json(self.root / "audit" / event_id, event)

    def _stored_json_matches(self, path: Path, expected: dict[str, Any]) -> bool:
        checksum_path = path.with_suffix(path.suffix + ".sha256")
        for candidate in (path, checksum_path):
            if candidate.is_symlink() or not candidate.is_file():
                return False
            info = candidate.stat()
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
                return False
        data = path.read_bytes()
        try:
            checksum = json.loads(checksum_path.read_text())["sha256"]
            stored = json.loads(data)
        except (KeyError, json.JSONDecodeError):
            return False
        return hmac.compare_digest(sha256_bytes(data), checksum) and stored == expected

    def _begin_transaction(self, record_path: Path, manifest_path: Path, manifest_new: bool, record: dict[str, Any], manifest: dict[str, Any], action: str) -> None:
        self._atomic_json(self.root / "state" / "transaction.json", {
            "record_path": str(record_path), "manifest_path": str(manifest_path),
            "manifest_new": manifest_new, "idempotency_key": manifest["idempotency_key"],
            "nonce": manifest["nonce"], "correlation_id": record["correlation_id"],
            "action": action,
            "quarantine_path": str(self.root / "quarantine" / f"{record['knowledge_id']}.json") if action == "QUARANTINED" else "",
        })

    def _finish_transaction(self) -> None:
        path = self.root / "state" / "transaction.json"
        path.unlink()
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def write(self, record: dict[str, Any], manifest: dict[str, Any], key: str) -> dict[str, Any]:
        self._gate(record, manifest, key)
        self._prepare_root()
        lock_path = self.root / "state" / "registry.lock"
        with open(lock_path, "a+b") as lock:
            os.chmod(lock_path, 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX)
            idempotency = self._load_state("idempotency.json")
            nonce = self._load_state("nonces.json")
            idem_key = manifest["idempotency_key"]
            requested_hash = payload_hash(record)
            if idem_key in idempotency:
                if idempotency[idem_key]["payload_hash"] != requested_hash:
                    raise WriteDenied("idempotency key payload conflict")
                if self.read(record["knowledge_id"], record["record_version"]) != record:
                    raise RegistryError("idempotent record verification failed")
                return {"result": "IDEMPOTENT", "path": idempotency[idem_key]["path"]}
            if manifest["nonce"] in nonce:
                raise WriteDenied("manifest nonce replay")
            if record["record_version"] != 1 or record["previous_version"] is not None or record["status"] != "FOUNDER_APPROVED":
                raise WriteDenied("initial state transition invalid")
            for candidate in (self.root / "records").glob("*/*.json"):
                existing = json.loads(candidate.read_text())
                if existing.get("content_hash") == record["content_hash"] and existing.get("knowledge_id") != record["knowledge_id"]:
                    raise WriteDenied("content hash must be unique")
            record_path = self.root / "records" / record["knowledge_id"] / "v000001.json"
            if record_path.exists() or record_path.is_symlink():
                raise WriteDenied("immutable record already exists")
            manifest_path = self.root / "manifests" / f"{manifest['manifest_id']}.json"
            manifest_new = not manifest_path.exists()
            if not manifest_new and not self._stored_json_matches(manifest_path, manifest):
                raise WriteDenied("manifest id collision or corrupt stored manifest")
            self._begin_transaction(record_path, manifest_path, manifest_new, record, manifest, "CREATE")
            digest = self._atomic_json(record_path, record)
            self._write_checksum(record_path, digest)
            if manifest_new:
                manifest_digest = self._atomic_json(manifest_path, manifest)
                self._write_checksum(manifest_path, manifest_digest)
            verified = self.read(record["knowledge_id"], 1, _internal=True)
            if verified != record:
                raise RegistryError("read-back mismatch")
            idempotency[idem_key] = {"payload_hash": requested_hash, "path": str(record_path)}
            nonce[manifest["nonce"]] = {"manifest_id": manifest["manifest_id"]}
            self._atomic_json(self.root / "state" / "idempotency.json", idempotency)
            self._atomic_json(self.root / "state" / "nonces.json", nonce)
            self._audit("CREATE", record, "SUCCESS")
            self._finish_transaction()
            if self.read(record["knowledge_id"], 1) != record:
                raise RegistryError("committed read-back mismatch")
            return {"result": "CREATED", "path": str(record_path)}

    def read(self, knowledge_id: str, version: int, _internal: bool = False) -> dict[str, Any]:
        self._validate_id(knowledge_id, "knowledge_id")
        path = self.root / "records" / knowledge_id / f"v{version:06d}.json"
        transaction = self._load_state("transaction.json")
        if not _internal and transaction.get("record_path") == str(path):
            raise RegistryError("incomplete transaction")
        if path.is_symlink() or not path.is_file():
            raise RegistryError("record not found or unsafe")
        if stat.S_IMODE(path.stat().st_mode) != 0o600 or path.stat().st_uid != os.getuid():
            raise RegistryError("record permission invalid")
        data = path.read_bytes()
        checksum_path = path.with_suffix(path.suffix + ".sha256")
        if checksum_path.is_symlink() or not checksum_path.is_file():
            raise RegistryError("checksum file missing or unsafe")
        checksum_info = checksum_path.stat()
        if checksum_info.st_uid != os.getuid() or stat.S_IMODE(checksum_info.st_mode) != 0o600:
            raise RegistryError("checksum permission invalid")
        expected = json.loads(checksum_path.read_text())["sha256"]
        if not hmac.compare_digest(sha256_bytes(data), expected):
            raise RegistryError("record checksum mismatch")
        try:
            record = json.loads(data)
        except json.JSONDecodeError:
            raise RegistryError("corrupt record") from None
        self.validate_record(record)
        return record

    def recover(self, _locked: bool = False) -> int:
        self._prepare_root()
        if not _locked:
            lock_path = self.root / "state" / "registry.lock"
            with open(lock_path, "a+b") as lock:
                os.chmod(lock_path, 0o600)
                fcntl.flock(lock, fcntl.LOCK_EX)
                return self.recover(_locked=True)
        removed = 0
        transaction = self._load_state("transaction.json")
        if transaction:
            record_path = Path(transaction["record_path"])
            cleanup = [record_path, record_path.with_suffix(record_path.suffix + ".sha256")]
            if transaction.get("manifest_new"):
                manifest_path = Path(transaction["manifest_path"])
                cleanup.extend([manifest_path, manifest_path.with_suffix(manifest_path.suffix + ".sha256")])
            if transaction.get("quarantine_path"):
                cleanup.append(Path(transaction["quarantine_path"]))
            for path in cleanup:
                if path.is_file() and not path.is_symlink():
                    path.unlink()
                    removed += 1
            for path in (self.root / "audit").glob(f"*{transaction['correlation_id']}*{transaction['action']}*.json"):
                if path.is_file() and not path.is_symlink():
                    path.unlink()
                    removed += 1
            idempotency = self._load_state("idempotency.json")
            nonces = self._load_state("nonces.json")
            idempotency.pop(transaction["idempotency_key"], None)
            nonces.pop(transaction["nonce"], None)
            self._atomic_json(self.root / "state" / "idempotency.json", idempotency)
            self._atomic_json(self.root / "state" / "nonces.json", nonces)
            (self.root / "state" / "transaction.json").unlink()
            removed += 1
        for path in self.root.rglob(".*.tmp.*"):
            if path.is_file() and not path.is_symlink():
                path.unlink()
                removed += 1
        return removed

    def transition(self, record: dict[str, Any], manifest: dict[str, Any], key: str, target: str, _locked: bool = False) -> dict[str, Any]:
        if target not in {"QUARANTINED", "DEPRECATED"}:
            raise WriteDenied("transition target invalid")
        self._gate(record, manifest, key)
        self._prepare_root()
        if not _locked:
            lock_path = self.root / "state" / "registry.lock"
            with open(lock_path, "a+b") as lock:
                os.chmod(lock_path, 0o600)
                fcntl.flock(lock, fcntl.LOCK_EX)
                return self.transition(record, manifest, key, target, _locked=True)
        idempotency = self._load_state("idempotency.json")
        nonces = self._load_state("nonces.json")
        idem_key = manifest["idempotency_key"]
        requested_hash = payload_hash(record)
        if idem_key in idempotency:
            if idempotency[idem_key]["payload_hash"] != requested_hash:
                raise WriteDenied("idempotency key payload conflict")
            if self.read(record["knowledge_id"], record["record_version"]) != record:
                raise RegistryError("idempotent record verification failed")
            return {"result": "IDEMPOTENT", "path": idempotency[idem_key]["path"]}
        if manifest["nonce"] in nonces:
            raise WriteDenied("manifest nonce replay")
        self._prepare_root()
        previous = self.read(record["knowledge_id"], record["previous_version"])
        allowed = {("FOUNDER_APPROVED", "QUARANTINED"), ("QUARANTINED", "DEPRECATED")}
        if (previous["status"], target) not in allowed or record["status"] != target or record["record_version"] != previous["record_version"] + 1:
            raise WriteDenied("state transition invalid")
        path = self.root / "records" / record["knowledge_id"] / f"v{record['record_version']:06d}.json"
        if path.exists():
            raise WriteDenied("immutable version already exists")
        manifest_path = self.root / "manifests" / f"{manifest['manifest_id']}.json"
        manifest_new = not manifest_path.exists()
        if not manifest_new and not self._stored_json_matches(manifest_path, manifest):
            raise WriteDenied("manifest id collision or corrupt stored manifest")
        self._begin_transaction(path, manifest_path, manifest_new, record, manifest, target)
        digest = self._atomic_json(path, record)
        self._write_checksum(path, digest)
        if target == "QUARANTINED":
            marker = self.root / "quarantine" / f"{record['knowledge_id']}.json"
            self._atomic_json(marker, {"knowledge_id": record["knowledge_id"], "version": record["record_version"]})
        if manifest_new:
            manifest_digest = self._atomic_json(manifest_path, manifest)
            self._write_checksum(manifest_path, manifest_digest)
        if self.read(record["knowledge_id"], record["record_version"], _internal=True) != record:
            raise RegistryError("read-back mismatch")
        self._audit(target, record, "SUCCESS")
        idempotency[idem_key] = {"payload_hash": requested_hash, "path": str(path)}
        nonces[manifest["nonce"]] = {"manifest_id": manifest["manifest_id"]}
        self._atomic_json(self.root / "state" / "idempotency.json", idempotency)
        self._atomic_json(self.root / "state" / "nonces.json", nonces)
        self._finish_transaction()
        if self.read(record["knowledge_id"], record["record_version"]) != record:
            raise RegistryError("committed read-back mismatch")
        return {"result": target, "path": str(path)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["recover", "validate"])
    parser.add_argument("--record")
    parser.add_argument("--environment", choices=["sandbox", "production"], default="sandbox")
    args = parser.parse_args()
    try:
        config = RegistryConfig.from_env()
        registry = FilesystemRegistry(config, args.environment)
        if args.command == "recover":
            print(json.dumps({"result": "RECOVERED", "temporary_files_removed": registry.recover()}))
        else:
            if not args.record:
                raise RegistryError("--record is required")
            registry.validate_record(json.loads(Path(args.record).read_text()))
            print(json.dumps({"result": "VALID"}))
        return 0
    except RegistryError as exc:
        print(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
