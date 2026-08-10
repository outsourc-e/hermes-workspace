"""Loopback OpenAI-compatible relay backed by Antigravity CLI OAuth."""

from __future__ import annotations

import ipaddress
import json
import os
import pathlib
import re
import socket
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["message", "tool_calls"]},
        "content": {"type": "string"},
        "calls": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "arguments": {"type": "object"},
                },
                "required": ["id", "name", "arguments"],
            },
        },
    },
    "required": ["kind"],
}

MAX_REQUEST_BYTES = 1024 * 1024
MAX_CONCURRENT_HTTP_REQUESTS = 16
MAX_CONCURRENT_AGY_JOBS = 1
REQUEST_SOCKET_TIMEOUT = 30
AGY_JOB_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_AGY_JOBS)
_LOCAL_APP_DATA = pathlib.Path(
    os.environ.get("LOCALAPPDATA", pathlib.Path.home() / "AppData/Local")
)
MODEL_CACHE_FILE = pathlib.Path(
    os.environ.get(
        "ANTIGRAVITY_MODEL_CACHE_FILE",
        _LOCAL_APP_DATA / "hermes/antigravity-relay/models-cache.json",
    )
)
_MODEL_CACHE: tuple[float, list[dict[str, str]]] = (0.0, [])
_MODEL_CACHE_LOCK = threading.Lock()
_AGY_EXECUTABLE: str | None = None
_AGY_EXECUTABLE_LOCK = threading.Lock()

# Compatibility aliases for callers of the first bounded relay revision.
MAX_CONCURRENT_REQUESTS = MAX_CONCURRENT_AGY_JOBS
REQUEST_SLOTS = AGY_JOB_SLOTS

PUBLIC_NOT_FOUND = "Not found"
PUBLIC_PROTOCOL_REJECTED = "Request rejected"
PUBLIC_REQUEST_REJECTED = "Request origin or content type rejected"
PUBLIC_CONTENT_LENGTH_REQUIRED = "Content-Length is required"
PUBLIC_INVALID_BODY = "Invalid request body"
PUBLIC_BODY_TOO_LARGE = "Request body is too large"
PUBLIC_INVALID_MODEL = "Invalid request or model"
PUBLIC_HTTP_BUSY = "Relay request capacity exceeded"
PUBLIC_AGY_BUSY = "Relay job capacity exceeded"
PUBLIC_INVENTORY_UNAVAILABLE = "Model inventory unavailable"
PUBLIC_PROVIDER_FAILURE = "Antigravity request failed"

INTERNAL_CONFIGURATION_FAILURE = "configuration_error"
INTERNAL_PROVIDER_FAILURE = "provider_execution_failed"
INTERNAL_INVENTORY_FAILURE = "inventory_unavailable"

_CONTENT_LENGTH_PATTERN = re.compile(r"[0-9]+", re.ASCII)
_MODEL_ID_PATTERN = re.compile(r"gemini-[a-z0-9][a-z0-9._-]{0,127}", re.ASCII)
_LOG_CATEGORIES = frozenset(
    {
        "agy_capacity",
        "body_invalid",
        "body_too_large",
        "http_error",
        "http_message",
        "http_response",
        "inventory_unavailable",
        "model_invalid",
        "provider_failure",
        "request_capacity",
        "request_rejected",
        "server_started",
        "server_stopped",
        "startup_failed",
        "unexpected_failure",
    }
)


class RelayConfigurationError(RuntimeError):
    pass


class InvalidRequestBodyError(ValueError):
    pass


class RequestBodySizeError(InvalidRequestBodyError):
    pass


class MissingContentLengthError(RequestBodySizeError):
    pass


class RequestBodyTooLargeError(RequestBodySizeError):
    pass


class AgyCapacityError(RuntimeError):
    pass


class ProviderExecutionError(RuntimeError):
    pass


class ModelInventoryError(RuntimeError):
    pass


def log_event(category: str, *, status: int | None = None) -> None:
    """Write only fixed, low-cardinality local diagnostic categories."""
    safe_category = category if category in _LOG_CATEGORIES else "unexpected_failure"
    suffix = f" status={int(status)}" if isinstance(status, int) else ""
    print(f"relay event={safe_category}{suffix}", file=sys.stderr, flush=True)


