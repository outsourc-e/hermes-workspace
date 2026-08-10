"""Single-instance health supervisor for the local Hermes Workspace stack."""

from __future__ import annotations

import argparse
import json
import msvcrt
import os
import pathlib
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from typing import Callable, Optional

import psutil

HOME = pathlib.Path.home()
HERMES_HOME = pathlib.Path(os.environ.get("LOCALAPPDATA", HOME / "AppData/Local")) / "hermes"
WORKSPACE = HOME / "hermes-workspace"
LOG_DIR = HERMES_HOME / "logs" / "workspace-stack"
STATUS_FILE = HERMES_HOME / "stack-status.json"
LOCK_FILE = HERMES_HOME / "stack-supervisor.lock"
STARTUP_GRACE_SECONDS = 30.0
BACKOFF_BASE_SECONDS = 5.0
BACKOFF_MAX_SECONDS = 300.0
HEALTH_FAILURE_THRESHOLD = 3


@dataclass(frozen=True)
class RuntimeExecutables:
    python: str
    pythonw: str
    hermes: str
    node: str
    npm: str
    agy: str


@dataclass
class RetryState:
    started_at: Optional[float] = None
    failures: int = 0
    health_failures: int = 0
    retry_at: float = 0.0
    last_exit_code: Optional[int] = None


@dataclass(frozen=True)
class ServiceResult:
    state: str
    healthy: bool
    owned: bool
    pid: Optional[int] = None
    last_exit_code: Optional[int] = None
    error: Optional[str] = None


class ServiceSpec:
    def __init__(
        self,
        name: str,
        port: int,
        health_url: str,
        command: list[str],
        cwd: pathlib.Path,
        env: Optional[dict[str, str]] = None,
        expected_status: int = 200,
        expected_content: Optional[str] = None,
        expected_json: Optional[dict[str, object]] = None,
    ) -> None:
        self.name = name
        self.port = port
        self.health_url = health_url
        self.command = command
        self.cwd = cwd
        self.env = env or {}
        self.expected_status = expected_status
        self.expected_content = expected_content
        self.expected_json = expected_json


def resolve_executable(
    name: str,
    candidates: list[pathlib.Path | str],
) -> str:
    """Return the first existing absolute executable path or fail closed."""
    for candidate in candidates:
        if not candidate:
            continue
        path = pathlib.Path(candidate).expanduser()
        if not path.is_absolute() or not path.is_file():
            continue
        return str(path.resolve(strict=True))
    rendered = ", ".join(str(candidate) for candidate in candidates if candidate)
    raise FileNotFoundError(f"{name} executable was not found in: {rendered}")


def resolve_runtime_executables() -> RuntimeExecutables:
    """Resolve immutable absolute paths once, before the monitor loop starts."""
    current_python = pathlib.Path(sys.executable).resolve()
    current_python_dir = current_python.parent
    program_files = pathlib.Path(os.environ.get("ProgramFiles", "C:/Program Files"))
    local_programs = pathlib.Path(
        os.environ.get("LOCALAPPDATA", str(HOME / "AppData/Local"))
    ) / "Programs"
    return RuntimeExecutables(
        python=resolve_executable(
            "python",
            [
                current_python_dir / "python.exe",
                program_files / "Python312/python.exe",
                local_programs / "Python/Python312/python.exe",
            ],
        ),
        pythonw=resolve_executable(
            "pythonw",
            [
                current_python_dir / "pythonw.exe",
                program_files / "Python312/pythonw.exe",
                local_programs / "Python/Python312/pythonw.exe",
            ],
        ),
        hermes=resolve_executable(
            "hermes",
            [HERMES_HOME / "hermes-agent/venv/Scripts/hermes.exe"],
        ),
        node=resolve_executable(
            "node",
            [
                program_files / "nodejs/node.exe",
                local_programs / "nodejs/node.exe",
            ],
        ),
        npm=resolve_executable(
            "npm",
            [
                program_files / "nodejs/npm.cmd",
                local_programs / "nodejs/npm.cmd",
            ],
        ),
        agy=resolve_executable(
            "agy",
            [HERMES_HOME.parent / "agy/bin/agy.exe"],
        ),
    )


def validate_runtime_executables(executables: RuntimeExecutables) -> RuntimeExecutables:
    return RuntimeExecutables(
        **{
            name: resolve_executable(name, [getattr(executables, name)])
            for name in ("python", "pythonw", "hermes", "node", "npm", "agy")
        }
    )


