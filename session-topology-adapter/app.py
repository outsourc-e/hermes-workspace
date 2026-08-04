#!/usr/bin/env python3
"""Read-only HTTP projection of persisted Hermes session topology."""

from __future__ import annotations

import base64
from collections import deque, OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
import errno
import fcntl
import hashlib
import hmac
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import struct
import sys
import threading
import time
from typing import Any, Callable
from urllib.parse import parse_qs, quote, urlsplit


PROFILE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
DEFAULT_LIMIT = 100
MIN_LIMIT = 1
MAX_LIMIT = 500
# The adapter only projects the stable session-column subset below. Hermes
# schema v25 retains that contract while adding newer accounting/activity
# columns, so both reviewed producer schemas are safe to read. Future schema
# revisions remain fail-closed until explicitly reviewed.
SUPPORTED_SCHEMA_VERSIONS = frozenset((23, 25))
DATABASE_READ_ATTEMPTS = 3
DEFAULT_MAX_CACHED_SNAPSHOT_ROWS = 100_000
DEFAULT_MAX_CACHED_SNAPSHOT_BYTES = 64 * 1024 * 1024
DEFAULT_MAX_SCALAR_BYTES = 64 * 1024
SQLITE_RESERVED_BYTE = 0x40000001
FLOCK_FORMAT = "hhqqi"
SESSION_COLUMNS = (
    "id",
    "parent_session_id",
    "source",
    "started_at",
    "ended_at",
    "end_reason",
    "archived",
)
ALLOWED_QUERY_PARAMETERS = {"profile", "limit", "cursor", "snapshot"}