def _localhost_addresses() -> list[str]:
    try:
        results = socket.getaddrinfo(
            "localhost",
            0,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
        )
    except OSError:
        raise ValueError("loopback_host_invalid") from None
    addresses = list(dict.fromkeys(result[4][0] for result in results if result[4]))
    if not addresses:
        raise ValueError("loopback_host_invalid")
    try:
        if any(not ipaddress.ip_address(address).is_loopback for address in addresses):
            raise ValueError("loopback_host_invalid")
    except ValueError:
        raise ValueError("loopback_host_invalid") from None
    return addresses


def validate_loopback_host(host: str) -> str:
    normalized = host.strip().lower()
    if normalized in {"127.0.0.1", "::1"}:
        return normalized
    if normalized != "localhost":
        raise ValueError("loopback_host_invalid")
    _localhost_addresses()
    return normalized


def parse_content_length(value: str | None) -> int:
    if value is None or value == "":
        raise MissingContentLengthError("content_length_missing")
    if not isinstance(value, str) or _CONTENT_LENGTH_PATTERN.fullmatch(value) is None:
        raise InvalidRequestBodyError("content_length_invalid")
    canonical = value.lstrip("0") or "0"
    maximum = str(MAX_REQUEST_BYTES)
    if len(canonical) > len(maximum) or (
        len(canonical) == len(maximum) and canonical > maximum
    ):
        raise RequestBodyTooLargeError("body_too_large")
    size = int(canonical)
    if size == 0:
        raise InvalidRequestBodyError("content_length_invalid")
    return size


def read_json_body(headers: Any, stream: Any) -> dict[str, Any]:
    transfer_encodings = headers.get_all("Transfer-Encoding", []) or []
    if transfer_encodings:
        raise InvalidRequestBodyError("transfer_encoding_rejected")
    length_values = headers.get_all("Content-Length", []) or []
    if not length_values:
        raise MissingContentLengthError("content_length_missing")
    if len(length_values) != 1:
        raise InvalidRequestBodyError("content_length_invalid")
    size = parse_content_length(length_values[0])
    try:
        raw = stream.read(size)
    except OSError:
        raise InvalidRequestBodyError("body_read_failed") from None
    if not isinstance(raw, bytes) or len(raw) != size:
        raise InvalidRequestBodyError("body_length_mismatch")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise InvalidRequestBodyError("body_json_invalid") from None
    if not isinstance(payload, dict):
        raise InvalidRequestBodyError("body_json_invalid")
    return payload


def validate_host_header(value: str | None) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("host_rejected")
    try:
        parsed = urlparse(f"//{value.strip()}")
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError:
        raise ValueError("host_rejected") from None
    if not hostname or parsed.username is not None or parsed.password is not None:
        raise ValueError("host_rejected")
    try:
        validate_loopback_host(hostname)
    except ValueError:
        raise ValueError("host_rejected") from None


def validate_http_request(content_type: str | None, origin: str | None) -> None:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise ValueError("content_type_rejected")
    if origin:
        hostname = (urlparse(origin).hostname or "").lower()
        try:
            validate_loopback_host(hostname)
        except ValueError:
            raise ValueError("origin_rejected") from None


def resolve_agy_executable() -> str:
    global _AGY_EXECUTABLE
    if _AGY_EXECUTABLE is not None:
        return _AGY_EXECUTABLE
    with _AGY_EXECUTABLE_LOCK:
        if _AGY_EXECUTABLE is not None:
            return _AGY_EXECUTABLE
        located = os.environ.get("ANTIGRAVITY_AGY_BIN", "").strip()
        if not located:
            raise RelayConfigurationError(INTERNAL_CONFIGURATION_FAILURE)
        candidate = pathlib.Path(located)
        if not candidate.is_absolute():
            raise RelayConfigurationError(INTERNAL_CONFIGURATION_FAILURE)
        try:
            resolved = candidate.resolve(strict=True)
        except (OSError, RuntimeError):
            raise RelayConfigurationError(INTERNAL_CONFIGURATION_FAILURE) from None
        if not resolved.is_file() or not os.access(resolved, os.X_OK):
            raise RelayConfigurationError(INTERNAL_CONFIGURATION_FAILURE)
        _AGY_EXECUTABLE = str(resolved)
        return _AGY_EXECUTABLE