def _pinned_path(executables: RuntimeExecutables) -> str:
    directories: list[str] = []
    for executable in (
        executables.python,
        executables.pythonw,
        executables.hermes,
        executables.node,
        executables.npm,
        executables.agy,
    ):
        directory = str(pathlib.Path(executable).parent)
        if directory not in directories:
            directories.append(directory)
    existing = os.environ.get("PATH")
    if existing:
        directories.append(existing)
    return os.pathsep.join(directories)


def build_service_specs(
    executables: Optional[RuntimeExecutables] = None,
) -> list[ServiceSpec]:
    executables = validate_runtime_executables(
        executables or resolve_runtime_executables()
    )
    common_env = {
        "HERMES_API_URL": "http://127.0.0.1:8642",
        "HERMES_DASHBOARD_URL": "http://127.0.0.1:9119",
        "CLAUDE_RELAY_BASE_URL": "http://127.0.0.1:8650",
        "ANTIGRAVITY_RELAY_BASE_URL": "http://127.0.0.1:8651",
        "ANTIGRAVITY_AGY_BIN": executables.agy,
        "PATH": _pinned_path(executables),
    }
    return [
        ServiceSpec(
            "hermes-gateway",
            8642,
            "http://127.0.0.1:8642/health",
            [
                executables.hermes,
                "gateway",
                "run",
                "--replace",
                "--external-supervisor",
            ],
            HOME,
            {
                **common_env,
                "API_SERVER_HOST": "127.0.0.1",
            },
            expected_json={"status": "ok"},
        ),
        ServiceSpec(
            "claude-max-relay",
            8650,
            "http://127.0.0.1:8650/health",
            [executables.python, "-u", str(HERMES_HOME / "claude-max-relay/relay.py")],
            HERMES_HOME / "claude-max-relay",
            {
                **common_env,
                "CLAUDE_RELAY_HOST": "127.0.0.1",
            },
            expected_json={"status": "ok"},
        ),
        ServiceSpec(
            "antigravity-relay",
            8651,
            "http://127.0.0.1:8651/health",
            [executables.python, "-u", str(HERMES_HOME / "antigravity-relay/relay.py")],
            HERMES_HOME / "antigravity-relay",
            {
                **common_env,
                "ANTIGRAVITY_RELAY_HOST": "127.0.0.1",
            },
            expected_json={"status": "ok"},
        ),
        ServiceSpec(
            "hermes-dashboard",
            9119,
            "http://127.0.0.1:9119/",
            [
                executables.hermes,
                "dashboard",
                "--port",
                "9119",
                "--host",
                "127.0.0.1",
                "--no-open",
            ],
            HOME,
            common_env,
            expected_content="<title>Hermes Agent - Dashboard</title>",
        ),
        ServiceSpec(
            "hermes-workspace",
            3000,
            "http://127.0.0.1:3000/operations",
            [executables.node, str(WORKSPACE / "server-entry.js")],
            WORKSPACE,
            {
                **common_env,
                "NODE_ENV": "production",
                "PORT": "3000",
                "HOST": "127.0.0.1",
            },
            expected_content="Hermes Workspace",
        ),
    ]


