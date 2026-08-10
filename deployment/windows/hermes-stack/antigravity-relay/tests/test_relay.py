import contextlib
import http.client
import io
import importlib.util
import json
import os
import pathlib
import socket
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("antigravity_relay", ROOT / "relay.py")
relay = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(relay)


class FakeHeaders:
    def __init__(self, values):
        self._values = {
            name.lower(): value if isinstance(value, list) else [value]
            for name, value in values.items()
        }

    def get(self, name, default=None):
        values = self._values.get(name.lower())
        if not values and name.lower() == "host":
            return "127.0.0.1:8651"
        return values[0] if values else default

    def get_all(self, name, default=None):
        values = self._values.get(name.lower())
        return list(values) if values else default


class AntigravityRelayTests(unittest.TestCase):
    def setUp(self):
        self._agy_directory = tempfile.TemporaryDirectory()
        executable = pathlib.Path(self._agy_directory.name) / "agy.exe"
        executable.write_text("fixture", encoding="utf-8")
        executable.chmod(0o755)
        self._agy_environment = mock.patch.dict(
            os.environ,
            {"ANTIGRAVITY_AGY_BIN": str(executable)},
        )
        self._agy_environment.start()
        relay._AGY_EXECUTABLE = None

    def tearDown(self):
        relay._AGY_EXECUTABLE = None
        self._agy_environment.stop()
        self._agy_directory.cleanup()

    def test_default_model_cache_is_outside_versioned_source_tree(self):
        self.assertNotEqual(relay.MODEL_CACHE_FILE.parent, ROOT)
        self.assertIn("antigravity-relay", relay.MODEL_CACHE_FILE.parts)

    def test_parse_models_keeps_only_concrete_gemini_routes(self):
        raw = "\n".join(
            [
                "Fetching available models...",
                "gemini-3.6-flash-high\tGemini 3.6 Flash (High)",
                "gemini-3.1-pro-low\tGemini 3.1 Pro (Low)",
                "claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)",
                "gpt-oss-120b-medium\tGPT-OSS 120B (Medium)",
            ]
        )
        self.assertEqual(
            relay.parse_models(raw),
            [
                {"id": "gemini-3.6-flash-high", "label": "Gemini 3.6 Flash (High)"},
                {"id": "gemini-3.1-pro-low", "label": "Gemini 3.1 Pro (Low)"},
            ],
        )

    def test_list_models_falls_back_to_persisted_non_secret_inventory(self):
        original_path = relay.MODEL_CACHE_FILE
        original_cache = relay._MODEL_CACHE
        try:
            with tempfile.TemporaryDirectory() as directory:
                relay.MODEL_CACHE_FILE = pathlib.Path(directory) / "models.json"
                relay._MODEL_CACHE = (0.0, [])
                success = lambda *_args, **_kwargs: SimpleNamespace(
                    returncode=0,
                    stdout="gemini-3.6-flash-high\tGemini 3.6 Flash (High)\n",
                    stderr="",
                )
                expected = relay.list_models(runner=success, ttl=0)
                relay._MODEL_CACHE = (0.0, [])
                failure = lambda *_args, **_kwargs: SimpleNamespace(
                    returncode=1,
                    stdout="",
                    stderr="temporarily unavailable",
                )
                self.assertEqual(relay.list_models(runner=failure, ttl=0), expected)
        finally:
            relay.MODEL_CACHE_FILE = original_path
            relay._MODEL_CACHE = original_cache

    def test_list_models_uses_stale_cache_when_provider_slot_is_busy(self):
        original_cache = relay._MODEL_CACHE
        stale = [
            {
                "id": "gemini-3.6-flash-high",
                "label": "Gemini 3.6 Flash (High)",
            }
        ]
        acquired = relay.AGY_JOB_SLOTS.acquire(blocking=False)
        self.assertTrue(acquired)
        try:
            relay._MODEL_CACHE = (0.0, stale)
            with mock.patch.object(
                relay, "resolve_agy_executable", return_value=r"C:\agy.exe"
            ):
                self.assertEqual(relay.list_models(ttl=0), stale)
        finally:
            relay._MODEL_CACHE = original_cache
            relay.AGY_JOB_SLOTS.release()

    def test_health_does_not_require_provider_inventory_or_job_capacity(self):
        handler = relay.RelayHandler.__new__(relay.RelayHandler)
        handler.path = "/health"
        handler.headers = FakeHeaders({"Host": "127.0.0.1:8651"})
        responses = []
        handler._json = lambda status, payload: responses.append((status, payload))

        with mock.patch.object(
            relay,
            "list_models",
            side_effect=AssertionError("health must not run provider inventory"),
        ), mock.patch.object(relay, "_last_known_models", return_value=[]):
            handler.do_GET()

        self.assertEqual(responses[0][0], 200)
        self.assertEqual(responses[0][1]["status"], "ok")
        self.assertEqual(responses[0][1]["model_count"], 0)

    def test_get_rejects_non_loopback_host_before_health_processing(self):
        handler = relay.RelayHandler.__new__(relay.RelayHandler)
        handler.path = "/health"
        handler.headers = FakeHeaders({"Host": "attacker.example:8651"})
        responses = []
        handler._json = lambda status, payload: responses.append((status, payload))

        with mock.patch.object(
            relay,
            "_last_known_models",
            side_effect=AssertionError("rejected host must not reach health processing"),
        ):
            handler.do_GET()

        self.assertEqual(
            responses,
            [(403, {"error": {"message": relay.PUBLIC_REQUEST_REJECTED}})],
        )

    def test_validate_loopback_host_rejects_non_loopback_bindings(self):
        for host in ("127.0.0.1", "::1"):
            self.assertEqual(relay.validate_loopback_host(host), host)
        for host in (
            "0.0.0.0",
            "127.0.0.2",
            "192.168.1.10",
            "example.com",
            "[::1]",
            "localhost.",
        ):
            with self.assertRaises(ValueError):
                relay.validate_loopback_host(host)

    def test_localhost_is_allowed_only_when_every_resolution_is_loopback(self):
        loopback_results = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0)),
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 0, 0, 0)),
        ]
        with mock.patch.object(relay.socket, "getaddrinfo", return_value=loopback_results):
            self.assertEqual(relay.validate_loopback_host("LOCALHOST"), "localhost")

        unsafe_results = loopback_results + [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.9", 0))
        ]
        with mock.patch.object(relay.socket, "getaddrinfo", return_value=unsafe_results):
            with self.assertRaises(ValueError):
                relay.validate_loopback_host("localhost")
        with mock.patch.object(relay.socket, "getaddrinfo", return_value=[]):
            with self.assertRaises(ValueError):
                relay.validate_loopback_host("localhost")

    def test_parse_content_length_rejects_missing_invalid_and_oversized_bodies(self):
        self.assertEqual(relay.parse_content_length("128"), 128)
        for value in (
            None,
            "",
            "0",
            "abc",
            "-1",
            "+1",
            " 1",
            "1 ",
            "1.0",
            "1, 1",
            "١",
            "9" * 5000,
            str(relay.MAX_REQUEST_BYTES + 1),
        ):
            with self.assertRaises(ValueError):
                relay.parse_content_length(value)

    def test_oversized_body_is_rejected_before_the_stream_is_read(self):
        class UnreadableBody:
            read_called = False

            def read(self, _size):
                self.read_called = True
                raise AssertionError("oversized request body must not be allocated")

        stream = UnreadableBody()
        headers = FakeHeaders(
            {"Content-Length": str(relay.MAX_REQUEST_BYTES + 1)}
        )
        with self.assertRaises(relay.RequestBodyTooLargeError):
            relay.read_json_body(headers, stream)
        self.assertFalse(stream.read_called)

    def test_body_reader_rejects_missing_duplicate_and_short_content_length(self):
        cases = (
            (FakeHeaders({}), b"{}"),
            (FakeHeaders({"Content-Length": ["2", "2"]}), b"{}"),
            (FakeHeaders({"Content-Length": "3"}), b"{}"),
            (
                FakeHeaders(
                    {"Content-Length": "2", "Transfer-Encoding": "chunked"}
                ),
                b"{}",
            ),
        )
        for headers, body in cases:
            with self.subTest(headers=headers._values):
                with self.assertRaises(relay.InvalidRequestBodyError):
                    relay.read_json_body(headers, io.BytesIO(body))

    def test_validate_http_request_blocks_cross_site_and_non_json_posts(self):
        relay.validate_http_request("application/json; charset=utf-8", None)
        relay.validate_http_request("application/json", "http://127.0.0.1:3000")
        for content_type, origin in (
            ("text/plain", None),
            ("application/json", "https://example.com"),
        ):
            with self.assertRaises(ValueError):
                relay.validate_http_request(content_type, origin)

    def test_validate_host_header_allows_only_loopback_hosts(self):
        for value in ("127.0.0.1:8651", "localhost:8651", "[::1]:8651"):
            relay.validate_host_header(value)
        for value in (None, "", "example.com:8651", "127.0.0.2:8651", "malformed@@"):
            with self.assertRaises(ValueError):
                relay.validate_host_header(value)

    def test_http_admission_returns_503_without_spawning_when_saturated(self):
        class FakeRequest:
            def __init__(self):
                self.sent = bytearray()

            def sendall(self, data):
                self.sent.extend(data)

        server = relay.BoundedThreadingHTTPServer.__new__(
            relay.BoundedThreadingHTTPServer
        )
        server._request_slots = threading.BoundedSemaphore(1)
        self.assertTrue(server._request_slots.acquire(blocking=False))
        closed = []
        server.shutdown_request = lambda request: closed.append(request)
        request = FakeRequest()

        with contextlib.redirect_stderr(io.StringIO()):
            server.process_request(request, ("127.0.0.1", 12345))

        response = bytes(request.sent)
        self.assertIn(b"HTTP/1.1 503 Service Unavailable", response)
        self.assertIn(relay.PUBLIC_HTTP_BUSY.encode("utf-8"), response)
        self.assertEqual(closed, [request])

    def test_bounded_server_enforces_and_releases_http_capacity_end_to_end(self):
        entered = threading.Event()
        release = threading.Event()

        class BlockingHandler(relay.BaseHTTPRequestHandler):
            def do_GET(self):
                entered.set()
                release.wait(timeout=3)
                payload = b"ok"
                self.send_response(200)
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, _format, *_args):
                pass

        server = relay.BoundedThreadingHTTPServer(
            ("127.0.0.1", 0),
            BlockingHandler,
            max_concurrent_requests=1,
        )
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        first_status = []

        def first_request():
            connection = http.client.HTTPConnection(
                "127.0.0.1", server.server_port, timeout=3
            )
            try:
                connection.request("GET", "/", headers={"Connection": "close"})
                response = connection.getresponse()
                first_status.append((response.status, response.read()))
            finally:
                connection.close()

        first_thread = threading.Thread(target=first_request, daemon=True)
        logs = io.StringIO()
        try:
            with contextlib.redirect_stderr(logs):
                server_thread.start()
                first_thread.start()
                self.assertTrue(entered.wait(timeout=2))

                second = http.client.HTTPConnection(
                    "127.0.0.1", server.server_port, timeout=3
                )
                try:
                    second.request("GET", "/", headers={"Connection": "close"})
                    saturated = second.getresponse()
                    saturated_body = json.loads(saturated.read())
                finally:
                    second.close()
                self.assertEqual(saturated.status, 503)
                self.assertEqual(
                    saturated_body,
                    {"error": {"message": relay.PUBLIC_HTTP_BUSY}},
                )

                release.set()
                first_thread.join(timeout=3)
                self.assertFalse(first_thread.is_alive())
                self.assertEqual(first_status, [(200, b"ok")])

                deadline = time.monotonic() + 2
                while not server._request_slots.acquire(blocking=False):
                    if time.monotonic() >= deadline:
                        self.fail("HTTP request slot was not released")
                    time.sleep(0.01)
                server._request_slots.release()
        finally:
            release.set()
            server.shutdown()
            server.server_close()
            first_thread.join(timeout=3)
            server_thread.join(timeout=3)

    def test_agy_job_slots_are_separate_and_reject_without_running(self):
        original_slots = relay.AGY_JOB_SLOTS
        relay.AGY_JOB_SLOTS = threading.BoundedSemaphore(1)
        self.assertTrue(relay.AGY_JOB_SLOTS.acquire(blocking=False))
        runner_called = False

        def runner(*_args, **_kwargs):
            nonlocal runner_called
            runner_called = True
            raise AssertionError("saturated admission must not launch agy")

        try:
            with self.assertRaises(relay.AgyCapacityError):
                relay.run_agy(
                    "hello",
                    "gemini-3.6-flash-high",
                    available_models=[
                        {
                            "id": "gemini-3.6-flash-high",
                            "label": "Gemini 3.6 Flash (High)",
                        }
                    ],
                    runner=runner,
                )
            self.assertFalse(runner_called)
        finally:
            relay.AGY_JOB_SLOTS.release()
            relay.AGY_JOB_SLOTS = original_slots

    def test_post_returns_429_when_agy_job_admission_is_saturated(self):
        request_body = json.dumps(
            {
                "model": "google-antigravity/gemini-3.6-flash-high",
                "messages": [{"role": "user", "content": "hello"}],
            }
        ).encode("utf-8")
        handler = relay.RelayHandler.__new__(relay.RelayHandler)
        handler.path = "/v1/chat/completions"
        handler.headers = FakeHeaders(
            {
                "Content-Type": "application/json",
                "Content-Length": str(len(request_body)),
            }
        )
        handler.rfile = io.BytesIO(request_body)
        responses = []
        handler._json = lambda status, payload: responses.append((status, payload))
        inventory = [
            {
                "id": "gemini-3.6-flash-high",
                "label": "Gemini 3.6 Flash (High)",
            }
        ]
        with contextlib.redirect_stderr(io.StringIO()), mock.patch.object(
            relay, "list_models", return_value=inventory
        ), mock.patch.object(relay, "run_agy", side_effect=relay.AgyCapacityError):
            handler.do_POST()
        self.assertEqual(
            responses,
            [(429, {"error": {"message": relay.PUBLIC_AGY_BUSY}})],
        )

    def test_resolve_model_accepts_only_discovered_canonical_routes(self):
        inventory = [{"id": "gemini-3.6-flash-high", "label": "Gemini 3.6 Flash (High)"}]
        self.assertEqual(
            relay.resolve_model(
                "google-antigravity/gemini-3.6-flash-high",
                available_models=inventory,
            ),
            "gemini-3.6-flash-high",
        )
        for route in (
            "google-antigravity/claude-opus-4-6-thinking",
            "google-antigravity/gemini-undiscovered",
        ):
            with self.assertRaises(ValueError):
                relay.resolve_model(route, available_models=inventory)

    def test_resolve_model_uses_discovered_inventory_when_not_explicit(self):
        inventory = [
            {
                "id": "gemini-3.6-flash-high",
                "label": "Gemini 3.6 Flash (High)",
            }
        ]
        with mock.patch.object(relay, "list_models", return_value=inventory):
            self.assertEqual(
                relay.resolve_model("gemini-3.6-flash-high"),
                "gemini-3.6-flash-high",
            )
            with self.assertRaises(ValueError):
                relay.resolve_model("gemini-undiscovered")

        runner_called = False

        def runner(*_args, **_kwargs):
            nonlocal runner_called
            runner_called = True
            raise AssertionError("undiscovered models must be rejected before execution")

        with self.assertRaises(ValueError):
            relay.run_agy(
                "hello",
                "gemini-undiscovered",
                available_models=inventory,
                runner=runner,
            )
        self.assertFalse(runner_called)

    def test_agy_executable_is_validated_absolute_and_pinned(self):
        captured = {}

        def runner(args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = kwargs
            return SimpleNamespace(
                returncode=0,
                stdout=json.dumps(
                    {"structured_output": {"kind": "message", "content": "ready"}}
                ),
                stderr="",
            )

        with tempfile.TemporaryDirectory() as directory:
            executable = pathlib.Path(directory) / (
                "agy.exe" if os.name == "nt" else "agy"
            )
            executable.write_bytes(b"test executable")
            executable.chmod(executable.stat().st_mode | 0o111)
            with mock.patch.object(
                relay, "_AGY_EXECUTABLE", None, create=True
            ), mock.patch.dict(
                os.environ,
                {"ANTIGRAVITY_AGY_BIN": str(executable)},
            ):
                pinned = relay.resolve_agy_executable()
                self.assertTrue(pathlib.Path(pinned).is_absolute())
                self.assertEqual(pathlib.Path(pinned), executable.resolve())
                relay.run_agy(
                    "hello",
                    "gemini-3.6-flash-high",
                    available_models=[
                        {
                            "id": "gemini-3.6-flash-high",
                            "label": "Gemini 3.6 Flash (High)",
                        }
                    ],
                    runner=runner,
                )
                self.assertEqual(relay.resolve_agy_executable(), pinned)

        self.assertEqual(captured["args"][0], pinned)
        self.assertIs(captured["kwargs"]["shell"], False)

    def test_missing_explicit_agy_path_is_rejected_even_if_path_has_a_candidate(self):
        with mock.patch.object(
            relay, "_AGY_EXECUTABLE", None, create=True
        ), mock.patch.dict(
            os.environ, {}, clear=True
        ):
            with self.assertRaises(relay.RelayConfigurationError):
                relay.resolve_agy_executable()

    def test_run_agy_uses_authenticated_antigravity_cli_and_json_schema(self):
        captured = {}

        def runner(args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = kwargs
            return SimpleNamespace(
                returncode=0,
                stdout=json.dumps(
                    {
                        "structured_output": {
                            "kind": "message",
                            "content": "ready",
                        }
                    }
                ),
                stderr="",
            )

        result = relay.run_agy(
            "hello",
            "google-antigravity/gemini-3.1-pro-high",
            available_models=[
                {
                    "id": "gemini-3.1-pro-high",
                    "label": "Gemini 3.1 Pro (High)",
                }
            ],
            runner=runner,
        )
        self.assertEqual(result["structured_output"]["content"], "ready")
        args = captured["args"]
        self.assertEqual(args[0], relay.resolve_agy_executable())
        self.assertIn("--model", args)
        self.assertIn("gemini-3.1-pro-high", args)
        self.assertIn("--output-format", args)
        self.assertIn("json", args)
        self.assertIn("--json-schema", args)
        self.assertIn("--disable-slash-commands", args)
        self.assertEqual(args[1:3], ["-p", "hello"])
        self.assertNotIn("input", captured["kwargs"])
        self.assertIs(captured["kwargs"]["shell"], False)

    def test_provider_failure_and_get_error_are_redacted(self):
        secret_parts = (
            "PROMPT-SECRET",
            "token-abc123",
            "account=user@example.com",
            "550e8400-e29b-41d4-a716-446655440000",
            "C:\\private\\provider.log",
        )
        diagnostic = " | ".join(secret_parts)

        def failure_runner(*_args, **_kwargs):
            return SimpleNamespace(
                returncode=1,
                stdout=f"stdout {diagnostic}",
                stderr=f"stderr {diagnostic}",
            )

        with self.assertRaises(relay.ProviderExecutionError) as caught:
            relay.run_agy(
                "PROMPT-SECRET",
                "gemini-3.6-flash-high",
                available_models=[
                    {
                        "id": "gemini-3.6-flash-high",
                        "label": "Gemini 3.6 Flash (High)",
                    }
                ],
                runner=failure_runner,
            )
        self.assertEqual(str(caught.exception), relay.INTERNAL_PROVIDER_FAILURE)

        handler = relay.RelayHandler.__new__(relay.RelayHandler)
        handler.path = "/v1/models"
        handler.headers = FakeHeaders({})
        responses = []
        handler._json = lambda status, payload: responses.append((status, payload))
        logs = io.StringIO()
        with contextlib.redirect_stdout(logs), contextlib.redirect_stderr(logs), mock.patch.object(
            relay, "list_models", side_effect=RuntimeError(diagnostic)
        ):
            handler.do_GET()
            handler.log_message("provider=%s", diagnostic)

        public_and_logs = json.dumps(responses) + logs.getvalue()
        for secret in secret_parts:
            self.assertNotIn(secret, str(caught.exception))
            self.assertNotIn(secret, public_and_logs)
        self.assertEqual(
            responses,
            [(503, {"error": {"message": relay.PUBLIC_INVENTORY_UNAVAILABLE}})],
        )
        self.assertIn("inventory_unavailable", logs.getvalue())

        request_body = json.dumps(
            {
                "model": "google-antigravity/gemini-3.6-flash-high",
                "messages": [{"role": "user", "content": "PROMPT-SECRET"}],
            }
        ).encode("utf-8")
        post_handler = relay.RelayHandler.__new__(relay.RelayHandler)
        post_handler.path = "/v1/chat/completions"
        post_handler.headers = FakeHeaders(
            {
                "Content-Type": "application/json",
                "Content-Length": str(len(request_body)),
            }
        )
        post_handler.rfile = io.BytesIO(request_body)
        post_responses = []
        post_handler._json = lambda status, payload: post_responses.append(
            (status, payload)
        )
        inventory = [
            {
                "id": "gemini-3.6-flash-high",
                "label": "Gemini 3.6 Flash (High)",
            }
        ]
        post_logs = io.StringIO()
        with contextlib.redirect_stdout(post_logs), contextlib.redirect_stderr(
            post_logs
        ), mock.patch.object(
            relay, "list_models", return_value=inventory
        ), mock.patch.object(
            relay,
            "run_agy",
            side_effect=relay.ProviderExecutionError(diagnostic),
        ):
            post_handler.do_POST()
        post_public_and_logs = json.dumps(post_responses) + post_logs.getvalue()
        for secret in secret_parts:
            self.assertNotIn(secret, post_public_and_logs)
        self.assertEqual(
            post_responses,
            [(502, {"error": {"message": relay.PUBLIC_PROVIDER_FAILURE}})],
        )

    def test_result_converts_to_openai_message_and_tool_calls(self):
        message = relay.antigravity_result_to_choice(
            {"structured_output": {"kind": "message", "content": "done"}}
        )
        self.assertEqual(message, {"role": "assistant", "content": "done"})

        tools = relay.antigravity_result_to_choice(
            {
                "structured_output": {
                    "kind": "tool_calls",
                    "calls": [
                        {"id": "call_1", "name": "read_file", "arguments": {"path": "x"}}
                    ],
                }
            }
        )
        self.assertEqual(tools["tool_calls"][0]["function"]["name"], "read_file")


if __name__ == "__main__":
    unittest.main()