def parse_models(raw: str) -> list[dict[str, str]]:
    models: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in raw.splitlines():
        if "\t" not in line:
            continue
        model_id, label = (part.strip() for part in line.split("\t", 1))
        if _MODEL_ID_PATTERN.fullmatch(model_id) is None or model_id in seen:
            continue
        seen.add(model_id)
        models.append({"id": model_id, "label": label})
    return models


def _load_persisted_models() -> list[dict[str, str]]:
    try:
        payload = json.loads(MODEL_CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return []
    if not isinstance(payload, list):
        return []
    models: list[dict[str, str]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        model_id = row.get("id")
        label = row.get("label")
        if (
            isinstance(model_id, str)
            and _MODEL_ID_PATTERN.fullmatch(model_id) is not None
            and isinstance(label, str)
        ):
            models.append({"id": model_id, "label": label})
    return models


def _persist_models(models: list[dict[str, str]]) -> None:
    if not models:
        return
    temporary = MODEL_CACHE_FILE.with_suffix(".tmp")
    try:
        MODEL_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_text(json.dumps(models, ensure_ascii=False), encoding="utf-8")
        temporary.replace(MODEL_CACHE_FILE)
    except OSError:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _run_agy_process(
    args: list[str],
    *,
    runner: Any,
    timeout: int,
) -> Any:
    if not AGY_JOB_SLOTS.acquire(blocking=False):
        raise AgyCapacityError("agy_capacity")
    try:
        try:
            return runner(
                args,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                timeout=timeout,
                shell=False,
            )
        except Exception:
            raise ProviderExecutionError(INTERNAL_PROVIDER_FAILURE) from None
    finally:
        AGY_JOB_SLOTS.release()


def _last_known_models(now: float) -> list[dict[str, str]]:
    global _MODEL_CACHE
    with _MODEL_CACHE_LOCK:
        cached = list(_MODEL_CACHE[1])
    if cached:
        return cached
    persisted = _load_persisted_models()
    if persisted:
        with _MODEL_CACHE_LOCK:
            _MODEL_CACHE = (now, persisted)
        return list(persisted)
    return []


def list_models(*, runner=subprocess.run, ttl: int = 3600) -> list[dict[str, str]]:
    global _MODEL_CACHE
    now = time.monotonic()
    with _MODEL_CACHE_LOCK:
        cached_at, cached_models = _MODEL_CACHE
        if cached_models and now - cached_at < ttl:
            return list(cached_models)
    try:
        completed = _run_agy_process(
            [resolve_agy_executable(), "models"],
            runner=runner,
            timeout=30,
        )
        if getattr(completed, "returncode", 1) != 0:
            raise ProviderExecutionError(INTERNAL_PROVIDER_FAILURE)
        stdout = getattr(completed, "stdout", "")
        models = parse_models(stdout if isinstance(stdout, str) else "")
    except AgyCapacityError:
        fallback = _last_known_models(now)
        if fallback:
            return fallback
        raise
    except (ProviderExecutionError, TypeError):
        fallback = _last_known_models(now)
        if fallback:
            return fallback
        raise ModelInventoryError(INTERNAL_INVENTORY_FAILURE) from None
    if not models:
        fallback = _last_known_models(now)
        if fallback:
            return fallback
        raise ModelInventoryError(INTERNAL_INVENTORY_FAILURE)
    with _MODEL_CACHE_LOCK:
        _MODEL_CACHE = (now, models)
    _persist_models(models)
    return list(models)


def resolve_model(
    route_ref: str,
    *,
    available_models: list[dict[str, str]] | None = None,
) -> str:
    raw = route_ref.strip()
    prefix = "google-antigravity/"
    model = raw[len(prefix) :] if raw.startswith(prefix) else raw
    if _MODEL_ID_PATTERN.fullmatch(model) is None:
        raise ValueError("model_invalid")
    inventory = list_models() if available_models is None else available_models
    if model not in {entry.get("id") for entry in inventory if isinstance(entry, dict)}:
        raise ValueError("model_undiscovered")
    return model


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                parts.append(str(part))
            elif part.get("type") in {"text", "input_text"}:
                parts.append(str(part.get("text", "")))
            elif part.get("type") in {"image_url", "input_image"}:
                parts.append(f"[image: {part.get('image_url') or part.get('url') or '[image]'}]")
        return "\n".join(parts)
    return json.dumps(content, ensure_ascii=False)


def build_prompt(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> str:
    transcript: list[str] = []
    for message in messages:
        entry: dict[str, Any] = {"content": _content_text(message.get("content", ""))}
        if message.get("name"):
            entry["name"] = message["name"]
        if message.get("tool_call_id"):
            entry["tool_call_id"] = message["tool_call_id"]
        if message.get("tool_calls"):
            entry["tool_calls"] = message["tool_calls"]
        transcript.append(
            f"{str(message.get('role', 'unknown')).upper()}: "
            f"{json.dumps(entry, ensure_ascii=False)}"
        )
    tool_specs = [tool.get("function", tool) for tool in tools]
    return (
        "You are the reasoning model inside Hermes Agent. Hermes owns tool execution. "
        "Do not claim to have run a tool yourself. Choose exactly one response shape.\n\n"
        f"RESPONSE SCHEMA:\n{json.dumps(ACTION_SCHEMA, ensure_ascii=False)}\n\n"
        f"AVAILABLE HERMES TOOLS:\n{json.dumps(tool_specs, ensure_ascii=False)}\n\n"
        "CONVERSATION:\n" + "\n".join(transcript)
    )


def run_agy(
    prompt: str,
    model_id: str,
    *,
    available_models: list[dict[str, str]] | None = None,
    runner=subprocess.run,
    timeout: int = 360,
) -> dict[str, Any]:
    model = resolve_model(model_id, available_models=available_models)
    args = [
        resolve_agy_executable(),
        "-p",
        prompt,
        "--model",
        model,
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(ACTION_SCHEMA, separators=(",", ":")),
        "--disable-slash-commands",
        "--print-timeout",
        "5m",
    ]
    completed = _run_agy_process(args, runner=runner, timeout=timeout)
    if getattr(completed, "returncode", 1) != 0:
        raise ProviderExecutionError(INTERNAL_PROVIDER_FAILURE)
    stdout = getattr(completed, "stdout", "")
    if not isinstance(stdout, str):
        raise ProviderExecutionError(INTERNAL_PROVIDER_FAILURE)
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        raise ProviderExecutionError(INTERNAL_PROVIDER_FAILURE) from None
    if isinstance(payload, dict) and isinstance(payload.get("structured_output"), dict):
        return payload
    if isinstance(payload, dict) and payload.get("kind"):
        return {"structured_output": payload}
    if isinstance(payload, dict) and isinstance(payload.get("result"), dict):
        return {"structured_output": payload["result"]}
    raise ProviderExecutionError(INTERNAL_PROVIDER_FAILURE)


def antigravity_result_to_choice(payload: dict[str, Any]) -> dict[str, Any]:
    output = payload.get("structured_output")
    if not isinstance(output, dict):
        output = {"kind": "message", "content": str(payload.get("result", ""))}
    if output.get("kind") == "tool_calls":
        calls = []
        for index, call in enumerate(output.get("calls") or []):
            if not isinstance(call, dict) or not call.get("name"):
                continue
            arguments = call.get("arguments", {})
            if not isinstance(arguments, str):
                arguments = json.dumps(arguments, ensure_ascii=False)
            calls.append(
                {
                    "id": str(call.get("id") or f"call_{index + 1}"),
                    "type": "function",
                    "function": {"name": str(call["name"]), "arguments": arguments},
                }
            )
        return {"role": "assistant", "content": None, "tool_calls": calls}
    return {"role": "assistant", "content": str(output.get("content", ""))}


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """Threaded HTTP server with admission before a handler thread is created."""

    daemon_threads = True
    request_queue_size = MAX_CONCURRENT_HTTP_REQUESTS

    def __init__(
        self,
        server_address: tuple[str, int],
        request_handler_class: type[BaseHTTPRequestHandler],
        bind_and_activate: bool = True,
        *,
        max_concurrent_requests: int = MAX_CONCURRENT_HTTP_REQUESTS,
    ) -> None:
        host, port = server_address
        normalized_host = str(host).strip().lower()
        if normalized_host == "localhost":
            addresses = _localhost_addresses()
            bind_host = next(
                (address for address in addresses if ":" not in address),
                addresses[0],
            )
        else:
            bind_host = validate_loopback_host(normalized_host)
        self.address_family = socket.AF_INET6 if ":" in bind_host else socket.AF_INET
        if max_concurrent_requests < 1:
            raise ValueError("request_capacity_invalid")
        self._request_slots = threading.BoundedSemaphore(max_concurrent_requests)
        super().__init__((bind_host, port), request_handler_class, bind_and_activate)

    def get_request(self) -> tuple[Any, Any]:
        request, client_address = super().get_request()
        request.settimeout(REQUEST_SOCKET_TIMEOUT)
        return request, client_address

    def process_request(self, request: Any, client_address: Any) -> None:
        if not self._request_slots.acquire(blocking=False):
            self._reject_saturated_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._request_slots.release()
            raise

    def process_request_thread(self, request: Any, client_address: Any) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()

    def _reject_saturated_request(self, request: Any) -> None:
        payload = json.dumps(
            {"error": {"message": PUBLIC_HTTP_BUSY}},
            ensure_ascii=True,
            separators=(",", ":"),
        ).encode("utf-8")
        response = (
            b"HTTP/1.1 503 Service Unavailable\r\n"
            b"Content-Type: application/json; charset=utf-8\r\n"
            + f"Content-Length: {len(payload)}\r\n".encode("ascii")
            + b"Connection: close\r\nRetry-After: 1\r\n\r\n"
            + payload
        )
        try:
            request.sendall(response)
        except OSError:
            pass
        finally:
            self.shutdown_request(request)
        log_event("request_capacity", status=503)

    def handle_error(self, request: Any, client_address: Any) -> None:
        log_event("http_error")


class RelayHandler(BaseHTTPRequestHandler):
    server_version = "HermesAntigravityRelay"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def version_string(self) -> str:
        return self.server_version

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        status = int(code) if isinstance(code, int) else None
        log_event("http_response", status=status)

    def log_message(self, format: str, *args: Any) -> None:
        log_event("http_message")

    def log_error(self, format: str, *args: Any) -> None:
        log_event("http_error")

    def send_error(
        self,
        code: int,
        message: str | None = None,
        explain: str | None = None,
    ) -> None:
        self._json(int(code), {"error": {"message": PUBLIC_PROTOCOL_REJECTED}})

    def _json(self, status: int, payload: Any) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if status >= 400:
            self.close_connection = True
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        if status >= 400:
            self.send_header("Connection", "close")
        self.end_headers()
        if getattr(self, "command", None) != "HEAD":
            self.wfile.write(encoded)

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"error": {"message": message}})

    def _host_allowed(self) -> bool:
        try:
            validate_host_header(self.headers.get("Host"))
            return True
        except ValueError:
            log_event("request_rejected", status=403)
            self._error(403, PUBLIC_REQUEST_REJECTED)
            return False

    def do_GET(self) -> None:
        if not self._host_allowed():
            return
        if self.path not in {"/health", "/v1/models"}:
            self._error(404, PUBLIC_NOT_FOUND)
            return
        if self.path == "/health":
            models = _last_known_models(time.monotonic())
            self._json(
                200,
                {
                    "status": "ok",
                    "provider": "google-antigravity",
                    "authenticated": bool(models),
                    "model_count": len(models),
                },
            )
            return
        try:
            models = list_models()
        except AgyCapacityError:
            log_event("agy_capacity", status=429)
            self._error(429, PUBLIC_AGY_BUSY)
            return
        except Exception:
            log_event("inventory_unavailable", status=503)
            self._error(503, PUBLIC_INVENTORY_UNAVAILABLE)
            return
        self._json(
            200,
            {
                "object": "list",
                "data": [
                    {
                        "id": f"google-antigravity/{model['id']}",
                        "object": "model",
                        "owned_by": "antigravity-oauth",
                        "label": model["label"],
                    }
                    for model in models
                ],
            },
        )

    def do_POST(self) -> None:
        if not self._host_allowed():
            return
        if self.path != "/v1/chat/completions":
            self._error(404, PUBLIC_NOT_FOUND)
            return
        try:
            validate_http_request(
                self.headers.get("Content-Type"), self.headers.get("Origin")
            )
        except ValueError:
            log_event("request_rejected", status=403)
            self._error(403, PUBLIC_REQUEST_REJECTED)
            return
        try:
            body = read_json_body(self.headers, self.rfile)
        except RequestBodyTooLargeError:
            log_event("body_too_large", status=413)
            self._error(413, PUBLIC_BODY_TOO_LARGE)
            return
        except MissingContentLengthError:
            log_event("body_invalid", status=411)
            self._error(411, PUBLIC_CONTENT_LENGTH_REQUIRED)
            return
        except InvalidRequestBodyError:
            log_event("body_invalid", status=400)
            self._error(400, PUBLIC_INVALID_BODY)
            return
        try:
            inventory = list_models()
        except AgyCapacityError:
            log_event("agy_capacity", status=429)
            self._error(429, PUBLIC_AGY_BUSY)
            return
        except Exception:
            log_event("inventory_unavailable", status=503)
            self._error(503, PUBLIC_INVENTORY_UNAVAILABLE)
            return
        try:
            model = resolve_model(
                str(body.get("model", "")), available_models=inventory
            )
            messages = body.get("messages") or []
            tools = body.get("tools") or []
            if not isinstance(messages, list) or not all(
                isinstance(message, dict) for message in messages
            ):
                raise ValueError("messages_invalid")
            if not isinstance(tools, list) or not all(
                isinstance(tool, dict) for tool in tools
            ):
                raise ValueError("tools_invalid")
            prompt = build_prompt(messages, tools)
        except (TypeError, ValueError):
            log_event("model_invalid", status=400)
            self._error(400, PUBLIC_INVALID_MODEL)
            return
        try:
            payload = run_agy(
                prompt,
                model,
                available_models=inventory,
            )
            message = antigravity_result_to_choice(payload)
        except AgyCapacityError:
            log_event("agy_capacity", status=429)
            self._error(429, PUBLIC_AGY_BUSY)
            return
        except ProviderExecutionError:
            log_event("provider_failure", status=502)
            self._error(502, PUBLIC_PROVIDER_FAILURE)
            return
        except Exception:
            log_event("unexpected_failure", status=500)
            self._error(500, PUBLIC_PROVIDER_FAILURE)
            return
        self._json(
            200,
            {
                "id": f"chatcmpl-{uuid.uuid4().hex}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "message": message,
                        "finish_reason": (
                            "tool_calls" if message.get("tool_calls") else "stop"
                        ),
                    }
                ],
                "usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                },
            },
        )


def main() -> None:
    try:
        resolve_agy_executable()
        host = os.environ.get("ANTIGRAVITY_RELAY_HOST", "127.0.0.1")
        port = int(os.environ.get("ANTIGRAVITY_RELAY_PORT", "8651"))
        if not 1 <= port <= 65535:
            raise ValueError("port_invalid")
        server = BoundedThreadingHTTPServer((host, port), RelayHandler)
    except (OSError, RelayConfigurationError, ValueError):
        log_event("startup_failed")
        raise SystemExit(1) from None
    log_event("server_started")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except Exception:
        log_event("unexpected_failure")
        raise SystemExit(1) from None
    finally:
        try:
            server.server_close()
        except OSError:
            pass
        log_event("server_stopped")


if __name__ == "__main__":
    main()