def health_check(spec: ServiceSpec, timeout: float = 3.0) -> bool:
    try:
        request = urllib.request.Request(
            spec.health_url,
            headers={"User-Agent": "HermesStackSupervisor/1.0"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != spec.expected_status:
                return False
            body = response.read(1024 * 1024)
            text = body.decode("utf-8", errors="replace")
            if spec.expected_content is not None and spec.expected_content not in text:
                return False
            if spec.expected_json is not None:
                payload = json.loads(text)
                if not isinstance(payload, dict):
                    return False
                if any(payload.get(key) != value for key, value in spec.expected_json.items()):
                    return False
            return True
    except Exception:
        return False


def port_listening(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def listener_owner_pids(port: int) -> set[int]:
    """Return listener PIDs or fail explicitly when ownership is unknowable."""
    try:
        owners = set()
        for connection in psutil.net_connections(kind="tcp"):
            if connection.status != psutil.CONN_LISTEN or not connection.laddr:
                continue
            if connection.laddr.port == port and connection.pid is not None:
                owners.add(int(connection.pid))
        return owners
    except Exception:
        raise RuntimeError("listener ownership unavailable") from None


def owned_process_pids(process: object) -> set[int]:
    pid = getattr(process, "pid", None)
    if not isinstance(pid, int) or pid <= 0:
        return set()
    pids = {pid}
    try:
        pids.update(child.pid for child in psutil.Process(pid).children(recursive=True))
    except Exception:
        pass
    return pids


def process_owns_listener(spec: ServiceSpec, process: object) -> bool:
    return bool(listener_owner_pids(spec.port) & owned_process_pids(process))


def terminate_process(process: object, timeout: float = 5.0) -> None:
    """Ask an owned child to exit, then force it only if it does not stop."""
    poll = getattr(process, "poll")
    if poll() is not None:
        return
    send_signal = getattr(process, "send_signal", None)
    if (
        os.name == "nt"
        and callable(send_signal)
        and hasattr(signal, "CTRL_BREAK_EVENT")
    ):
        try:
            send_signal(signal.CTRL_BREAK_EVENT)
            process.wait(timeout=timeout)
            return
        except (OSError, ValueError, subprocess.TimeoutExpired, TimeoutError):
            if poll() is not None:
                return
    try:
        process.terminate()
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=timeout)
    except (subprocess.TimeoutExpired, TimeoutError):
        if poll() is None:
            try:
                process.kill()
            except ProcessLookupError:
                return
            process.wait(timeout=timeout)


def _rotate_log(path: pathlib.Path, limit: int = 5 * 1024 * 1024) -> None:
    if not path.exists() or path.stat().st_size < limit:
        return
    for index in range(3, 0, -1):
        previous = path.with_suffix(f".log.{index}")
        following = path.with_suffix(f".log.{index + 1}")
        if previous.exists():
            if index == 3:
                previous.unlink(missing_ok=True)
            else:
                previous.replace(following)
    path.replace(path.with_suffix(".log.1"))


def spawn_service(spec: ServiceSpec) -> subprocess.Popen[bytes]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"{spec.name}.log"
    _rotate_log(log_path)
    env = os.environ.copy()
    env.update(spec.env)
    creation_flags = (
        getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    )
    with open(log_path, "ab", buffering=0) as output:
        return subprocess.Popen(
            spec.command,
            cwd=spec.cwd,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags,
        )


def _record_failure(
    retry: RetryState,
    now: float,
    backoff_base: float,
    backoff_max: float,
    exit_code: Optional[int] = None,
) -> None:
    retry.started_at = None
    retry.failures += 1
    retry.health_failures = 0
    retry.last_exit_code = exit_code
    cap = max(0.0, backoff_max)
    delay = min(cap, max(0.0, backoff_base))
    remaining_doublings = retry.failures - 1
    while delay > 0.0 and delay < cap and remaining_doublings > 0:
        delay = min(cap, delay * 2.0)
        remaining_doublings -= 1
    retry.retry_at = now + delay


def _reset_retry(retry: RetryState) -> None:
    retry.started_at = None
    retry.failures = 0
    retry.health_failures = 0
    retry.retry_at = 0.0
    retry.last_exit_code = None


def ensure_service(
    spec: ServiceSpec,
    owned: Optional[dict[str, object]] = None,
    retries: Optional[dict[str, RetryState]] = None,
    *,
    health_check: Callable[[ServiceSpec], bool] = health_check,
    spawn: Callable[[ServiceSpec], object] = spawn_service,
    port_check: Callable[[int], bool] = port_listening,
    owns_listener: Callable[[ServiceSpec, object], bool] = process_owns_listener,
    terminate: Callable[[object], None] = terminate_process,
    now: Optional[float] = None,
    startup_grace: float = STARTUP_GRACE_SECONDS,
    backoff_base: float = BACKOFF_BASE_SECONDS,
    backoff_max: float = BACKOFF_MAX_SECONDS,
) -> ServiceResult:
    owned = owned if owned is not None else {}
    retries = retries if retries is not None else {}
    current_time = time.monotonic() if now is None else now
    retry = retries.setdefault(spec.name, RetryState())
    process = owned.get(spec.name)
    observed_exit_code: Optional[int] = None

    if process is not None:
        observed_exit_code = process.poll()
        if observed_exit_code is not None:
            del owned[spec.name]
            process = None
            _record_failure(
                retry,
                current_time,
                backoff_base,
                backoff_max,
                observed_exit_code,
            )

    if health_check(spec):
        pid = getattr(process, "pid", None) if process is not None else None
        _reset_retry(retry)
        return ServiceResult("healthy", True, process is not None, pid, observed_exit_code)

    listening = port_check(spec.port)
    if listening:
        if process is not None and owns_listener(spec, process):
            if (
                retry.started_at is not None
                and current_time - retry.started_at < startup_grace
            ):
                return ServiceResult("starting", False, True, process.pid)
            retry.health_failures += 1
            if retry.health_failures < HEALTH_FAILURE_THRESHOLD:
                return ServiceResult(
                    "degraded_owned_listener",
                    False,
                    True,
                    process.pid,
                )
            terminate(process)
            owned.pop(spec.name, None)
            _record_failure(retry, current_time, backoff_base, backoff_max)
            return ServiceResult("restart_pending", False, False)
        return ServiceResult(
            "degraded_unowned_listener",
            False,
            False,
            last_exit_code=observed_exit_code,
        )

    if process is not None:
        if (
            retry.started_at is not None
            and current_time - retry.started_at < startup_grace
        ):
            return ServiceResult("starting", False, True, process.pid)
        terminate(process)
        owned.pop(spec.name, None)
        _record_failure(retry, current_time, backoff_base, backoff_max)
        return ServiceResult("restart_pending", False, False)

    if current_time < retry.retry_at:
        return ServiceResult(
            "backoff",
            False,
            False,
            last_exit_code=observed_exit_code or retry.last_exit_code,
        )

    try:
        process = spawn(spec)
        pid = getattr(process, "pid", None)
        poll = getattr(process, "poll", None)
        if not isinstance(pid, int) or pid <= 0 or not callable(poll):
            raise TypeError("spawn did not return a Popen-compatible process")
        immediate_exit = poll()
        if immediate_exit is not None:
            _record_failure(
                retry,
                current_time,
                backoff_base,
                backoff_max,
                immediate_exit,
            )
            return ServiceResult(
                "spawn_exited",
                False,
                False,
                last_exit_code=immediate_exit,
            )
        owned[spec.name] = process
        retry.started_at = current_time
        return ServiceResult("started", False, True, pid)
    except Exception as exc:
        _record_failure(retry, current_time, backoff_base, backoff_max)
        return ServiceResult("spawn_error", False, False, error=str(exc))


def supervise_once(
    specs: list[ServiceSpec],
    owned: dict[str, object],
    retries: dict[str, RetryState],
    *,
    health_check: Callable[[ServiceSpec], bool] = health_check,
    spawn: Callable[[ServiceSpec], object] = spawn_service,
    port_check: Callable[[int], bool] = port_listening,
    owns_listener: Callable[[ServiceSpec, object], bool] = process_owns_listener,
    terminate: Callable[[object], None] = terminate_process,
    now: Optional[float] = None,
    startup_grace: float = STARTUP_GRACE_SECONDS,
    backoff_base: float = BACKOFF_BASE_SECONDS,
    backoff_max: float = BACKOFF_MAX_SECONDS,
) -> dict[str, dict[str, object]]:
    statuses: dict[str, dict[str, object]] = {}
    for spec in specs:
        try:
            result = ensure_service(
                spec,
                owned,
                retries,
                health_check=health_check,
                spawn=spawn,
                port_check=port_check,
                owns_listener=owns_listener,
                terminate=terminate,
                now=now,
                startup_grace=startup_grace,
                backoff_base=backoff_base,
                backoff_max=backoff_max,
            )
        except Exception as exc:
            process = owned.get(spec.name)
            pid = getattr(process, "pid", None) if process is not None else None
            result = ServiceResult(
                "error",
                False,
                process is not None,
                pid,
                error=str(exc),
            )
        status: dict[str, object] = {
            "port": spec.port,
            "health_url": spec.health_url,
            "state": result.state,
            "healthy": result.healthy,
            "owned": result.owned,
            "pid": result.pid,
        }
        if result.last_exit_code is not None:
            status["last_exit_code"] = result.last_exit_code
        if result.error:
            status["error"] = result.error
        statuses[spec.name] = status
    return statuses


def _write_status(
    statuses: dict[str, dict[str, object]],
    *,
    status_file: pathlib.Path = STATUS_FILE,
) -> None:
    status_file.parent.mkdir(parents=True, exist_ok=True)
    document = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "services": statuses,
    }
    descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{status_file.name}.",
        suffix=".tmp",
        dir=status_file.parent,
    )
    temp_path = pathlib.Path(temp_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            json.dump(document, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_path, status_file)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise


def _report_monitor_error(context: str, error: Exception) -> None:
    try:
        if sys.stderr is not None:
            print(f"Hermes stack supervisor {context}: {error}", file=sys.stderr)
    except Exception:
        pass


def monitor_loop(
    specs: list[ServiceSpec],
    owned: dict[str, object],
    retries: dict[str, RetryState],
    *,
    interval: float = 15.0,
    max_cycles: Optional[int] = None,
    writer: Callable[[dict[str, dict[str, object]]], None] = _write_status,
    sleeper: Callable[[float], None] = time.sleep,
    now: Callable[[], float] = time.monotonic,
    health_check: Callable[[ServiceSpec], bool] = health_check,
    spawn: Callable[[ServiceSpec], object] = spawn_service,
    port_check: Callable[[int], bool] = port_listening,
    owns_listener: Callable[[ServiceSpec, object], bool] = process_owns_listener,
    terminate: Callable[[object], None] = terminate_process,
    startup_grace: float = STARTUP_GRACE_SECONDS,
    backoff_base: float = BACKOFF_BASE_SECONDS,
    backoff_max: float = BACKOFF_MAX_SECONDS,
) -> None:
    cycles = 0
    while max_cycles is None or cycles < max_cycles:
        try:
            statuses = supervise_once(
                specs,
                owned,
                retries,
                health_check=health_check,
                spawn=spawn,
                port_check=port_check,
                owns_listener=owns_listener,
                terminate=terminate,
                now=now(),
                startup_grace=startup_grace,
                backoff_base=backoff_base,
                backoff_max=backoff_max,
            )
        except Exception as exc:
            _report_monitor_error("cycle failed", exc)
            statuses = {}
        try:
            writer(statuses)
        except Exception as exc:
            _report_monitor_error("status write failed", exc)
        cycles += 1
        if max_cycles is not None and cycles >= max_cycles:
            break
        try:
            sleeper(interval)
        except Exception as exc:
            _report_monitor_error("sleep failed", exc)


def shutdown_owned_services(
    owned: dict[str, object],
    *,
    terminate: Callable[[object], None] = terminate_process,
) -> None:
    for name, process in list(owned.items()):
        try:
            if process.poll() is None:
                terminate(process)
        except Exception as exc:
            _report_monitor_error(f"cleanup failed for {name}", exc)
        finally:
            owned.pop(name, None)


def acquire_single_instance():
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    handle = open(LOCK_FILE, "a+b")
    handle.seek(0)
    try:
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        handle.close()
        return None
    return handle


def run_supervisor(
    interval: int = 15,
    executables: Optional[RuntimeExecutables] = None,
) -> int:
    lock = acquire_single_instance()
    if lock is None:
        return 0
    owned: dict[str, object] = {}
    retries: dict[str, RetryState] = {}
    try:
        specs = build_service_specs(executables)
        monitor_loop(specs, owned, retries, interval=interval)
    except KeyboardInterrupt:
        return 0
    finally:
        shutdown_owned_services(owned)
        lock.close()
    return 0


def parse_cli(argv: Optional[list[str]] = None) -> tuple[int, RuntimeExecutables]:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", type=int, default=15)
    parser.add_argument("--python-exe")
    parser.add_argument("--pythonw-exe")
    parser.add_argument("--hermes-exe")
    parser.add_argument("--node-exe")
    parser.add_argument("--npm-exe")
    parser.add_argument("--agy-exe")
    arguments = parser.parse_args(argv)
    if arguments.interval < 1:
        parser.error("--interval must be at least 1 second")

    overrides = {
        "python": arguments.python_exe,
        "pythonw": arguments.pythonw_exe,
        "hermes": arguments.hermes_exe,
        "node": arguments.node_exe,
        "npm": arguments.npm_exe,
        "agy": arguments.agy_exe,
    }
    supplied = [value is not None for value in overrides.values()]
    if any(supplied) and not all(supplied):
        parser.error("all six executable overrides must be supplied together")
    executables = (
        validate_runtime_executables(RuntimeExecutables(**overrides))
        if all(supplied)
        else resolve_runtime_executables()
    )
    return arguments.interval, executables


def main() -> None:
    interval, executables = parse_cli()
    raise SystemExit(run_supervisor(interval, executables))


if __name__ == "__main__":
    main()
