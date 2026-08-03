import contextlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest import mock
import urllib.error
import urllib.parse
import urllib.request


ADAPTER_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ADAPTER_DIR.parent
APP_PATH = ADAPTER_DIR / "app.py"

spec = importlib.util.spec_from_file_location("session_topology_adapter", APP_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"cannot load adapter module from {APP_PATH}")
app = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = app
spec.loader.exec_module(app)


SESSION_FIELDS = {
    "id",
    "parent_session_id",
    "source",
    "started_at",
    "ended_at",
    "end_reason",
    "archived",
    "relationship",
}


def model_config(**values):
    return json.dumps(values, separators=(",", ":"))


def create_database(path, rows=(), *, schema_version=23):
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    try:
        connection.execute(
            """
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                model_config TEXT,
                parent_session_id TEXT,
                started_at TEXT,
                ended_at TEXT,
                end_reason TEXT,
                archived INTEGER NOT NULL DEFAULT 0,
                title TEXT,
                system_prompt TEXT,
                messages TEXT,
                cwd TEXT,
                metadata TEXT
            )
            """
        )
        connection.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)")
        connection.execute("INSERT INTO schema_version VALUES (?)", (schema_version,))
        for row in rows:
            insert_session(connection, **row)
        connection.commit()
    finally:
        connection.close()


def insert_session(connection_or_path, **overrides):
    values = {
        "id": "session",
        "source": "cli",
        "model_config": "{}",
        "parent_session_id": None,
        "started_at": "2026-07-27T10:00:00+00:00",
        "ended_at": None,
        "end_reason": None,
        "archived": 0,
        "title": "SECRET TITLE",
        "system_prompt": "SECRET PROMPT",
        "messages": '[{"role":"user","content":"SECRET MESSAGE"}]',
        "cwd": "/secret/cwd",
        "metadata": '{"secret":"metadata"}',
    }
    values.update(overrides)
    owns_connection = isinstance(connection_or_path, (str, os.PathLike, Path))
    connection = (
        sqlite3.connect(connection_or_path) if owns_connection else connection_or_path
    )
    try:
        connection.execute(
            """
            INSERT INTO sessions (
                id, source, model_config, parent_session_id, started_at, ended_at,
                end_reason, archived, title, system_prompt, messages, cwd, metadata
            ) VALUES (
                :id, :source, :model_config, :parent_session_id, :started_at,
                :ended_at, :end_reason, :archived, :title, :system_prompt,
                :messages, :cwd, :metadata
            )
            """,
            values,
        )
        if owns_connection:
            connection.commit()
    finally:
        if owns_connection:
            connection.close()


class MutableClock:
    def __init__(self, value=1000.0):
        self.value = value

    def __call__(self):
        return self.value


class AdapterHarness:
    def __init__(
        self,
        data_dir,
        *,
        token="test-token",
        ttl=60,
        clock=None,
        max_concurrent_snapshots=None,
        max_snapshots=8,
        max_snapshot_rows=10_000,
        max_cached_snapshot_rows=None,
        max_cached_snapshot_bytes=None,
        max_scalar_bytes=None,
    ):
        config_values = dict(
            token=token,
            data_dir=Path(data_dir),
            host="127.0.0.1",
            port=0,
            snapshot_ttl_seconds=ttl,
            max_snapshots=max_snapshots,
            max_snapshot_rows=max_snapshot_rows,
        )
        if max_concurrent_snapshots is not None:
            config_values["max_concurrent_snapshots"] = max_concurrent_snapshots
        if max_cached_snapshot_rows is not None:
            config_values["max_cached_snapshot_rows"] = max_cached_snapshot_rows
        if max_cached_snapshot_bytes is not None:
            config_values["max_cached_snapshot_bytes"] = max_cached_snapshot_bytes
        if max_scalar_bytes is not None:
            config_values["max_scalar_bytes"] = max_scalar_bytes
        self.config = app.Config(**config_values)
        self.service = app.TopologyService(self.config, clock=clock)
        self.server = app.ThreadingHTTPServer(
            ("127.0.0.1", 0), app.make_handler(self.service)
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request_with_headers(
        self, path, *, token: str | None = "test-token", headers=None
    ):
        request_headers = dict(headers or {})
        if token is not None:
            request_headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_port}{path}",
            headers=request_headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                return response.status, json.load(response), response.headers
        except urllib.error.HTTPError as error:
            return error.code, json.load(error), error.headers

    def request(self, path, *, token: str | None = "test-token", headers=None):
        status, body, _ = self.request_with_headers(path, token=token, headers=headers)
        return status, body


class TopologyHttpTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary_directory.name)
        create_database(
            self.data_dir / "state.db",
            [
                {
                    "id": "root",
                    "ended_at": "2026-07-27T10:05:00+00:00",
                    "end_reason": "complete",
                }
            ],
        )
        self.harness = AdapterHarness(self.data_dir)

    def tearDown(self):
        self.harness.close()
        self.temporary_directory.cleanup()

    def test_health_is_unauthenticated_and_non_sensitive(self):
        status, body = self.harness.request("/health", token=None)
        self.assertEqual(status, 200)
        self.assertEqual(body, {"status": "ok"})

    def test_readiness_is_unauthenticated_and_returns_no_session_data(self):
        status, body = self.harness.request("/ready", token=None)

        self.assertEqual(status, 200)
        self.assertEqual(body, {"status": "ready"})
        self.assertNotIn("root", json.dumps(body))

    def test_topology_requires_exact_bearer_authentication(self):
        cases = [
            (None, None),
            (None, {"Authorization": ""}),
            (None, {"Authorization": "Basic test-token"}),
            (None, {"Authorization": "Bearer"}),
            ("wrong-token", None),
        ]
        for token, headers in cases:
            with self.subTest(token=token, headers=headers):
                status, body, response_headers = self.harness.request_with_headers(
                    "/v1/session-topology", token=token, headers=headers
                )
                self.assertEqual(status, 401)
                self.assertEqual(body, {"error": "unauthorized"})
                self.assertEqual(response_headers.get("WWW-Authenticate"), "Bearer")

    def test_non_ascii_bearer_credentials_fail_closed(self):
        status, body = self.harness.request(
            "/v1/session-topology", token="tést-token"
        )

        self.assertEqual(status, 401)
        self.assertEqual(body, {"error": "unauthorized"})

    def test_only_versioned_get_route_is_available(self):
        status, _ = self.harness.request("/session-topology")
        self.assertEqual(status, 404)

    def test_all_unsupported_methods_return_stable_json_no_store_405(self):
        for method in (
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "HEAD",
            "OPTIONS",
            "TRACE",
            "CONNECT",
            "BREW",
        ):
            with self.subTest(method=method):
                connection = http.client.HTTPConnection(
                    "127.0.0.1", self.harness.server.server_port, timeout=2
                )
                connection.request(
                    method,
                    "/v1/session-topology",
                    headers={"Authorization": "Bearer test-token"},
                )
                response = connection.getresponse()
                self.assertEqual(response.status, 405)
                self.assertEqual(response.getheader("Allow"), "GET")
                self.assertEqual(response.getheader("Cache-Control"), "no-store")
                self.assertEqual(response.getheader("Content-Type"), "application/json")
                if method == "HEAD":
                    self.assertEqual(response.read(), b"")
                    self.assertEqual(
                        response.getheader("Content-Length"),
                        str(len(b'{"error":"method_not_allowed"}')),
                    )
                else:
                    self.assertEqual(json.load(response), {"error": "method_not_allowed"})
                connection.close()

    def test_response_uses_a_strict_safe_field_allowlist(self):
        status, body = self.harness.request("/v1/session-topology")
        self.assertEqual(status, 200)
        self.assertEqual(set(body), {"sessions", "snapshot", "next_cursor"})
        self.assertEqual(len(body["sessions"]), 1)
        self.assertEqual(set(body["sessions"][0]), SESSION_FIELDS)
        serialized = json.dumps(body)
        for forbidden in (
            "model_config",
            "system_prompt",
            "messages",
            "SECRET",
            "/secret/cwd",
            "metadata",
            "_branched_from",
            "_delegate_from",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_unknown_query_parameters_fail_closed(self):
        status, body = self.harness.request("/v1/session-topology?offset=1")
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_query")


class ProfileAndPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary_directory.name)
        create_database(self.data_dir / "state.db", [{"id": "default-root"}])
        create_database(
            self.data_dir / "profiles" / "work_1" / "state.db",
            [{"id": "named-root", "source": "telegram"}],
        )
        self.harness = AdapterHarness(self.data_dir)

    def tearDown(self):
        self.harness.close()
        self.temporary_directory.cleanup()

    def test_default_and_named_profile_databases_are_isolated(self):
        default_status, default_body = self.harness.request("/v1/session-topology")
        named_status, named_body = self.harness.request(
            "/v1/session-topology?profile=work_1"
        )
        self.assertEqual(default_status, 200)
        self.assertEqual(named_status, 200)
        self.assertEqual([row["id"] for row in default_body["sessions"]], ["default-root"])
        self.assertEqual([row["id"] for row in named_body["sessions"]], ["named-root"])

    def test_profile_validation_rejects_traversal_and_ambiguous_values(self):
        invalid_queries = [
            "profile=",
            "profile=../work",
            "profile=work%2Fother",
            "profile=.hidden",
            "profile=work.other",
            "profile=work&profile=other",
            f"profile={'a' * 65}",
        ]
        for query in invalid_queries:
            with self.subTest(query=query):
                status, body = self.harness.request(f"/v1/session-topology?{query}")
                self.assertEqual(status, 400)
                self.assertEqual(body["error"], "invalid_profile")

    def test_missing_profile_database_is_not_reported_as_empty(self):
        status, body = self.harness.request(
            "/v1/session-topology?profile=does-not-exist"
        )
        self.assertEqual(status, 404)
        self.assertEqual(body["error"], "profile_not_found")

    def test_named_profile_database_symlinks_cannot_escape_to_other_profiles(self):
        profiles_dir = self.data_dir / "profiles"
        cases = {
            "default_link": self.data_dir / "state.db",
            "named_link": profiles_dir / "work_1" / "state.db",
        }
        for profile, target in cases.items():
            profile_dir = profiles_dir / profile
            profile_dir.mkdir()
            (profile_dir / "state.db").symlink_to(target)

            with self.subTest(profile=profile):
                status, body = self.harness.request(
                    f"/v1/session-topology?profile={profile}"
                )
                self.assertEqual(status, 404, body)
                self.assertEqual(body, {"error": "profile_not_found"})
                self.assertNotIn("default-root", json.dumps(body))
                self.assertNotIn("named-root", json.dumps(body))

    def test_symlinked_profile_directory_cannot_select_another_profile(self):
        profiles_dir = self.data_dir / "profiles"
        (profiles_dir / "linked_profile").symlink_to(
            profiles_dir / "work_1", target_is_directory=True
        )

        status, body = self.harness.request(
            "/v1/session-topology?profile=linked_profile"
        )

        self.assertEqual(status, 404, body)
        self.assertEqual(body, {"error": "profile_not_found"})
        self.assertNotIn("named-root", json.dumps(body))

    def test_profile_directory_swap_during_sqlite_open_is_rejected(self):
        profiles_dir = self.data_dir / "profiles"
        selected_dir = profiles_dir / "work_1"
        displaced_dir = profiles_dir / "work_1-displaced"
        attacker_dir = profiles_dir / "attacker"
        create_database(
            attacker_dir / "state.db", [{"id": "cross-profile-secret"}]
        )
        real_connect = sqlite3.connect
        swapped = False

        def swap_before_connect(database, *args, **kwargs):
            nonlocal swapped
            if not swapped:
                selected_dir.rename(displaced_dir)
                selected_dir.symlink_to(attacker_dir, target_is_directory=True)
                swapped = True
            return real_connect(database, *args, **kwargs)

        with mock.patch.object(app.sqlite3, "connect", side_effect=swap_before_connect):
            status, body = self.harness.request(
                "/v1/session-topology?profile=work_1"
            )

        self.assertTrue(swapped)
        self.assertEqual(status, 404, body)
        self.assertEqual(body, {"error": "profile_not_found"})
        self.assertNotIn("cross-profile-secret", json.dumps(body))

    def test_state_database_swap_during_sqlite_open_is_rejected(self):
        profiles_dir = self.data_dir / "profiles"
        selected_database = profiles_dir / "work_1" / "state.db"
        displaced_database = profiles_dir / "work_1" / "state.db.displaced"
        attacker_database = profiles_dir / "attacker" / "state.db"
        create_database(attacker_database, [{"id": "cross-profile-secret"}])
        real_connect = sqlite3.connect
        swapped = False

        def swap_before_connect(database, *args, **kwargs):
            nonlocal swapped
            if not swapped:
                selected_database.rename(displaced_database)
                selected_database.symlink_to(attacker_database)
                swapped = True
            return real_connect(database, *args, **kwargs)

        with mock.patch.object(app.sqlite3, "connect", side_effect=swap_before_connect):
            status, body = self.harness.request(
                "/v1/session-topology?profile=work_1"
            )

        self.assertTrue(swapped)
        self.assertEqual(status, 404, body)
        self.assertEqual(body, {"error": "profile_not_found"})
        self.assertNotIn("cross-profile-secret", json.dumps(body))

    def test_live_source_is_opened_from_held_descriptor_with_mode_ro_and_query_only(self):
        calls = []
        statements = []
        real_connect = sqlite3.connect

        def guarded_connect(database, *args, **kwargs):
            calls.append((database, kwargs.copy()))
            self.assertTrue(kwargs.get("uri"))
            parsed = urllib.parse.urlsplit(database)
            self.assertEqual(urllib.parse.parse_qs(parsed.query), {"mode": ["ro"]})
            descriptor_path = Path(urllib.parse.unquote(parsed.path))
            self.assertEqual(descriptor_path.parts[:4], ("/", "proc", "self", "fd"))
            descriptor_details = os.stat(descriptor_path)
            expected_details = (self.data_dir / "state.db").stat()
            self.assertEqual(
                (descriptor_details.st_dev, descriptor_details.st_ino),
                (expected_details.st_dev, expected_details.st_ino),
            )
            connection = real_connect(database, *args, **kwargs)
            connection.set_trace_callback(statements.append)
            return connection

        with mock.patch.object(app.sqlite3, "connect", side_effect=guarded_connect):
            status, _ = self.harness.request("/v1/session-topology")
        self.assertEqual(status, 200)
        self.assertEqual(len(calls), 1)
        normalized = [" ".join(statement.split()).upper() for statement in statements]
        self.assertEqual(normalized[0], "PRAGMA QUERY_ONLY=ON")
        self.assertIn("PRAGMA QUERY_ONLY", normalized)
        self.assertEqual(normalized.count("PRAGMA DATABASE_LIST"), 1, normalized)
        self.assertEqual(normalized.count("BEGIN"), 1, normalized)
        self.assertEqual(normalized.count("COMMIT"), 1, normalized)
        self.assertNotIn("ROLLBACK", normalized)
        self.assertTrue(
            all(
                statement.startswith(
                    (
                        "PRAGMA QUERY_ONLY",
                        "PRAGMA DATABASE_LIST",
                        "PRAGMA TABLE_INFO",
                        "SELECT ",
                        "BEGIN",
                        "COMMIT",
                    )
                )
                for statement in normalized
            ),
            normalized,
        )
        begin = normalized.index("BEGIN")
        table_info = next(
            index
            for index, statement in enumerate(normalized)
            if statement.startswith("PRAGMA TABLE_INFO")
        )
        commit = normalized.index("COMMIT")
        self.assertLess(begin, table_info)
        self.assertLess(table_info, commit)
        selects = [statement for statement in normalized if statement.startswith("SELECT ")]
        self.assertEqual(len(selects), 2, selects)
        self.assertTrue(all(" LIMIT " in statement for statement in selects), selects)
        self.assertIn("FROM SCHEMA_VERSION LIMIT 2", selects[0])
        self.assertIn("FROM SESSIONS ORDER BY ID ASC LIMIT 10001", selects[1])

    def test_sqlite_opened_database_identity_mismatch_fails_closed(self):
        attacker_database = self.data_dir / "profiles" / "attacker" / "state.db"
        create_database(attacker_database, [{"id": "cross-profile-secret"}])
        real_connect = sqlite3.connect

        def misdirected_connect(_database, *args, **kwargs):
            return real_connect(attacker_database, *args, **kwargs)

        with mock.patch.object(
            app.sqlite3, "connect", side_effect=misdirected_connect
        ) as connect:
            status, body = self.harness.request(
                "/v1/session-topology?profile=work_1"
            )

        self.assertEqual(connect.call_count, app.DATABASE_READ_ATTEMPTS)
        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "persistence_unavailable"})
        self.assertNotIn("cross-profile-secret", json.dumps(body))

    def test_query_only_connection_rejects_database_and_temp_mutations(self):
        database_path = self.data_dir / "state.db"
        database = self.harness.service._open_database(None)
        connection = app._open_live_database(database)
        try:
            self.assertEqual(connection.execute("PRAGMA query_only").fetchone()[0], 1)
            connection.execute("BEGIN")
            self.assertEqual(
                connection.execute("SELECT id FROM sessions LIMIT 1").fetchone()[0],
                "default-root",
            )
            connection.execute("ROLLBACK")
            with self.assertRaises(sqlite3.DatabaseError):
                connection.execute("SAVEPOINT forbidden")
            for statement in (
                "UPDATE sessions SET archived = 1",
                "CREATE TABLE forbidden (value TEXT)",
                "CREATE TEMP TABLE forbidden_temp (value TEXT)",
                "PRAGMA user_version=24",
                "PRAGMA query_only=OFF",
            ):
                with self.subTest(statement=statement), self.assertRaises(sqlite3.DatabaseError):
                    connection.execute(statement)
        finally:
            connection.close()
            database.close()

        verification = sqlite3.connect(database_path)
        try:
            self.assertEqual(verification.execute("PRAGMA user_version").fetchone()[0], 0)
            self.assertEqual(
                verification.execute(
                    "SELECT archived FROM sessions WHERE id = 'default-root'"
                ).fetchone()[0],
                0,
            )
        finally:
            verification.close()

    def test_direct_reader_has_no_source_copy_or_database_byte_cap(self):
        source = APP_PATH.read_text()
        self.assertNotIn("max_snapshot_bytes", source)
        self.assertNotIn("copy_bounded", source)
        self.assertNotIn("TemporaryDirectory", source)
        self.assertNotIn("replica", source.lower())

    def test_active_rollback_journal_is_retried_then_fails_safely(self):
        database_path = self.data_dir / "state.db"
        writer_script = """
import sqlite3
import sys

writer = sqlite3.connect(sys.argv[1])
writer.execute("PRAGMA journal_mode=DELETE")
writer.execute("BEGIN IMMEDIATE")
writer.execute("INSERT INTO sessions (id, source, model_config, started_at) VALUES (?, ?, ?, ?)",
               ("uncommitted-row", "cli", "{}", "2026-07-27T10:00:00+00:00"))
print("ready", flush=True)
sys.stdin.readline()
writer.rollback()
writer.close()
"""
        writer = subprocess.Popen(
            [sys.executable, "-c", writer_script, str(database_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert writer.stdout is not None
        assert writer.stderr is not None
        try:
            self.assertEqual(writer.stdout.readline().strip(), "ready")
            journal_path = Path(f"{database_path}-journal")
            self.assertTrue(journal_path.is_file())

            with mock.patch.object(
                self.harness.service,
                "_read_live_database",
                wraps=self.harness.service._read_live_database,
            ) as read_live_database, mock.patch.object(
                app,
                "_rollback_transaction_active",
                wraps=app._rollback_transaction_active,
            ) as journal_checks:
                response = self.harness.request("/v1/session-topology")
                read_live_database.assert_not_called()
                self.assertEqual(journal_checks.call_count, app.DATABASE_READ_ATTEMPTS)

                ready_response = self.harness.request("/ready", token=None)
                read_live_database.assert_not_called()
                self.assertEqual(
                    journal_checks.call_count,
                    app.DATABASE_READ_ATTEMPTS * 2,
                )
        finally:
            if writer.stdin is not None:
                writer.stdin.write("stop\n")
                writer.stdin.flush()
                writer.stdin.close()
            try:
                writer.wait(timeout=2)
            except subprocess.TimeoutExpired:
                writer.kill()
                writer.wait(timeout=2)

        writer_error = writer.stderr.read()
        writer.stdout.close()
        writer.stderr.close()
        self.assertEqual(writer.returncode, 0, writer_error)
        status, body = response
        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "persistence_unavailable"})
        self.assertNotIn("uncommitted-row", json.dumps(body))
        self.assertEqual(ready_response, (503, {"status": "unavailable"}))

    def test_inactive_persist_journal_does_not_block_committed_reads(self):
        database_path = self.data_dir / "state.db"
        writer = sqlite3.connect(database_path)
        try:
            self.assertEqual(
                writer.execute("PRAGMA journal_mode=PERSIST").fetchone()[0],
                "persist",
            )
            insert_session(writer, id="persisted-row")
            writer.commit()

            journal_path = Path(f"{database_path}-journal")
            self.assertTrue(journal_path.is_file())
            self.assertGreater(journal_path.stat().st_size, 0)
            self.assertEqual(journal_path.read_bytes()[:28], bytes(28))

            status, body = self.harness.request("/v1/session-topology?limit=500")
        finally:
            writer.close()

        self.assertEqual(status, 200, body)
        self.assertEqual(
            [row["id"] for row in body["sessions"]],
            ["default-root", "persisted-row"],
        )

    def test_stale_malformed_non_hot_journal_is_deferred_to_sqlite_direct_read(self):
        database_path = self.data_dir / "state.db"
        journal_path = Path(f"{database_path}-journal")
        journal_path.write_bytes(bytes(8) + b"malformed-stale-journal" + bytes(4096))
        self.assertNotEqual(journal_path.read_bytes()[:28], bytes(28))

        with mock.patch.object(
            self.harness.service,
            "_read_live_database",
            wraps=self.harness.service._read_live_database,
        ) as read_live_database:
            status, body = self.harness.request("/v1/session-topology")

        self.assertEqual(status, 200, body)
        self.assertEqual([row["id"] for row in body["sessions"]], ["default-root"])
        read_live_database.assert_called_once()
        self.assertIsInstance(read_live_database.call_args.args[0], app._DatabaseHandle)
        self.assertTrue(journal_path.is_file())

    def test_descriptor_backed_live_wal_reads_commits_while_writer_stays_open(self):
        source_dir = self.data_dir / "live-wal-source"
        database_path = source_dir / "state.db"
        create_database(database_path, [{"id": "base-row"}])
        writer = sqlite3.connect(database_path)
        harness = None
        try:
            self.assertEqual(writer.execute("PRAGMA journal_mode=WAL").fetchone()[0], "wal")
            writer.execute("PRAGMA wal_autocheckpoint=0")
            insert_session(writer, id="committed-wal-row")
            writer.commit()
            writer.execute("BEGIN IMMEDIATE")
            insert_session(writer, id="uncommitted-wal-row")
            wal_path = Path(f"{database_path}-wal")
            self.assertTrue(wal_path.is_file())
            self.assertGreater(wal_path.stat().st_size, 0)

            harness = AdapterHarness(source_dir)
            status, body = harness.request("/v1/session-topology?limit=500")
        finally:
            if harness is not None:
                harness.close()
            writer.rollback()
            writer.close()

        self.assertEqual(status, 200, body)
        self.assertEqual(
            [row["id"] for row in body["sessions"]],
            ["base-row", "committed-wal-row"],
        )

    def test_wal_migration_between_version_and_session_reads_uses_one_supported_snapshot(self):
        database_path = self.data_dir / "state.db"
        writer = sqlite3.connect(database_path, timeout=1, check_same_thread=False)
        migrated = threading.Event()
        real_open = app._open_live_database

        class FetchHookCursor:
            def __init__(self, cursor, hook):
                self._cursor = cursor
                self._hook = hook

            def fetchall(self):
                rows = self._cursor.fetchall()
                self._hook()
                return rows

            def __getattr__(self, name):
                return getattr(self._cursor, name)

        class HookConnection:
            def __init__(self, connection):
                self._connection = connection

            def execute(self, statement, parameters=()):
                cursor = self._connection.execute(statement, parameters)
                if "FROM schema_version" in statement:
                    return FetchHookCursor(cursor, migrate)
                return cursor

            def __getattr__(self, name):
                return getattr(self._connection, name)

        def migrate():
            if migrated.is_set():
                return
            writer.execute("BEGIN IMMEDIATE")
            writer.execute("UPDATE schema_version SET version = 24")
            writer.execute("ALTER TABLE sessions RENAME TO sessions_v23")
            writer.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY)")
            writer.execute("INSERT INTO sessions VALUES ('new-incompatible-row')")
            writer.commit()
            migrated.set()

        try:
            self.assertEqual(writer.execute("PRAGMA journal_mode=WAL").fetchone()[0], "wal")
            writer.commit()
            with mock.patch.object(
                app,
                "_open_live_database",
                side_effect=lambda path: HookConnection(real_open(path)),
            ):
                status, body = self.harness.request("/v1/session-topology?limit=500")
        finally:
            writer.close()

        self.assertTrue(migrated.is_set())
        self.assertEqual(status, 200, body)
        self.assertEqual([row["id"] for row in body["sessions"]], ["default-root"])
        self.assertNotIn("new-incompatible-row", json.dumps(body))

    def test_rollback_migration_starting_after_precheck_fails_safely(self):
        database_path = self.data_dir / "state.db"
        journal_path = Path(f"{database_path}-journal")
        writer = sqlite3.connect(database_path, timeout=1, check_same_thread=False)
        migration_started = threading.Event()

        def start_migration_after_first_precheck(database):
            self.assertIsInstance(database, app._DatabaseHandle)
            self.assertIsNone(database.profile)
            self.assertEqual(database.identity, (
                database_path.stat().st_dev,
                database_path.stat().st_ino,
            ))
            if not migration_started.is_set():
                self.assertFalse(journal_path.is_file())
                writer.execute("BEGIN IMMEDIATE")
                writer.execute("UPDATE schema_version SET version = 24")
                writer.execute("ALTER TABLE sessions ADD COLUMN migration_value TEXT")
                self.assertTrue(journal_path.is_file())
                migration_started.set()
                return False
            return True

        try:
            self.assertEqual(writer.execute("PRAGMA journal_mode=DELETE").fetchone()[0], "delete")
            writer.commit()
            with mock.patch.object(
                app,
                "_rollback_transaction_active",
                side_effect=start_migration_after_first_precheck,
            ):
                status, body = self.harness.request("/v1/session-topology")
        finally:
            writer.rollback()
            writer.close()

        self.assertTrue(migration_started.is_set())
        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "persistence_unavailable"})
        self.assertNotIn("migration_value", json.dumps(body))


class SnapshotResourceLimitTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary_directory.name)
        create_database(self.data_dir / "state.db", [{"id": "root"}])

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_snapshot_admission_is_nonblocking_and_bounds_live_projection_work(self):
        harness = AdapterHarness(self.data_dir, max_concurrent_snapshots=1)
        entered = threading.Event()
        release = threading.Event()
        first_response = {}
        original_read_sessions = harness.service._read_sessions

        def blocked_read_sessions(profile):
            entered.set()
            self.assertTrue(release.wait(timeout=2))
            return original_read_sessions(profile)

        try:
            with mock.patch.object(
                harness.service, "_read_sessions", side_effect=blocked_read_sessions
            ):
                first_thread = threading.Thread(
                    target=lambda: first_response.setdefault(
                        "value", harness.request("/v1/session-topology")
                    )
                )
                first_thread.start()
                self.assertTrue(entered.wait(timeout=2))

                busy_status, busy_body = harness.request("/v1/session-topology")
                self.assertEqual(busy_status, 503, busy_body)
                self.assertEqual(busy_body, {"error": "snapshot_busy"})

                ready_status, ready_body = harness.request("/ready", token=None)
                self.assertEqual(ready_status, 503, ready_body)
                self.assertEqual(ready_body, {"status": "unavailable"})

                release.set()
                first_thread.join(timeout=2)
                self.assertFalse(first_thread.is_alive())
        finally:
            release.set()
            harness.close()

        self.assertEqual(first_response["value"][0], 200, first_response)

    def test_readiness_does_not_cache_a_topology_snapshot(self):
        harness = AdapterHarness(self.data_dir)
        try:
            status, body = harness.request("/ready", token=None)
        finally:
            harness.close()

        self.assertEqual(status, 200, body)
        self.assertEqual(body, {"status": "ready"})
        self.assertEqual(harness.service._snapshots, {})

    def test_repeated_full_snapshots_stay_within_aggregate_row_and_byte_budgets(self):
        database_path = self.data_dir / "state.db"
        insert_session(database_path, id="second-root")

        sizing_harness = AdapterHarness(self.data_dir)
        try:
            status, _ = sizing_harness.request("/v1/session-topology?limit=1")
            self.assertEqual(status, 200)
            one_snapshot_bytes = next(iter(sizing_harness.service._snapshots.values())).byte_size
        finally:
            sizing_harness.close()

        harness = AdapterHarness(
            self.data_dir,
            max_snapshots=100,
            max_cached_snapshot_rows=4,
            max_cached_snapshot_bytes=one_snapshot_bytes * 2,
        )
        try:
            responses = [
                harness.request("/v1/session-topology?limit=1")[1] for _ in range(3)
            ]
            self.assertEqual(len(harness.service._snapshots), 2)
            self.assertLessEqual(harness.service._cached_snapshot_rows, 4)
            self.assertLessEqual(
                harness.service._cached_snapshot_bytes,
                one_snapshot_bytes * 2,
            )

            expired_cursor = urllib.parse.quote(responses[0]["next_cursor"], safe="")
            status, body = harness.request(
                f"/v1/session-topology?limit=1&cursor={expired_cursor}"
            )
        finally:
            harness.close()

        self.assertEqual(status, 410, body)
        self.assertEqual(body, {"error": "snapshot_expired"})

    def test_snapshot_larger_than_cache_budget_is_rejected_without_retention(self):
        harness = AdapterHarness(
            self.data_dir,
            max_cached_snapshot_rows=10,
            max_cached_snapshot_bytes=1,
        )
        try:
            status, body = harness.request("/v1/session-topology")
        finally:
            harness.close()

        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "snapshot_too_large"})
        self.assertEqual(harness.service._snapshots, {})
        self.assertEqual(harness.service._cached_snapshot_rows, 0)
        self.assertEqual(harness.service._cached_snapshot_bytes, 0)

    def test_oversized_safe_scalar_is_rejected_without_retention_or_leakage(self):
        database_path = self.data_dir / "state.db"
        connection = sqlite3.connect(database_path)
        try:
            connection.execute(
                "UPDATE sessions SET source = ? WHERE id = 'root'",
                ("secret-oversized-source-" + "x" * 64,),
            )
            connection.commit()
        finally:
            connection.close()

        harness = AdapterHarness(self.data_dir, max_scalar_bytes=32)
        try:
            status, body = harness.request("/v1/session-topology")
            ready_status, ready_body = harness.request("/ready", token=None)
        finally:
            harness.close()

        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "snapshot_too_large"})
        self.assertNotIn("secret-oversized-source", json.dumps(body))
        self.assertEqual((ready_status, ready_body), (503, {"status": "unavailable"}))
        self.assertEqual(harness.service._snapshots, {})

    def test_session_rows_are_fetched_incrementally_and_one_huge_cell_is_gated(self):
        database_path = self.data_dir / "state.db"
        connection = sqlite3.connect(database_path)
        try:
            connection.execute(
                "UPDATE sessions SET model_config = ? WHERE id = 'root'",
                (json.dumps({"secret": "x" * (8 * 1024 * 1024)}),),
            )
            connection.commit()
        finally:
            connection.close()

        real_open = app._open_live_database
        session_fetches = []

        class IncrementalOnlyCursor:
            def __init__(self, cursor):
                self._cursor = cursor

            def fetchone(self):
                row = self._cursor.fetchone()
                session_fetches.append(row)
                return row

            def fetchall(self):
                raise AssertionError("session query must not use fetchall")

            def __getattr__(self, name):
                return getattr(self._cursor, name)

        class IncrementalOnlyConnection:
            def __init__(self, wrapped):
                self._wrapped = wrapped

            def execute(self, statement, parameters=()):
                cursor = self._wrapped.execute(statement, parameters)
                if "FROM sessions" in statement:
                    return IncrementalOnlyCursor(cursor)
                return cursor

            def __getattr__(self, name):
                return getattr(self._wrapped, name)

        harness = AdapterHarness(self.data_dir, max_scalar_bytes=64 * 1024)
        try:
            with mock.patch.object(
                app,
                "_open_live_database",
                side_effect=lambda path: IncrementalOnlyConnection(real_open(path)),
            ), mock.patch.object(
                app,
                "_internal_record",
                wraps=app._internal_record,
            ) as internal_record:
                status, body = harness.request("/v1/session-topology")
        finally:
            harness.close()

        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "snapshot_too_large"})
        self.assertLessEqual(len(session_fetches), 1)
        self.assertIsNone(session_fetches[0]["model_config"])
        self.assertEqual(session_fetches[0]["_scalar_too_large"], 1)
        internal_record.assert_not_called()
        self.assertEqual(harness.service._snapshots, {})

    def test_cache_budget_is_also_the_sql_scalar_suppression_limit(self):
        database_path = self.data_dir / "state.db"
        connection = sqlite3.connect(database_path)
        try:
            connection.execute(
                "UPDATE sessions SET model_config = ? WHERE id = 'root'",
                (json.dumps({"secret": "x" * (256 * 1024)}),),
            )
            connection.commit()
        finally:
            connection.close()

        real_open = app._open_live_database
        fetched_rows = []

        class InspectingCursor:
            def __init__(self, cursor):
                self._cursor = cursor

            def fetchone(self):
                row = self._cursor.fetchone()
                fetched_rows.append(row)
                return row

            def __getattr__(self, name):
                return getattr(self._cursor, name)

        class InspectingConnection:
            def __init__(self, wrapped):
                self._wrapped = wrapped

            def execute(self, statement, parameters=()):
                cursor = self._wrapped.execute(statement, parameters)
                if "FROM sessions" in statement:
                    return InspectingCursor(cursor)
                return cursor

            def __getattr__(self, name):
                return getattr(self._wrapped, name)

        harness = AdapterHarness(
            self.data_dir,
            max_cached_snapshot_bytes=128 * 1024,
            max_scalar_bytes=1024 * 1024,
        )
        try:
            with mock.patch.object(
                app,
                "_open_live_database",
                side_effect=lambda path: InspectingConnection(real_open(path)),
            ), mock.patch.object(app, "_internal_record") as internal_record:
                status, body = harness.request("/v1/session-topology")
        finally:
            harness.close()

        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "snapshot_too_large"})
        self.assertEqual(len(fetched_rows), 1)
        self.assertIsNone(fetched_rows[0]["model_config"])
        self.assertEqual(fetched_rows[0]["_scalar_too_large"], 1)
        internal_record.assert_not_called()

    def test_aggregate_near_limit_model_config_is_bounded_during_streaming(self):
        database_path = self.data_dir / "state.db"
        connection = sqlite3.connect(database_path)
        try:
            connection.execute("DELETE FROM sessions")
            near_limit_configuration = json.dumps({"ignored": "x" * 60_000})
            for index in range(20):
                insert_session(
                    connection,
                    id=f"aggregate-{index:02d}",
                    model_config=near_limit_configuration,
                )
            connection.commit()
        finally:
            connection.close()

        harness = AdapterHarness(
            self.data_dir,
            max_snapshot_rows=50_000,
            max_cached_snapshot_bytes=128 * 1024,
            max_scalar_bytes=64 * 1024,
        )
        try:
            with mock.patch.object(
                app,
                "_internal_record",
                wraps=app._internal_record,
            ) as internal_record:
                status, body = harness.request("/v1/session-topology")
        finally:
            harness.close()

        self.assertEqual(status, 503, body)
        self.assertEqual(body, {"error": "snapshot_too_large"})
        self.assertLessEqual(internal_record.call_count, 2)
        self.assertEqual(harness.service._snapshots, {})


class SchemaCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary_directory.name)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def request(self):
        harness = AdapterHarness(self.data_dir)
        try:
            return harness.request("/v1/session-topology")
        finally:
            harness.close()

    def test_schema_version_23_is_supported(self):
        create_database(self.data_dir / "state.db", [{"id": "supported"}])
        status, body = self.request()
        self.assertEqual(status, 200, body)
        self.assertEqual([row["id"] for row in body["sessions"]], ["supported"])

    def test_schema_version_25_is_supported(self):
        create_database(
            self.data_dir / "state.db",
            [{"id": "supported-schema-25"}],
            schema_version=25,
        )
        status, body = self.request()
        self.assertEqual(status, 200, body)
        self.assertEqual(
            [row["id"] for row in body["sessions"]], ["supported-schema-25"]
        )

    def test_blob_scalar_rows_fail_closed_with_safe_persistence_error(self):
        cases = {
            "id": {"id": b"blob-id"},
            "source": {"source": b"blob-source"},
            "started_at": {"started_at": b"blob-started-at"},
            "ended_at": {
                "ended_at": b"blob-ended-at",
                "end_reason": "complete",
            },
        }
        for name, overrides in cases.items():
            with self.subTest(column=name):
                database_path = self.data_dir / "state.db"
                with contextlib.suppress(FileNotFoundError):
                    database_path.unlink()
                create_database(
                    database_path,
                    [{"id": f"malformed-{name}", **overrides}],
                    schema_version=23,
                )

                stderr = io.StringIO()
                with contextlib.redirect_stderr(stderr):
                    status, body = self.request()

                self.assertEqual(status, 500)
                self.assertEqual(body, {"error": "persistence_invalid"})
                self.assertNotIn("Traceback", stderr.getvalue())
                serialized = json.dumps(body)
                self.assertNotIn("blob-", serialized)

    def test_readiness_fails_safely_for_blob_scalar_without_caching_or_leaking(self):
        create_database(
            self.data_dir / "state.db",
            [{"id": b"secret-blob-id"}],
            schema_version=23,
        )
        harness = AdapterHarness(self.data_dir)
        try:
            ready_status, ready_body = harness.request("/ready", token=None)
        finally:
            harness.close()

        self.assertEqual(ready_status, 503)
        self.assertEqual(ready_body, {"status": "unavailable"})
        self.assertNotIn("secret-blob-id", json.dumps(ready_body))
        self.assertEqual(harness.service._snapshots, {})

    def test_unsupported_schema_is_rejected_before_projection(self):
        create_database(
            self.data_dir / "state.db", [{"id": "must-not-project"}], schema_version=1
        )
        with mock.patch.object(
            app, "_project_topology", side_effect=AssertionError("projection must not run")
        ):
            status, body = self.request()
        self.assertEqual(status, 409)
        self.assertEqual(body, {"error": "schema_incompatible"})

    def test_readiness_fails_safely_for_an_incompatible_default_database(self):
        create_database(
            self.data_dir / "state.db", [{"id": "must-not-leak"}], schema_version=1
        )
        harness = AdapterHarness(self.data_dir)
        try:
            health_status, health_body = harness.request("/health", token=None)
            ready_status, ready_body = harness.request("/ready", token=None)
        finally:
            harness.close()

        self.assertEqual((health_status, health_body), (200, {"status": "ok"}))
        self.assertEqual(ready_status, 503)
        self.assertEqual(ready_body, {"status": "unavailable"})
        serialized = json.dumps(ready_body)
        self.assertNotIn("must-not-leak", serialized)
        self.assertNotIn("schema_incompatible", serialized)

    def test_missing_malformed_empty_and_multiple_schema_versions_are_rejected(self):
        mutations = {
            "missing_table": ["DROP TABLE schema_version"],
            "missing_version_column": [
                "DROP TABLE schema_version",
                "CREATE TABLE schema_version (revision INTEGER NOT NULL)",
                "INSERT INTO schema_version VALUES (23)",
            ],
            "malformed_version": [
                "DROP TABLE schema_version",
                "CREATE TABLE schema_version (version TEXT NOT NULL)",
                "INSERT INTO schema_version VALUES ('23')",
            ],
            "empty_table": ["DELETE FROM schema_version"],
            "multiple_versions": ["INSERT INTO schema_version VALUES (23)"],
        }
        for name, statements in mutations.items():
            with self.subTest(name=name):
                database_path = self.data_dir / "state.db"
                with contextlib.suppress(FileNotFoundError):
                    database_path.unlink()
                create_database(database_path, [{"id": f"hidden-{name}"}])
                connection = sqlite3.connect(database_path)
                try:
                    for statement in statements:
                        connection.execute(statement)
                    connection.commit()
                finally:
                    connection.close()
                with mock.patch.object(
                    app,
                    "_project_topology",
                    side_effect=AssertionError("projection must not run"),
                ):
                    status, body = self.request()
                self.assertEqual(status, 409)
                self.assertEqual(body, {"error": "schema_incompatible"})


class RelationshipTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary_directory.name)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def fetch(self, rows):
        create_database(self.data_dir / "state.db", rows)
        harness = AdapterHarness(self.data_dir)
        try:
            status, body = harness.request("/v1/session-topology?limit=500")
        finally:
            harness.close()
        self.assertEqual(status, 200, body)
        return {row["id"]: row for row in body["sessions"]}

    def test_archived_rows_and_all_supported_relationships_are_included(self):
        rows = [
            {
                "id": "root",
                "archived": 1,
                "ended_at": "2026-07-27T10:10:00+00:00",
                "end_reason": "compression",
            },
            {
                "id": "continuation",
                "parent_session_id": "root",
                "started_at": "2026-07-27T10:10:00+00:00",
            },
            {
                "id": "branch",
                "parent_session_id": "root",
                "model_config": model_config(_branched_from="root"),
                "started_at": "2026-07-27T10:11:00+00:00",
            },
            {
                "id": "delegate",
                "parent_session_id": "root",
                "model_config": model_config(_delegate_from="root"),
                "started_at": "2026-07-27T10:12:00+00:00",
            },
            {
                "id": "child-parent",
                "ended_at": "2026-07-27T10:20:00+00:00",
                "end_reason": "complete",
            },
            {
                "id": "child",
                "parent_session_id": "child-parent",
                "started_at": "2026-07-27T10:21:00+00:00",
            },
        ]
        result = self.fetch(rows)
        self.assertEqual(
            {session_id: row["relationship"] for session_id, row in result.items()},
            {
                "root": "root",
                "continuation": "continuation",
                "branch": "branch",
                "delegate": "delegate",
                "child-parent": "root",
                "child": "child",
            },
        )
        self.assertTrue(result["root"]["archived"])

    def test_null_model_config_is_an_empty_object_for_roots_and_children(self):
        result = self.fetch(
            [
                {
                    "id": "null-root",
                    "model_config": None,
                    "ended_at": "2026-07-27T10:05:00+00:00",
                    "end_reason": "complete",
                },
                {
                    "id": "null-child",
                    "model_config": None,
                    "parent_session_id": "null-root",
                    "started_at": "2026-07-27T10:06:00+00:00",
                },
            ]
        )
        self.assertEqual(result["null-root"]["relationship"], "root")
        self.assertEqual(result["null-child"]["relationship"], "child")
        self.assertEqual(result["null-child"]["parent_session_id"], "null-root")

    def test_valid_json_model_config_blob_cannot_create_a_relationship(self):
        result = self.fetch(
            [
                {"id": "parent"},
                {
                    "id": "blob-branch",
                    "parent_session_id": "parent",
                    "model_config": b'{"_branched_from":"parent"}',
                    "started_at": "2026-07-27T10:01:00+00:00",
                },
            ]
        )

        self.assertEqual(result["blob-branch"]["relationship"], "orphan")
        self.assertIsNone(result["blob-branch"]["parent_session_id"])

    def test_cross_source_tool_delegates_use_marker_or_persisted_source_facts(self):
        result = self.fetch(
            [
                {"id": "cli-parent", "source": "cli"},
                {
                    "id": "marked-tool-delegate",
                    "source": "tool",
                    "parent_session_id": "cli-parent",
                    "model_config": model_config(_delegate_from="cli-parent"),
                    "started_at": "2026-07-27T10:01:00+00:00",
                },
                {
                    "id": "unmarked-tool-delegate",
                    "source": "tool",
                    "parent_session_id": "cli-parent",
                    "started_at": "2026-07-27T10:02:00+00:00",
                },
                {
                    "id": "non-tool-cross-source",
                    "source": "telegram",
                    "parent_session_id": "cli-parent",
                    "started_at": "2026-07-27T10:03:00+00:00",
                },
                {
                    "id": "mismatched-tool-marker",
                    "source": "tool",
                    "parent_session_id": "cli-parent",
                    "model_config": model_config(_delegate_from="different-parent"),
                    "started_at": "2026-07-27T10:04:00+00:00",
                },
            ]
        )
        self.assertEqual(result["marked-tool-delegate"]["relationship"], "delegate")
        self.assertEqual(result["unmarked-tool-delegate"]["relationship"], "delegate")
        for session_id in ("non-tool-cross-source", "mismatched-tool-marker"):
            self.assertEqual(result[session_id]["relationship"], "orphan")
            self.assertIsNone(result[session_id]["parent_session_id"])

    def test_legacy_branched_parent_classifies_compatible_unmarked_child_as_branch(self):
        result = self.fetch(
            [
                {
                    "id": "legacy-parent",
                    "ended_at": "2026-07-27T10:05:00+00:00",
                    "end_reason": "branched",
                },
                {
                    "id": "legacy-branch",
                    "parent_session_id": "legacy-parent",
                    "started_at": "2026-07-27T10:05:00+00:00",
                },
                {
                    "id": "legacy-cross-source",
                    "parent_session_id": "legacy-parent",
                    "source": "telegram",
                    "started_at": "2026-07-27T10:06:00+00:00",
                },
                {
                    "id": "legacy-too-early",
                    "parent_session_id": "legacy-parent",
                    "started_at": "2026-07-27T10:04:59+00:00",
                },
            ]
        )
        self.assertEqual(result["legacy-branch"]["relationship"], "branch")
        for session_id in ("legacy-cross-source", "legacy-too-early"):
            self.assertEqual(result[session_id]["relationship"], "orphan")
            self.assertIsNone(result[session_id]["parent_session_id"])

    def test_compression_continuations_require_one_unmarked_candidate(self):
        result = self.fetch(
            [
                {
                    "id": "ambiguous-parent",
                    "ended_at": "2026-07-27T10:05:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "ambiguous-a",
                    "parent_session_id": "ambiguous-parent",
                    "started_at": "2026-07-27T10:05:00+00:00",
                },
                {
                    "id": "ambiguous-b",
                    "parent_session_id": "ambiguous-parent",
                    "started_at": "2026-07-27T10:06:00+00:00",
                },
                {
                    "id": "unique-parent",
                    "started_at": "2026-07-27T11:00:00+00:00",
                    "ended_at": "2026-07-27T11:05:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "unique-continuation",
                    "parent_session_id": "unique-parent",
                    "started_at": "2026-07-27T11:05:00+00:00",
                },
                {
                    "id": "marked-branch",
                    "parent_session_id": "unique-parent",
                    "model_config": model_config(_branched_from="unique-parent"),
                    "started_at": "2026-07-27T11:06:00+00:00",
                },
                {
                    "id": "marked-delegate",
                    "parent_session_id": "unique-parent",
                    "model_config": model_config(_delegate_from="unique-parent"),
                    "started_at": "2026-07-27T11:07:00+00:00",
                },
            ]
        )
        for session_id in ("ambiguous-a", "ambiguous-b"):
            self.assertEqual(result[session_id]["relationship"], "orphan")
            self.assertIsNone(result[session_id]["parent_session_id"])
        self.assertEqual(result["unique-continuation"]["relationship"], "continuation")
        self.assertEqual(result["marked-branch"]["relationship"], "branch")
        self.assertEqual(result["marked-delegate"]["relationship"], "delegate")

    def test_atomic_compression_continuation_may_start_before_parent_end(self):
        result = self.fetch(
            [
                {
                    "id": "compression-parent",
                    "started_at": "2026-07-27T10:00:00+00:00",
                    "ended_at": "2026-07-27T10:05:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "atomic-continuation",
                    "parent_session_id": "compression-parent",
                    "started_at": "2026-07-27T10:04:59+00:00",
                },
            ]
        )

        self.assertEqual(result["atomic-continuation"]["relationship"], "continuation")
        self.assertEqual(
            result["atomic-continuation"]["parent_session_id"],
            "compression-parent",
        )

    def test_compression_sibling_precedence_prefers_continuing_child(self):
        result = self.fetch(
            [
                {
                    "id": "compression-parent",
                    "started_at": "2026-07-27T10:00:00+00:00",
                    "ended_at": "2026-07-27T10:05:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "real-continuation",
                    "parent_session_id": "compression-parent",
                    "started_at": "2026-07-27T10:04:59+00:00",
                    "ended_at": "2026-07-27T10:08:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "stale-sibling",
                    "parent_session_id": "compression-parent",
                    "started_at": "2026-07-27T10:05:00+00:00",
                    "ended_at": "2026-07-27T10:09:00+00:00",
                    "end_reason": "ws_orphan_reap",
                },
            ]
        )

        self.assertEqual(result["real-continuation"]["relationship"], "continuation")
        self.assertEqual(
            result["real-continuation"]["parent_session_id"],
            "compression-parent",
        )
        self.assertEqual(result["stale-sibling"]["relationship"], "child")
        self.assertEqual(
            result["stale-sibling"]["parent_session_id"],
            "compression-parent",
        )

    def test_compression_precedence_tie_leaves_no_continuation(self):
        result = self.fetch(
            [
                {
                    "id": "compression-parent",
                    "started_at": "2026-07-27T10:00:00+00:00",
                    "ended_at": "2026-07-27T10:05:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "tied-compression-a",
                    "parent_session_id": "compression-parent",
                    "started_at": "2026-07-27T10:04:59+00:00",
                    "ended_at": "2026-07-27T10:08:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "tied-compression-b",
                    "parent_session_id": "compression-parent",
                    "started_at": "2026-07-27T10:05:00+00:00",
                    "ended_at": "2026-07-27T10:09:00+00:00",
                    "end_reason": "compression",
                },
                {
                    "id": "stale-closed-a",
                    "parent_session_id": "compression-parent",
                    "started_at": "2026-07-27T10:05:01+00:00",
                    "ended_at": "2026-07-27T10:10:00+00:00",
                    "end_reason": "complete",
                },
                {
                    "id": "stale-closed-b",
                    "parent_session_id": "compression-parent",
                    "started_at": "2026-07-27T10:05:02+00:00",
                    "ended_at": "2026-07-27T10:11:00+00:00",
                    "end_reason": "ws_orphan_reap",
                },
            ]
        )

        for session_id in ("tied-compression-a", "tied-compression-b"):
            self.assertEqual(result[session_id]["relationship"], "orphan")
            self.assertIsNone(result[session_id]["parent_session_id"])
        for session_id in ("stale-closed-a", "stale-closed-b"):
            self.assertEqual(result[session_id]["relationship"], "child")
            self.assertEqual(
                result[session_id]["parent_session_id"],
                "compression-parent",
            )
        self.assertNotIn(
            "continuation",
            {row["relationship"] for row in result.values()},
        )

    def test_fail_closed_cases_are_visible_but_disconnected_orphans(self):
        rows = [
            {"id": "good-root"},
            {"id": "missing-parent", "parent_session_id": "absent"},
            {
                "id": "marker-mismatch",
                "parent_session_id": "good-root",
                "model_config": model_config(_branched_from="different"),
            },
            {
                "id": "cross-source",
                "parent_session_id": "good-root",
                "source": "telegram",
            },
            {"id": "malformed-json", "model_config": "{"},
            {"id": "malformed-shape", "model_config": "[]"},
            {
                "id": "malformed-marker",
                "parent_session_id": "good-root",
                "model_config": model_config(_delegate_from=["good-root"]),
            },
            {
                "id": "both-markers",
                "parent_session_id": "good-root",
                "model_config": model_config(
                    _branched_from="good-root", _delegate_from="good-root"
                ),
            },
            {
                "id": "marker-without-parent",
                "model_config": model_config(_branched_from="good-root"),
            },
            {
                "id": "end-before-start",
                "started_at": "2026-07-27T10:10:00+00:00",
                "ended_at": "2026-07-27T10:00:00+00:00",
                "end_reason": "complete",
            },
            {"id": "reason-without-end", "end_reason": "complete"},
            {
                "id": "end-without-reason",
                "ended_at": "2026-07-27T10:10:00+00:00",
            },
            {
                "id": "late-parent",
                "started_at": "2026-07-27T11:00:00+00:00",
            },
            {
                "id": "early-child",
                "parent_session_id": "late-parent",
                "started_at": "2026-07-27T10:00:00+00:00",
            },
            {
                "id": "compression-parent",
                "ended_at": "2026-07-27T10:10:00+00:00",
                "end_reason": "compression",
            },
            {
                "id": "continuation-before-parent-start",
                "parent_session_id": "compression-parent",
                "started_at": "2026-07-27T09:59:59+00:00",
            },
        ]
        result = self.fetch(rows)
        orphan_ids = set(result) - {"good-root", "late-parent", "compression-parent"}
        for session_id in orphan_ids:
            with self.subTest(session_id=session_id):
                self.assertEqual(result[session_id]["relationship"], "orphan")
                self.assertIsNone(result[session_id]["parent_session_id"])

    def test_cycles_and_their_descendants_are_disconnected_orphans(self):
        rows = [
            {"id": "a", "parent_session_id": "b"},
            {"id": "b", "parent_session_id": "c"},
            {"id": "c", "parent_session_id": "a"},
            {"id": "descendant", "parent_session_id": "a"},
            {"id": "independent"},
        ]
        result = self.fetch(rows)
        for session_id in ("a", "b", "c", "descendant"):
            self.assertEqual(result[session_id]["relationship"], "orphan")
            self.assertIsNone(result[session_id]["parent_session_id"])
        self.assertEqual(result["independent"]["relationship"], "root")

    def test_large_reverse_id_invalid_chain_propagates_in_linear_operations(self):
        chain_length = 5_000
        rows = [
            {
                "id": f"reverse-{index:05d}",
                "source": "cli",
                "model_config": "{" if index == chain_length else "{}",
                "parent_session_id": (
                    f"reverse-{index + 1:05d}" if index < chain_length else None
                ),
                "started_at": "2026-07-27T10:00:00+00:00",
                "ended_at": None,
                "end_reason": None,
                "archived": 0,
            }
            for index in range(chain_length + 1)
        ]
        projection_code = app._project_topology.__code__
        operation_limit = chain_length * 300
        operations = 0

        def trace_projection(frame, event, arg):
            nonlocal operations
            del arg
            if event == "line" and frame.f_code is projection_code:
                operations += 1
                if operations > operation_limit:
                    raise AssertionError(
                        "invalidity propagation exceeded the linear operation budget"
                    )
            return trace_projection

        sys.settrace(trace_projection)
        try:
            projected = app._project_topology(rows)
        finally:
            sys.settrace(None)

        self.assertLess(operations, operation_limit)
        self.assertEqual(len(projected), chain_length + 1)
        self.assertTrue(
            all(
                row["relationship"] == "orphan"
                and row["parent_session_id"] is None
                for row in projected
            )
        )


class PaginationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary_directory.name)
        create_database(
            self.data_dir / "state.db",
            [{"id": session_id} for session_id in ("b", "c", "d")],
        )
        self.clock = MutableClock()
        self.harness = AdapterHarness(self.data_dir, ttl=10, clock=self.clock)

    def tearDown(self):
        self.harness.close()
        self.temporary_directory.cleanup()

    def test_limits_are_validated_from_one_through_five_hundred(self):
        for query in ("limit=0", "limit=501", "limit=-1", "limit=abc", "limit=1&limit=2"):
            with self.subTest(query=query):
                status, body = self.harness.request(f"/v1/session-topology?{query}")
                self.assertEqual(status, 400)
                self.assertEqual(body["error"], "invalid_limit")
        for limit in (1, 500):
            status, _ = self.harness.request(f"/v1/session-topology?limit={limit}")
            self.assertEqual(status, 200)

    def test_pages_are_stable_after_database_changes(self):
        status, first = self.harness.request("/v1/session-topology?limit=1")
        self.assertEqual(status, 200)
        self.assertEqual([row["id"] for row in first["sessions"]], ["b"])
        self.assertIsInstance(first["snapshot"], str)
        self.assertTrue(first["snapshot"])
        self.assertIsInstance(first["next_cursor"], str)

        insert_session(self.data_dir / "state.db", id="a")

        cursor = urllib.parse.quote(first["next_cursor"], safe="")
        snapshot = urllib.parse.quote(first["snapshot"], safe="")
        status, second = self.harness.request(
            f"/v1/session-topology?limit=2&cursor={cursor}&snapshot={snapshot}"
        )
        self.assertEqual(status, 200)
        self.assertEqual([row["id"] for row in second["sessions"]], ["c", "d"])
        self.assertEqual(second["snapshot"], first["snapshot"])
        self.assertIsNone(second["next_cursor"])

        status, fresh = self.harness.request("/v1/session-topology?limit=500")
        self.assertEqual(status, 200)
        self.assertEqual([row["id"] for row in fresh["sessions"]], ["a", "b", "c", "d"])

    def test_malformed_empty_tampered_and_mismatched_cursors_fail_closed(self):
        _, first = self.harness.request("/v1/session-topology?limit=1")
        cursor = first["next_cursor"]
        tampered = cursor[:-1] + ("A" if cursor[-1] != "A" else "B")
        cases = [
            "cursor=",
            "cursor=not-a-cursor",
            f"cursor={urllib.parse.quote(cursor + '=', safe='')}",
            f"cursor={urllib.parse.quote(tampered, safe='')}",
            (
                f"cursor={urllib.parse.quote(cursor, safe='')}"
                "&snapshot=wrong-snapshot"
            ),
            f"cursor={urllib.parse.quote(cursor, safe='')}&profile=other",
            f"cursor={urllib.parse.quote(cursor, safe='')}&cursor=again",
        ]
        for query in cases:
            with self.subTest(query=query):
                status, body = self.harness.request(f"/v1/session-topology?{query}")
                self.assertEqual(status, 400)
                self.assertIn(
                    body["error"],
                    {"invalid_cursor", "snapshot_mismatch", "invalid_profile"},
                )

    def test_expired_snapshot_has_an_explicit_client_error(self):
        _, first = self.harness.request("/v1/session-topology?limit=1")
        self.clock.value += 11
        cursor = urllib.parse.quote(first["next_cursor"], safe="")
        status, body = self.harness.request(
            f"/v1/session-topology?limit=1&cursor={cursor}"
        )
        self.assertEqual(status, 410)
        self.assertEqual(body, {"error": "snapshot_expired"})

    def test_evicted_but_well_signed_snapshot_expires_explicitly(self):
        _, first = self.harness.request("/v1/session-topology?limit=1")
        self.harness.service.clear_snapshots_for_test()
        cursor = urllib.parse.quote(first["next_cursor"], safe="")
        status, body = self.harness.request(f"/v1/session-topology?cursor={cursor}")
        self.assertEqual(status, 410)
        self.assertEqual(body, {"error": "snapshot_expired"})