class ClientError(Exception):
    def __init__(self, status: HTTPStatus, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


@dataclass(frozen=True)
class Config:
    token: str
    data_dir: Path = Path("/data")
    host: str = "0.0.0.0"
    port: int = 8080
    snapshot_ttl_seconds: int = 60
    max_snapshots: int = 32
    max_snapshot_rows: int = 50_000
    max_cached_snapshot_rows: int = DEFAULT_MAX_CACHED_SNAPSHOT_ROWS
    max_cached_snapshot_bytes: int = DEFAULT_MAX_CACHED_SNAPSHOT_BYTES
    max_scalar_bytes: int = DEFAULT_MAX_SCALAR_BYTES
    max_concurrent_snapshots: int = 1

    def __post_init__(self) -> None:
        if not isinstance(self.token, str) or not self.token.strip():
            raise ValueError("SESSION_TOPOLOGY_ADAPTER_TOKEN must be non-empty")
        if self.snapshot_ttl_seconds <= 0:
            raise ValueError("snapshot TTL must be positive")
        if self.max_snapshots <= 0:
            raise ValueError("maximum snapshots must be positive")
        if self.max_snapshot_rows <= 0:
            raise ValueError("maximum snapshot rows must be positive")
        if self.max_cached_snapshot_rows <= 0:
            raise ValueError("maximum cached snapshot rows must be positive")
        if self.max_cached_snapshot_bytes <= 0:
            raise ValueError("maximum cached snapshot bytes must be positive")
        if self.max_scalar_bytes <= 0:
            raise ValueError("maximum scalar bytes must be positive")
        if self.max_concurrent_snapshots <= 0:
            raise ValueError("maximum concurrent snapshots must be positive")
        if not 0 <= self.port <= 65_535:
            raise ValueError("port must be between 0 and 65535")

    @classmethod
    def from_env(cls) -> "Config":
        token = os.environ.get("SESSION_TOPOLOGY_ADAPTER_TOKEN", "")
        return cls(
            token=token,
            data_dir=Path(os.environ.get("SESSION_TOPOLOGY_ADAPTER_DATA_DIR", "/data")),
            host=os.environ.get("SESSION_TOPOLOGY_ADAPTER_HOST", "0.0.0.0"),
            port=_positive_or_zero_env("SESSION_TOPOLOGY_ADAPTER_PORT", 8080),
            snapshot_ttl_seconds=_positive_env(
                "SESSION_TOPOLOGY_ADAPTER_SNAPSHOT_TTL_SECONDS", 60
            ),
            max_snapshots=_positive_env(
                "SESSION_TOPOLOGY_ADAPTER_MAX_SNAPSHOTS", 32
            ),
            max_snapshot_rows=_positive_env(
                "SESSION_TOPOLOGY_ADAPTER_MAX_SNAPSHOT_ROWS", 50_000
            ),
            max_cached_snapshot_rows=_positive_env(
                "SESSION_TOPOLOGY_ADAPTER_MAX_CACHED_SNAPSHOT_ROWS",
                DEFAULT_MAX_CACHED_SNAPSHOT_ROWS,
            ),
            max_cached_snapshot_bytes=_positive_env(
                "SESSION_TOPOLOGY_ADAPTER_MAX_CACHED_SNAPSHOT_BYTES",
                DEFAULT_MAX_CACHED_SNAPSHOT_BYTES,
            ),
            max_scalar_bytes=_positive_env(
                "SESSION_TOPOLOGY_ADAPTER_MAX_SCALAR_BYTES",
                DEFAULT_MAX_SCALAR_BYTES,
            ),
            max_concurrent_snapshots=_positive_env(
                "SESSION_TOPOLOGY_ADAPTER_MAX_CONCURRENT_SNAPSHOTS", 1
            ),
        )


def _positive_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _positive_or_zero_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if value < 0:
        raise ValueError(f"{name} must not be negative")
    return value


@dataclass
class _DatabaseHandle:
    data_fd: int
    profile_fd: int
    database_fd: int
    profile: str | None
    profiles_fd: int | None = None

    @property
    def descriptor_path(self) -> Path:
        return Path(f"/proc/self/fd/{self.database_fd}")

    @property
    def identity(self) -> tuple[int, int]:
        details = os.fstat(self.database_fd)
        return details.st_dev, details.st_ino

    def validate_namespace(self) -> None:
        if self.profile is not None:
            if self.profiles_fd is None:
                raise OSError("named profile is missing its profiles directory handle")
            _require_held_entry(self.data_fd, "profiles", self.profiles_fd, stat.S_ISDIR)
            _require_held_entry(
                self.profiles_fd, self.profile, self.profile_fd, stat.S_ISDIR
            )
        _require_held_entry(self.profile_fd, "state.db", self.database_fd, stat.S_ISREG)

    def close(self) -> None:
        for descriptor in {
            self.database_fd,
            self.profile_fd,
            self.profiles_fd,
            self.data_fd,
        }:
            if descriptor is not None:
                os.close(descriptor)


def _require_held_entry(
    parent_fd: int,
    name: str,
    held_fd: int,
    predicate: Callable[[int], bool],
) -> None:
    try:
        current = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        held = os.fstat(held_fd)
    except (FileNotFoundError, NotADirectoryError) as error:
        raise ClientError(HTTPStatus.NOT_FOUND, "profile_not_found") from error
    except OSError as error:
        raise ClientError(
            HTTPStatus.SERVICE_UNAVAILABLE, "persistence_unavailable"
        ) from error
    if (
        stat.S_ISLNK(current.st_mode)
        or not predicate(current.st_mode)
        or not predicate(held.st_mode)
        or (current.st_dev, current.st_ino) != (held.st_dev, held.st_ino)
    ):
        raise ClientError(HTTPStatus.NOT_FOUND, "profile_not_found")


def _open_component(
    parent_fd: int,
    name: str,
    flags: int,
    predicate: Callable[[int], bool],
) -> int:
    try:
        descriptor = os.open(name, flags, dir_fd=parent_fd)
    except OSError as error:
        if error.errno in {errno.ENOENT, errno.ENOTDIR, errno.ELOOP}:
            raise ClientError(HTTPStatus.NOT_FOUND, "profile_not_found") from error
        raise ClientError(
            HTTPStatus.SERVICE_UNAVAILABLE, "persistence_unavailable"
        ) from error
    try:
        if not predicate(os.fstat(descriptor).st_mode):
            raise ClientError(HTTPStatus.NOT_FOUND, "profile_not_found")
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def _open_directory_path(path: Path) -> int:
    """Use dir_fd/openat-style descent beneath held parents without symlinks."""
    directory_flags = os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW
    absolute = Path(os.path.abspath(path))
    descriptor = os.open("/", directory_flags)
    try:
        for component in absolute.parts[1:]:
            child = _open_component(
                descriptor, component, directory_flags, stat.S_ISDIR
            )
            os.close(descriptor)
            descriptor = child
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def _rollback_transaction_active(database: _DatabaseHandle) -> bool:
    """Use SQLite's reserved lock byte to distinguish a live rollback writer.

    Journal bytes alone are not authoritative: completed PERSIST journals and
    stale malformed journals may remain on disk. SQLite's Unix VFS reserves
    PENDING_BYTE + 1 while a rollback transaction is active, so F_GETLK can
    inspect that lock without acquiring it or mutating the database.
    """
    database.validate_namespace()
    try:
        journal = os.stat(
            "state.db-journal",
            dir_fd=database.profile_fd,
            follow_symlinks=False,
        )
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(journal.st_mode):
        raise OSError("database journal is not a regular file")
    requested = struct.pack(
        FLOCK_FORMAT,
        fcntl.F_WRLCK,
        os.SEEK_SET,
        SQLITE_RESERVED_BYTE,
        1,
        0,
    )
    result = fcntl.fcntl(database.database_fd, fcntl.F_GETLK, requested)
    lock_type, _whence, _start, _length, _pid = struct.unpack(FLOCK_FORMAT, result)
    return lock_type != fcntl.F_UNLCK


def _read_only_authorizer(
    action: int,
    argument_one: str | None,
    argument_two: str | None,
    database_name: str | None,
    trigger_name: str | None,
) -> int:
    del database_name, trigger_name
    if action in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION):
        return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_TRANSACTION:
        operation = (argument_one or "").upper()
        if operation in {"BEGIN", "COMMIT", "ROLLBACK"} and argument_two is None:
            return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_PRAGMA:
        pragma = (argument_one or "").lower()
        if pragma == "query_only" and argument_two is None:
            return sqlite3.SQLITE_OK
        if pragma == "table_info" and argument_two == "schema_version":
            return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY


def _open_live_database(database: _DatabaseHandle) -> sqlite3.Connection:
    """Open the live SQLite source with independent physical and logical guards."""
    database.validate_namespace()
    expected_identity = database.identity
    encoded_path = quote(str(database.descriptor_path), safe="/")
    connection = sqlite3.connect(f"file:{encoded_path}?mode=ro", uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA query_only=ON")
        query_only = connection.execute("PRAGMA query_only").fetchone()
        if query_only is None or query_only[0] != 1:
            raise sqlite3.OperationalError("failed to enforce query_only")
        databases = connection.execute("PRAGMA database_list").fetchall()
        if len(databases) != 1 or databases[0][1] != "main" or not databases[0][2]:
            raise sqlite3.OperationalError("failed to identify opened database")
        opened_database = os.stat(databases[0][2], follow_symlinks=False)
        if (
            not stat.S_ISREG(opened_database.st_mode)
            or (opened_database.st_dev, opened_database.st_ino) != expected_identity
        ):
            raise sqlite3.OperationalError("opened database identity mismatch")
        database.validate_namespace()
        connection.set_authorizer(_read_only_authorizer)
        return connection
    except Exception:
        connection.close()
        raise


@dataclass(frozen=True)
class Snapshot:
    identifier: str
    profile: str | None
    expires_at: float
    sessions: tuple[dict[str, Any], ...]
    byte_size: int


class TopologyService:
    def __init__(
        self,
        config: Config,
        *,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self.config = config
        self._clock = clock or time.time
        self._snapshots: OrderedDict[str, Snapshot] = OrderedDict()
        self._cached_snapshot_rows = 0
        self._cached_snapshot_bytes = 0
        self._snapshot_lock = threading.Lock()
        self._snapshot_admission = threading.BoundedSemaphore(
            config.max_concurrent_snapshots
        )
        self._cursor_key = hashlib.sha256(
            b"session-topology-adapter-cursor\0" + config.token.encode("utf-8")
        ).digest()

    def get_page(self, query: str) -> dict[str, Any]:
        parameters = parse_qs(query, keep_blank_values=True, strict_parsing=True)
        unknown = set(parameters) - ALLOWED_QUERY_PARAMETERS
        if unknown:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_query")

        profile = self._parse_profile(parameters)
        limit = self._parse_limit(parameters)
        cursor_values = parameters.get("cursor")
        snapshot_values = parameters.get("snapshot")

        if cursor_values is None:
            if snapshot_values is not None:
                raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
            snapshot = self._create_snapshot(profile)
            offset = 0
        else:
            if len(cursor_values) != 1 or not cursor_values[0]:
                raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
            if snapshot_values is not None and (
                len(snapshot_values) != 1 or not snapshot_values[0]
            ):
                raise ClientError(HTTPStatus.BAD_REQUEST, "snapshot_mismatch")
            cursor = self._decode_cursor(cursor_values[0])
            if cursor["profile"] != profile:
                raise ClientError(HTTPStatus.BAD_REQUEST, "snapshot_mismatch")
            if snapshot_values is not None and snapshot_values[0] != cursor["snapshot"]:
                raise ClientError(HTTPStatus.BAD_REQUEST, "snapshot_mismatch")
            now = self._clock()
            if now >= cursor["expires_at"]:
                raise ClientError(HTTPStatus.GONE, "snapshot_expired")
            snapshot = self._get_snapshot(cursor["snapshot"], profile, now)
            if not hmac.compare_digest(
                _format_expiry(snapshot.expires_at),
                _format_expiry(cursor["expires_at"]),
            ):
                raise ClientError(HTTPStatus.BAD_REQUEST, "snapshot_mismatch")
            offset = cursor["offset"]
            if offset < 0 or offset >= len(snapshot.sessions):
                raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")

        end = min(offset + limit, len(snapshot.sessions))
        sessions = list(snapshot.sessions[offset:end])
        next_cursor = None
        if end < len(snapshot.sessions):
            next_cursor = self._encode_cursor(snapshot, end)
        return {
            "sessions": sessions,
            "snapshot": snapshot.identifier,
            "next_cursor": next_cursor,
        }

    def check_readiness(self) -> None:
        """Prove the default persistence source is readable without caching data."""
        if not self._snapshot_admission.acquire(blocking=False):
            raise ClientError(HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_busy")
        try:
            rows = self._read_sessions(None)
            self._project_bounded_snapshot(rows)
        finally:
            self._snapshot_admission.release()

    def clear_snapshots_for_test(self) -> None:
        with self._snapshot_lock:
            self._snapshots.clear()
            self._cached_snapshot_rows = 0
            self._cached_snapshot_bytes = 0

    def _parse_profile(self, parameters: dict[str, list[str]]) -> str | None:
        values = parameters.get("profile")
        if values is None:
            return None
        if len(values) != 1 or not PROFILE_PATTERN.fullmatch(values[0]):
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_profile")
        return values[0]

    def _parse_limit(self, parameters: dict[str, list[str]]) -> int:
        values = parameters.get("limit")
        if values is None:
            return DEFAULT_LIMIT
        if len(values) != 1:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_limit")
        try:
            limit = int(values[0])
        except ValueError as error:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_limit") from error
        if not MIN_LIMIT <= limit <= MAX_LIMIT:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_limit")
        return limit

    def _create_snapshot(self, profile: str | None) -> Snapshot:
        if not self._snapshot_admission.acquire(blocking=False):
            raise ClientError(HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_busy")
        try:
            rows = self._read_sessions(profile)
            sessions, byte_size = self._project_bounded_snapshot(rows)
            now = self._clock()
            snapshot = Snapshot(
                identifier=secrets.token_urlsafe(24),
                profile=profile,
                expires_at=now + self.config.snapshot_ttl_seconds,
                sessions=sessions,
                byte_size=byte_size,
            )
            with self._snapshot_lock:
                self._remove_expired_locked(now)
                while self._snapshots and (
                    len(self._snapshots) >= self.config.max_snapshots
                    or self._cached_snapshot_rows + len(snapshot.sessions)
                    > self.config.max_cached_snapshot_rows
                    or self._cached_snapshot_bytes + snapshot.byte_size
                    > self.config.max_cached_snapshot_bytes
                ):
                    oldest_identifier = next(iter(self._snapshots))
                    self._discard_snapshot_locked(oldest_identifier)
                self._snapshots[snapshot.identifier] = snapshot
                self._cached_snapshot_rows += len(snapshot.sessions)
                self._cached_snapshot_bytes += snapshot.byte_size
            return snapshot
        finally:
            self._snapshot_admission.release()

    def _get_snapshot(
        self, identifier: str, profile: str | None, now: float
    ) -> Snapshot:
        with self._snapshot_lock:
            self._remove_expired_locked(now)
            snapshot = self._snapshots.get(identifier)
            if snapshot is None:
                raise ClientError(HTTPStatus.GONE, "snapshot_expired")
            if snapshot.profile != profile:
                raise ClientError(HTTPStatus.BAD_REQUEST, "snapshot_mismatch")
            self._snapshots.move_to_end(identifier)
            return snapshot

    def _remove_expired_locked(self, now: float) -> None:
        expired = [
            identifier
            for identifier, snapshot in self._snapshots.items()
            if now >= snapshot.expires_at
        ]
        for identifier in expired:
            self._discard_snapshot_locked(identifier)

    def _discard_snapshot_locked(self, identifier: str) -> None:
        snapshot = self._snapshots.pop(identifier)
        self._cached_snapshot_rows -= len(snapshot.sessions)
        self._cached_snapshot_bytes -= snapshot.byte_size

    def _project_bounded_snapshot(
        self, records: list[dict[str, Any]]
    ) -> tuple[tuple[dict[str, Any], ...], int]:
        sessions = tuple(
            _project_topology(
                records,
                max_scalar_bytes=self.config.max_scalar_bytes,
                preprocessed=True,
                max_retained_bytes=self.config.max_cached_snapshot_bytes,
            )
        )
        byte_size = _retained_size_bytes(sessions)
        if (
            len(sessions) > self.config.max_cached_snapshot_rows
            or byte_size > self.config.max_cached_snapshot_bytes
        ):
            raise ClientError(HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_too_large")
        return sessions, byte_size

    def _open_database(self, profile: str | None) -> _DatabaseHandle:
        directory_flags = (
            os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW
        )
        file_flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
        descriptors: list[int] = []
        try:
            data_fd = _open_directory_path(self.config.data_dir)
            descriptors.append(data_fd)
            profiles_fd = None
            if profile is None:
                profile_fd = data_fd
            else:
                profiles_fd = _open_component(
                    data_fd, "profiles", directory_flags, stat.S_ISDIR
                )
                descriptors.append(profiles_fd)
                profile_fd = _open_component(
                    profiles_fd, profile, directory_flags, stat.S_ISDIR
                )
                descriptors.append(profile_fd)
            database_fd = _open_component(
                profile_fd, "state.db", file_flags, stat.S_ISREG
            )
            descriptors.append(database_fd)
            database = _DatabaseHandle(
                data_fd=data_fd,
                profiles_fd=profiles_fd,
                profile_fd=profile_fd,
                database_fd=database_fd,
                profile=profile,
            )
            database.validate_namespace()
            return database
        except Exception:
            for descriptor in set(descriptors):
                os.close(descriptor)
            raise

    def _read_sessions(self, profile: str | None) -> list[dict[str, Any]]:
        database = self._open_database(profile)
        last_error: OSError | sqlite3.Error | ClientError | None = None
        try:
            for _attempt in range(DATABASE_READ_ATTEMPTS):
                try:
                    if _rollback_transaction_active(database):
                        continue
                    rows = self._read_live_database(database)
                    if _rollback_transaction_active(database):
                        continue
                    return rows
                except ClientError as error:
                    try:
                        journal_active = _rollback_transaction_active(database)
                    except OSError as journal_error:
                        last_error = journal_error
                        continue
                    if not journal_active:
                        raise
                    last_error = error
                    continue
                except (OSError, sqlite3.Error) as error:
                    last_error = error
                    continue
            raise ClientError(
                HTTPStatus.SERVICE_UNAVAILABLE, "persistence_unavailable"
            ) from last_error
        finally:
            database.close()

    def _read_live_database(self, database: _DatabaseHandle) -> list[dict[str, Any]]:
        connection = _open_live_database(database)
        try:
            connection.execute("BEGIN")
            columns = connection.execute('PRAGMA table_info("schema_version")').fetchall()
            if len(columns) != 1 or columns[0]["name"] != "version":
                raise ClientError(HTTPStatus.CONFLICT, "schema_incompatible")
            versions = connection.execute(
                "SELECT version, typeof(version) AS storage_type "
                "FROM schema_version LIMIT 2"
            ).fetchall()
            if (
                len(versions) != 1
                or versions[0]["storage_type"] != "integer"
                or versions[0]["version"] not in SUPPORTED_SCHEMA_VERSIONS
            ):
                raise ClientError(HTTPStatus.CONFLICT, "schema_incompatible")
            guarded_columns = []
            oversized_conditions = []
            parameters: list[int] = []
            scalar_suppression_limit = min(
                self.config.max_scalar_bytes,
                self.config.max_cached_snapshot_bytes,
            )
            for column in (*SESSION_COLUMNS, "model_config"):
                condition = (
                    f"typeof(\"{column}\") IN ('text', 'blob') "
                    f"AND length(CAST(\"{column}\" AS BLOB)) > ?"
                )
                guarded_columns.append(
                    f'CASE WHEN {condition} THEN NULL ELSE "{column}" END AS "{column}"'
                )
                parameters.append(scalar_suppression_limit)
                oversized_conditions.append(condition)
                parameters.append(scalar_suppression_limit)
            statement = (
                "SELECT "
                + ", ".join(guarded_columns)
                + ", CASE WHEN "
                + " OR ".join(oversized_conditions)
                + " THEN 1 ELSE 0 END AS _scalar_too_large "
                + "FROM sessions ORDER BY id ASC LIMIT ?"
            )
            parameters.append(self.config.max_snapshot_rows + 1)
            cursor = connection.execute(statement, parameters)
            rows: list[dict[str, Any]] = []
            source_bytes = 0
            retained = _RetainedSizeCounter()
            while True:
                row = cursor.fetchone()
                if row is None:
                    break
                if row["_scalar_too_large"]:
                    raise ClientError(
                        HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_too_large"
                    )
                if len(rows) >= self.config.max_snapshot_rows:
                    raise ClientError(
                        HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_too_large"
                    )
                for column in (*SESSION_COLUMNS, "model_config"):
                    source_bytes += _scalar_size_bytes(row[column])
                    if source_bytes > self.config.max_cached_snapshot_bytes:
                        raise ClientError(
                            HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_too_large"
                        )
                record = _internal_record(row)
                _validate_projection_scalars([record])
                rows.append(record)
                retained.add(record)
                if (
                    retained.total + sys.getsizeof(rows)
                    > self.config.max_cached_snapshot_bytes
                ):
                    raise ClientError(
                        HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_too_large"
                    )
            connection.execute("COMMIT")
        except Exception:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        finally:
            connection.close()
        return rows

    def _encode_cursor(self, snapshot: Snapshot, offset: int) -> str:
        payload = {
            "v": 1,
            "snapshot": snapshot.identifier,
            "offset": offset,
            "profile": snapshot.profile,
            "expires_at": snapshot.expires_at,
        }
        encoded_payload = _base64_encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signature = hmac.new(
            self._cursor_key, encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        return f"{encoded_payload}.{_base64_encode(signature)}"

    def _decode_cursor(self, cursor: str) -> dict[str, Any]:
        try:
            encoded_payload, encoded_signature = cursor.split(".")
            signature = _base64_decode(encoded_signature)
            expected = hmac.new(
                self._cursor_key, encoded_payload.encode("ascii"), hashlib.sha256
            ).digest()
            if not hmac.compare_digest(signature, expected):
                raise ValueError("signature mismatch")
            payload = json.loads(_base64_decode(encoded_payload))
        except (UnicodeError, ValueError, json.JSONDecodeError) as error:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor") from error

        if not isinstance(payload, dict) or set(payload) != {
            "v",
            "snapshot",
            "offset",
            "profile",
            "expires_at",
        }:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
        if payload["v"] != 1 or isinstance(payload["v"], bool):
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
        if not isinstance(payload["snapshot"], str) or not payload["snapshot"]:
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
        if not isinstance(payload["offset"], int) or isinstance(payload["offset"], bool):
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
        profile = payload["profile"]
        if profile is not None and (
            not isinstance(profile, str) or not PROFILE_PATTERN.fullmatch(profile)
        ):
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
        expires_at = payload["expires_at"]
        if (
            isinstance(expires_at, bool)
            or not isinstance(expires_at, (int, float))
            or not math.isfinite(expires_at)
        ):
            raise ClientError(HTTPStatus.BAD_REQUEST, "invalid_cursor")
        return payload


def _format_expiry(value: float) -> bytes:
    return value.hex().encode("ascii")


def _base64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64_decode(value: str) -> bytes:
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("invalid base64 value")
    padding = "=" * (-len(value) % 4)
    decoded = base64.b64decode(value + padding, altchars=b"-_", validate=True)
    if not hmac.compare_digest(_base64_encode(decoded), value):
        raise ValueError("non-canonical base64 value")
    return decoded


def _parse_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("boolean timestamp")
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError("non-finite timestamp")
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        raise ValueError("invalid timestamp")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _internal_record(row: sqlite3.Row) -> dict[str, Any]:
    record = {column: row[column] for column in SESSION_COLUMNS}
    record["invalid"] = False
    record["branch_marker"] = None
    record["delegate_marker"] = None

    if not isinstance(record["id"], str) or not record["id"]:
        record["invalid"] = True
    if not isinstance(record["source"], str) or not record["source"]:
        record["invalid"] = True
    if record["parent_session_id"] is not None and (
        not isinstance(record["parent_session_id"], str)
        or not record["parent_session_id"]
    ):
        record["invalid"] = True
    if record["archived"] not in (0, 1, False, True):
        record["invalid"] = True

    try:
        raw_configuration = row["model_config"]
        if raw_configuration is None:
            configuration = {}
        elif isinstance(raw_configuration, str):
            configuration = json.loads(raw_configuration)
        else:
            raise TypeError("model_config is not text or null")
        if not isinstance(configuration, dict):
            raise ValueError("model_config is not an object")
        for key, target in (
            ("_branched_from", "branch_marker"),
            ("_delegate_from", "delegate_marker"),
        ):
            if key in configuration:
                marker = configuration[key]
                if not isinstance(marker, str) or not marker:
                    raise ValueError("malformed relationship marker")
                record[target] = marker
    except (TypeError, ValueError, json.JSONDecodeError):
        record["invalid"] = True

    try:
        record["parsed_started_at"] = _parse_timestamp(record["started_at"])
        record["parsed_ended_at"] = _parse_timestamp(record["ended_at"])
    except (OverflowError, OSError, TypeError, ValueError):
        record["parsed_started_at"] = None
        record["parsed_ended_at"] = None
        record["invalid"] = True

    if record["parsed_started_at"] is None:
        record["invalid"] = True
    if (record["ended_at"] is None) != (record["end_reason"] is None):
        record["invalid"] = True
    if record["end_reason"] is not None and (
        not isinstance(record["end_reason"], str) or not record["end_reason"]
    ):
        record["invalid"] = True
    if (
        record["parsed_started_at"] is not None
        and record["parsed_ended_at"] is not None
        and record["parsed_ended_at"] < record["parsed_started_at"]
    ):
        record["invalid"] = True
    return record


def _cycle_nodes(records: dict[str, dict[str, Any]]) -> set[str]:
    cycles: set[str] = set()
    completed: set[str] = set()
    for starting_id in records:
        if starting_id in completed:
            continue
        path: list[str] = []
        positions: dict[str, int] = {}
        current: str | None = starting_id
        while current is not None and current in records and current not in completed:
            if current in positions:
                cycles.update(path[positions[current] :])
                break
            positions[current] = len(path)
            path.append(current)
            parent = records[current]["parent_session_id"]
            current = parent if isinstance(parent, str) else None
        completed.update(path)
    return cycles


def _validate_projection_scalars(records: list[dict[str, Any]]) -> None:
    for record in records:
        if not isinstance(record["id"], str) or not isinstance(record["source"], str):
            raise ClientError(HTTPStatus.INTERNAL_SERVER_ERROR, "persistence_invalid")
        for column in ("started_at", "ended_at"):
            value = record[column]
            if value is None or isinstance(value, str):
                continue
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
            ):
                raise ClientError(HTTPStatus.INTERNAL_SERVER_ERROR, "persistence_invalid")
        if record["end_reason"] is not None and not isinstance(
            record["end_reason"], str
        ):
            raise ClientError(HTTPStatus.INTERNAL_SERVER_ERROR, "persistence_invalid")


def _scalar_size_bytes(value: Any) -> int:
    if not isinstance(value, (str, bytes)):
        return 0
    try:
        return len(value.encode("utf-8")) if isinstance(value, str) else len(value)
    except UnicodeEncodeError as error:
        raise ClientError(
            HTTPStatus.INTERNAL_SERVER_ERROR, "persistence_invalid"
        ) from error


def _validate_scalar_sizes(rows: list[sqlite3.Row], max_scalar_bytes: int) -> None:
    for row in rows:
        for column in (*SESSION_COLUMNS, "model_config"):
            if _scalar_size_bytes(row[column]) > max_scalar_bytes:
                raise ClientError(
                    HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_too_large"
                )


class _RetainedSizeCounter:
    """Incrementally account for a retained Python object graph."""

    def __init__(self) -> None:
        self.seen: set[int] = set()
        self.total = 0

    def add(self, item: Any) -> None:
        identity = id(item)
        if identity in self.seen:
            return
        self.seen.add(identity)
        size = sys.getsizeof(item)
        if isinstance(item, dict):
            for key, child in item.items():
                self.add(key)
                self.add(child)
        elif isinstance(item, (list, tuple)):
            for child in item:
                self.add(child)
        self.total += size


def _retained_size_bytes(value: Any) -> int:
    """Conservatively account for the retained Python object graph."""
    counter = _RetainedSizeCounter()
    counter.add(value)
    return counter.total


def _project_topology(
    rows: list[Any],
    *,
    max_scalar_bytes: int = DEFAULT_MAX_SCALAR_BYTES,
    preprocessed: bool = False,
    max_retained_bytes: int | None = None,
) -> list[dict[str, Any]]:
    if preprocessed:
        internal = rows
    else:
        _validate_scalar_sizes(rows, max_scalar_bytes)
        internal = [_internal_record(row) for row in rows]
        _validate_projection_scalars(internal)
    records = {
        record["id"]: record
        for record in internal
        if isinstance(record["id"], str) and record["id"]
    }

    invalid = {record["id"] for record in internal if record["invalid"]}
    invalid.update(_cycle_nodes(records))

    relationships: dict[str, str] = {}
    continuation_candidates: dict[str, list[str]] = {}
    children_by_parent: dict[str, list[str]] = {}
    for record in internal:
        session_id = record["id"]
        parent_id = record["parent_session_id"]
        if isinstance(parent_id, str):
            children_by_parent.setdefault(parent_id, []).append(session_id)
        branch_marker = record["branch_marker"]
        delegate_marker = record["delegate_marker"]
        if branch_marker is not None and delegate_marker is not None:
            invalid.add(session_id)
        if parent_id is None:
            if branch_marker is not None or delegate_marker is not None:
                invalid.add(session_id)
            continue
        parent = records.get(parent_id)
        if parent is None:
            invalid.add(session_id)
            continue
        if branch_marker is not None and branch_marker != parent_id:
            invalid.add(session_id)
        if delegate_marker is not None and delegate_marker != parent_id:
            invalid.add(session_id)
        child_started = record["parsed_started_at"]
        parent_started = parent["parsed_started_at"]
        if (
            child_started is None
            or parent_started is None
            or child_started < parent_started
        ):
            invalid.add(session_id)

        # The snapshot comes from one selected profile's authoritative state.db.
        # ``source`` is interaction-surface provenance, not a storage namespace,
        # so an exact persisted parent edge may legitimately cross sources.
        if branch_marker is not None:
            relationships[session_id] = "branch"
        elif delegate_marker is not None:
            relationships[session_id] = "delegate"
        elif record["source"] == "tool":
            relationships[session_id] = "delegate"
        elif parent["end_reason"] == "branched":
            parent_ended = parent["parsed_ended_at"]
            if parent_ended is None or child_started is None or child_started < parent_ended:
                invalid.add(session_id)
            relationships[session_id] = "branch"
        elif parent["end_reason"] == "compression":
            relationships[session_id] = "child"
            continuation_candidates.setdefault(parent_id, []).append(session_id)
        else:
            relationships[session_id] = "child"

    for candidates in continuation_candidates.values():
        valid_candidates = [candidate for candidate in candidates if candidate not in invalid]
        if not valid_candidates:
            continue

        def lifecycle_precedence(candidate: str) -> int:
            candidate_record = records[candidate]
            if candidate_record["end_reason"] == "compression":
                return 0
            if candidate_record["ended_at"] is None:
                return 1
            return 2

        preferred_precedence = min(
            lifecycle_precedence(candidate) for candidate in valid_candidates
        )
        preferred_candidates = [
            candidate
            for candidate in valid_candidates
            if lifecycle_precedence(candidate) == preferred_precedence
        ]
        if len(preferred_candidates) != 1:
            invalid.update(preferred_candidates)
            continue

        continuation = preferred_candidates[0]
        relationships[continuation] = "continuation"

    invalid_queue = deque(invalid)
    while invalid_queue:
        invalid_parent = invalid_queue.popleft()
        for child_id in children_by_parent.get(invalid_parent, ()):
            if child_id not in invalid:
                invalid.add(child_id)
                invalid_queue.append(child_id)

    projected: list[dict[str, Any]] = []
    retained = _RetainedSizeCounter()
    for record in internal:
        session_id = record["id"]
        parent_id = record["parent_session_id"]
        if session_id in invalid:
            relationship = "orphan"
            safe_parent_id = None
        elif parent_id is None:
            relationship = "root"
            safe_parent_id = None
        else:
            relationship = relationships[session_id]
            safe_parent_id = parent_id
        projected_record = {
            "id": session_id,
            "parent_session_id": safe_parent_id,
            "source": record["source"],
            "started_at": record["started_at"],
            "ended_at": record["ended_at"],
            "end_reason": record["end_reason"],
            "archived": bool(record["archived"]),
            "relationship": relationship,
        }
        retained.add(projected_record)
        projected_count = len(projected) + 1
        projected_size = (
            retained.total
            + tuple.__basicsize__
            + tuple.__itemsize__ * projected_count
        )
        if max_retained_bytes is not None and projected_size > max_retained_bytes:
            raise ClientError(HTTPStatus.SERVICE_UNAVAILABLE, "snapshot_too_large")
        projected.append(projected_record)
    return projected


def make_handler(service: TopologyService) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        topology_service = service

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            parsed = urlsplit(self.path)
            if parsed.path == "/health":
                if parsed.query:
                    self._write_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_query"})
                else:
                    self._write_json(HTTPStatus.OK, {"status": "ok"})
                return
            if parsed.path == "/ready":
                if parsed.query:
                    self._write_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_query"})
                    return
                try:
                    self.topology_service.check_readiness()
                except Exception:
                    self._write_json(
                        HTTPStatus.SERVICE_UNAVAILABLE,
                        {"status": "unavailable"},
                    )
                else:
                    self._write_json(HTTPStatus.OK, {"status": "ready"})
                return
            if parsed.path != "/v1/session-topology":
                self._write_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            if not self._authenticated():
                self._write_json(
                    HTTPStatus.UNAUTHORIZED,
                    {"error": "unauthorized"},
                    headers={"WWW-Authenticate": "Bearer"},
                )
                return
            try:
                response = self.topology_service.get_page(parsed.query)
            except ClientError as error:
                self._write_json(error.status, {"error": error.code})
                return
            except (UnicodeError, ValueError):
                self._write_json(
                    HTTPStatus.BAD_REQUEST, {"error": "invalid_query"}
                )
                return
            except Exception:
                self._write_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal_error"}
                )
                return
            self._write_json(HTTPStatus.OK, response)

        def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def do_PUT(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def do_PATCH(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def do_DELETE(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def do_HEAD(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def do_TRACE(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def do_CONNECT(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._method_not_allowed()

        def send_error(
            self,
            code: int,
            message: str | None = None,
            explain: str | None = None,
        ) -> None:
            del message, explain
            if code == HTTPStatus.NOT_IMPLEMENTED:
                self._method_not_allowed()
                return
            self._write_json(HTTPStatus(code), {"error": "http_error"})

        def _method_not_allowed(self) -> None:
            self._write_json(
                HTTPStatus.METHOD_NOT_ALLOWED,
                {"error": "method_not_allowed"},
                headers={"Allow": "GET"},
            )

        def _authenticated(self) -> bool:
            authorization = self.headers.get("Authorization")
            if authorization is None or not authorization.startswith("Bearer "):
                return False
            candidate = authorization[len("Bearer ") :]
            return bool(candidate) and hmac.compare_digest(
                candidate.encode("utf-8"),
                self.topology_service.config.token.encode("utf-8"),
            )

        def _write_json(
            self,
            status: HTTPStatus,
            body: dict[str, Any],
            *,
            headers: dict[str, str] | None = None,
        ) -> None:
            encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(encoded)

        def log_message(self, format: str, *args: Any) -> None:
            # Avoid request logging entirely: query strings contain opaque cursors,
            # and credentials must never be written by this service.
            del format, args

    return Handler


def main() -> None:
    config = Config.from_env()
    service = TopologyService(config)
    server = ThreadingHTTPServer((config.host, config.port), make_handler(service))
    server.serve_forever()


if __name__ == "__main__":
    main()