class ConfigurationAndComposeTests(unittest.TestCase):
    PRODUCER_IMAGE = (
        "nousresearch/hermes-agent@"
        "sha256:606a3b445ed7b963d63b1d96283e97c43c350eebf4f69abfb7fdfc3e2d7b7f56"
    )
    WORKSPACE_IMAGE = "hermes-workspace:reviewed-candidate"
    ACTION_PINS = {
        "actions/checkout": ("11d5960a326750d5838078e36cf38b85af677262", "v4.4.0"),
        "actions/setup-node": ("49933ea5288caeca8642d1e84afbd3f7d6820020", "v4.4.0"),
        "actions/setup-python": ("a26af69be951a213d495a4c3e4e4022e16d87065", "v5.6.0"),
        "docker/build-push-action": ("ca052bb54ab0790a636c9b5f226502c73d547a25", "v5.4.0"),
        "docker/login-action": ("c94ce9fb468520275223c153574b00df6fe4bcc9", "v3.7.0"),
        "docker/metadata-action": ("c299e40c65443455700f0fdfc63efafe5b349051", "v5.10.0"),
        "docker/setup-buildx-action": ("8d2750c68a42422c14e847fe6c8ac0403b4cbd6f", "v3.12.0"),
        "docker/setup-qemu-action": ("c7c53464625b32c7a7e944ae62b3e17d2b600130", "v3.7.0"),
        "gitleaks/gitleaks-action": ("ff98106e4c7b2bc287b24eaf42907196329070c7", "v2.3.9"),
        "pnpm/action-setup": ("b906affcce14559ad1aafd4ab0e942779e9f58b1", "v4.3.0"),
    }

    def test_environment_configuration_requires_nonempty_bearer_token(self):
        for token in (None, "", "   "):
            environment = {"SESSION_TOPOLOGY_ADAPTER_TOKEN": token}
            cleaned = {key: value for key, value in environment.items() if value is not None}
            with self.subTest(token=token), mock.patch.dict(os.environ, cleaned, clear=True):
                with self.assertRaisesRegex(ValueError, "non-empty"):
                    app.Config.from_env()

    def test_compose_sidecar_contract(self):
        compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text()
        service_start = compose.index("  session-topology-adapter:")
        service_end = compose.index("\n  # The Hermes Workspace Web UI", service_start)
        service = compose[service_start:service_end]

        self.assertIn("context: ./session-topology-adapter", service)
        self.assertIn(
            "SESSION_TOPOLOGY_ADAPTER_TOKEN: ${SESSION_TOPOLOGY_ADAPTER_TOKEN:?",
            service,
        )
        self.assertIn("SESSION_TOPOLOGY_ADAPTER_MAX_CONCURRENT_SNAPSHOTS", service)
        for setting in (
            "SESSION_TOPOLOGY_ADAPTER_SNAPSHOT_TTL_SECONDS",
            "SESSION_TOPOLOGY_ADAPTER_MAX_SNAPSHOTS",
            "SESSION_TOPOLOGY_ADAPTER_MAX_SNAPSHOT_ROWS",
            "SESSION_TOPOLOGY_ADAPTER_MAX_CACHED_SNAPSHOT_ROWS",
            "SESSION_TOPOLOGY_ADAPTER_MAX_CACHED_SNAPSHOT_BYTES",
            "SESSION_TOPOLOGY_ADAPTER_MAX_SCALAR_BYTES",
        ):
            with self.subTest(setting=setting):
                self.assertIn(setting, service)
        self.assertNotIn("SESSION_TOPOLOGY_ADAPTER_MAX_SNAPSHOT_BYTES", service)
        self.assertNotIn("SESSION_TOPOLOGY_ADAPTER_REPLICA_DIR", service)
        self.assertIn("hermes-agent-data:/data", service)
        self.assertNotIn("hermes-agent-data:/data:ro", service)
        self.assertNotIn("tmpfs:", service)
        self.assertNotIn("replica", service.lower())
        self.assertIn("user: '10010:10010'", service)
        self.assertIn("read_only: true", service)
        self.assertRegex(service, r"cap_drop:\s*\n\s*- ALL")
        self.assertIn("no-new-privileges:true", service)
        self.assertIn("session-topology-private", service)
        self.assertNotIn("network_mode: host", service)
        self.assertRegex(
            compose,
            r"(?m)^networks:\s*\n  default:\s*\n  session-topology-private:\s*\n    internal: true$",
        )
        self.assertIn("hermes-agent:", service)
        self.assertIn("condition: service_healthy", service)
        self.assertNotIn("ports:", service)
        healthcheck_start = service.index("    healthcheck:")
        healthcheck = service[healthcheck_start:]
        self.assertIn("http://127.0.0.1:8080/ready", healthcheck)
        self.assertNotIn("http://127.0.0.1:8080/health", healthcheck)

        workspace_start = compose.index("  hermes-workspace:")
        workspace_end = compose.index("\nvolumes:", workspace_start)
        workspace = compose[workspace_start:workspace_end]
        self.assertIn(
            "SESSION_TOPOLOGY_ADAPTER_URL: http://session-topology-adapter:8080",
            workspace,
        )
        self.assertIn(
            "SESSION_TOPOLOGY_ADAPTER_TOKEN: ${SESSION_TOPOLOGY_ADAPTER_TOKEN:?",
            workspace,
        )
        self.assertRegex(
            workspace,
            r"networks:\s*\n\s*- default\s*\n\s*- session-topology-private",
        )
        self.assertIn("session-topology-adapter:", workspace)
        self.assertIn("condition: service_healthy", workspace)

    def test_compose_quickstart_documents_required_generated_adapter_token(self):
        compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text()
        compose_quickstart = compose[: compose.index("services:")]
        environment_example = (REPOSITORY_ROOT / ".env.example").read_text()
        readme = (REPOSITORY_ROOT / "README.md").read_text()
        docker_quickstart = readme[
            readme.index("## 🐳 Docker Quickstart") : readme.index(
                "### Remote Access", readme.index("## 🐳 Docker Quickstart")
            )
        ]

        for document in (compose_quickstart, environment_example, docker_quickstart):
            with self.subTest(document=document[:40]):
                self.assertIn("SESSION_TOPOLOGY_ADAPTER_TOKEN", document)
                self.assertIn("openssl rand -hex 32", document)
        self.assertRegex(
            environment_example,
            r"(?m)^SESSION_TOPOLOGY_ADAPTER_TOKEN=$",
        )
        self.assertNotRegex(
            environment_example,
            r"(?m)^SESSION_TOPOLOGY_ADAPTER_TOKEN=.+$",
        )

    def test_ci_runs_adapter_unittests_on_python_313_as_blocking_steps(self):
        workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text()
        setup_start = workflow.index("- name: Setup Python 3.13")
        setup_end = workflow.find("\n      - name:", setup_start + 1)
        setup = workflow[setup_start:] if setup_end == -1 else workflow[setup_start:setup_end]
        step_start = workflow.index("- name: Run session topology adapter tests")
        step_end = workflow.find("\n      - name:", step_start + 1)
        step = workflow[step_start:] if step_end == -1 else workflow[step_start:step_end]

        self.assertLess(setup_start, step_start)
        self.assertIn(
            "uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0",
            setup,
        )
        self.assertIn("python-version: '3.13'", setup)
        self.assertNotIn("continue-on-error", setup)
        self.assertIn(
            "run: python -m unittest discover -s session-topology-adapter/tests -v",
            step,
        )
        self.assertNotIn("continue-on-error", step)

    def test_ci_blocks_on_adapter_docker_build_and_compose_validation(self):
        workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text()
        compose_start = workflow.index("- name: Validate Docker Compose configuration")
        compose_end = workflow.index("\n      - name:", compose_start + 1)
        compose_step = workflow[compose_start:compose_end]
        build_start = workflow.index("- name: Build session topology adapter image")
        build_end = workflow.index("\n      - name:", build_start + 1)
        build_step = workflow[build_start:build_end]

        self.assertIn("docker compose config --quiet", compose_step)
        self.assertIn("SESSION_TOPOLOGY_ADAPTER_TOKEN", compose_step)
        self.assertIn("docker build", build_step)
        self.assertIn("./session-topology-adapter", build_step)
        self.assertNotIn("continue-on-error", compose_step + build_step)

    def test_compose_docs_and_ci_pin_and_verify_the_compatible_producer(self):
        compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text()
        readme = (REPOSITORY_ROOT / "README.md").read_text()
        adapter_readme = (ADAPTER_DIR / "README.md").read_text()
        workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text()
        verifier = ADAPTER_DIR / "tests" / "verify_producer_compatibility.py"

        agent_start = compose.index("  hermes-agent:")
        agent_end = compose.index("\n  # Read-only", agent_start)
        agent_service = compose[agent_start:agent_end]
        self.assertIn(f"image: {self.PRODUCER_IMAGE}", agent_service)
        self.assertNotIn("nousresearch/hermes-agent:latest", compose)
        for document in (readme, adapter_readme):
            with self.subTest(document=document[:40]):
                self.assertIn(self.PRODUCER_IMAGE, document)
                self.assertIn("v0.19.0", document)
                self.assertIn("fa7b0fcf5d6e3576a59514ef1e281cd1e0872b8b", document)

        self.assertTrue(verifier.is_file())
        step_start = workflow.index("- name: Verify pinned Hermes Agent persistence compatibility")
        step_end = workflow.find("\n      - name:", step_start + 1)
        step = workflow[step_start:] if step_end == -1 else workflow[step_start:step_end]
        self.assertIn(
            "python session-topology-adapter/tests/verify_producer_compatibility.py",
            step,
        )
        self.assertNotIn("continue-on-error", step)
        self.assertNotIn("immutable multi-platform\nimage identity", adapter_readme)
        self.assertIn("selected for the CI runner\nplatform", adapter_readme)

    def test_compose_builds_and_ci_verifies_the_reviewed_workspace_source_candidate(self):
        compose = (REPOSITORY_ROOT / "docker-compose.yml").read_text()
        readme = (REPOSITORY_ROOT / "README.md").read_text()
        workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text()
        verifier = ADAPTER_DIR / "tests" / "verify_workspace_source_candidate.py"

        workspace_start = compose.index("  hermes-workspace:")
        workspace_end = compose.index("\nvolumes:", workspace_start)
        workspace = compose[workspace_start:workspace_end]
        self.assertIn(f"image: {self.WORKSPACE_IMAGE}", workspace)
        self.assertRegex(workspace, r"build:\s*\n\s+context: \.\s*\n\s+dockerfile: Dockerfile")
        self.assertIn("pull_policy: build", workspace)
        self.assertNotIn("ghcr.io/outsourc-e/hermes-workspace", workspace)
        self.assertNotIn("ghcr.io/outsourc-e/hermes-workspace:latest", compose)
        self.assertIn("hermes-agent-data:/home/workspace/.hermes", workspace)
        self.assertIn("SESSION_TOPOLOGY_ADAPTER_TOKEN:", workspace)
        self.assertIn("docker compose up --build", readme)
        self.assertIn(self.WORKSPACE_IMAGE, readme)

        self.assertTrue(verifier.is_file())
        step_start = workflow.index("- name: Verify reviewed Workspace source candidate")
        step_end = workflow.find("\n      - name:", step_start + 1)
        step = workflow[step_start:] if step_end == -1 else workflow[step_start:step_end]
        self.assertIn(
            "python session-topology-adapter/tests/verify_workspace_source_candidate.py",
            step,
        )
        self.assertNotIn("continue-on-error", step)

        build_start = workflow.index("- name: Build reviewed Workspace candidate image")
        build_end = workflow.find("\n      - name:", build_start + 1)
        build_step = workflow[build_start:] if build_end == -1 else workflow[build_start:build_end]
        self.assertIn("docker compose build hermes-workspace", build_step)
        self.assertNotIn("continue-on-error", build_step)

    def test_ci_blocks_on_candidate_typescript_check_and_tests(self):
        workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text()

        typecheck_start = workflow.index("- name: Type check")
        typecheck_end = workflow.index("\n      - name:", typecheck_start + 1)
        typecheck_step = workflow[typecheck_start:typecheck_end]
        self.assertIn("run: pnpm exec tsc --noEmit", typecheck_step)
        self.assertNotIn("continue-on-error", typecheck_step)
        self.assertNotIn("||", typecheck_step)

        tests_start = workflow.index("- name: Run tests")
        tests_end = workflow.find("\n      - name:", tests_start + 1)
        tests_step = workflow[tests_start:] if tests_end == -1 else workflow[tests_start:tests_end]
        self.assertIn("run: pnpm test", tests_step)
        self.assertNotIn("continue-on-error", tests_step)
        self.assertNotIn("||", tests_step)

    def test_all_third_party_ci_actions_are_pinned_to_reviewed_commits(self):
        observed = set()
        workflows = sorted((REPOSITORY_ROOT / ".github" / "workflows").glob("*.y*ml"))
        for workflow in workflows:
            for line_number, line in enumerate(workflow.read_text().splitlines(), 1):
                if "uses:" not in line:
                    continue
                match = re.match(
                    r"\s*uses:\s*([^@\s]+)@([0-9a-f]{40})\s+#\s+(v\d+\.\d+\.\d+)\s*$",
                    line,
                )
                if match is None:
                    self.fail(
                        f"{workflow.relative_to(REPOSITORY_ROOT)}:{line_number} is not pinned"
                    )
                action, commit, version = match.groups()
                self.assertIn(action, self.ACTION_PINS)
                self.assertEqual((commit, version), self.ACTION_PINS[action])
                observed.add(action)

        self.assertEqual(observed, set(self.ACTION_PINS))

    def test_dockerfile_runs_as_non_root_without_dependency_installation(self):
        dockerfile = (ADAPTER_DIR / "Dockerfile").read_text()
        self.assertIn(
            "FROM python:3.13-alpine@sha256:399babc8b49529dabfd9c922f2b5eea81d611e4512e3ed250d75bd2e7683f4b0",
            dockerfile,
        )
        self.assertRegex(dockerfile, r"(?m)^USER\s+(?!root\b)\S+")
        self.assertNotRegex(dockerfile, r"(?i)\b(pip|apk|apt-get|dnf|yum)\b")
        self.assertIn('CMD ["python", "/app/app.py"]', dockerfile)


if __name__ == "__main__":
    unittest.main()
