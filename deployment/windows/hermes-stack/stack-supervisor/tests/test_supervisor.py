import contextlib
import importlib.util
import io
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[1]
POWERSHELL = pathlib.Path(os.environ.get("WINDIR", r"C:\Windows")) / (
    r"System32\WindowsPowerShell\v1.0\powershell.exe"
)
SPEC = importlib.util.spec_from_file_location("stack_supervisor", ROOT / "supervisor.py")
supervisor = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = supervisor
SPEC.loader.exec_module(supervisor)


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        responses = {
            "/good": (200, "application/json", json.dumps({"status": "ok"})),
            "/wrong-status": (204, "application/json", json.dumps({"status": "ok"})),
            "/wrong-json": (200, "application/json", json.dumps({"status": "starting"})),
            "/good-html": (
                200,
                "text/html",
                "<title>Operations — Hermes Workspace</title>",
            ),
            "/wrong-html": (200, "text/html", "<title>Unrelated service</title>"),
        }
        status, content_type, body = responses[self.path]
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, _format, *_args):
        pass


@contextlib.contextmanager
def health_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()


def powershell_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def run_powershell(source, timeout=30):
    return subprocess.run(
        [
            str(POWERSHELL),
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            source,
        ],
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def make_executables(directory: pathlib.Path):
    names = {
        "python": "python.exe",
        "pythonw": "pythonw.exe",
        "hermes": "hermes.exe",
        "node": "node.exe",
        "npm": "npm.cmd",
        "agy": "agy.exe",
    }
    paths = {}
    for key, name in names.items():
        path = directory / name
        path.touch()
        paths[key] = str(path.resolve())
    return supervisor.RuntimeExecutables(**paths)


def make_spec(name="test"):
    return supervisor.ServiceSpec(
        name,
        9999,
        "http://127.0.0.1:9999/health",
        [r"C:\absolute\test.exe"],
        ROOT,
        expected_json={"status": "ok"},
    )


class FakeProcess:
    def __init__(self, pid, returncode=None):
        self.pid = pid
        self.returncode = returncode
        self.terminated = False
        self.killed = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = 0

    def wait(self, timeout=None):
        if self.returncode is None:
            raise TimeoutError(f"still running after {timeout}")
        return self.returncode

    def kill(self):
        self.killed = True
        self.returncode = -9


class GracefulProcess(FakeProcess):
    def __init__(self, pid):
        super().__init__(pid)
        self.signals = []

    def send_signal(self, sent_signal):
        self.signals.append(sent_signal)
        self.returncode = 0


class StackSupervisorTests(unittest.TestCase):
    def test_resolve_executable_returns_a_validated_absolute_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            executable = pathlib.Path(temp_dir) / "tool.exe"
            executable.touch()
            resolved = supervisor.resolve_executable("tool", [executable])
            self.assertEqual(resolved, str(executable.resolve()))

    def test_resolve_executable_rejects_missing_candidates(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing = pathlib.Path(temp_dir) / "missing.exe"
            with self.assertRaisesRegex(FileNotFoundError, "tool"):
                supervisor.resolve_executable("tool", [missing])

    def test_listener_inspection_failure_is_not_silently_treated_as_unowned(self):
        class FailingPsutil:
            CONN_LISTEN = "LISTEN"

            @staticmethod
            def net_connections(kind):
                raise RuntimeError(f"inspection failed for {kind}")

        with patch.object(supervisor, "psutil", FailingPsutil, create=True):
            with self.assertRaisesRegex(RuntimeError, "listener ownership unavailable"):
                supervisor.listener_owner_pids(9999)

    def test_specs_pin_absolute_commands_and_force_loopback_bindings(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            executables = make_executables(pathlib.Path(temp_dir))
            specs = supervisor.build_service_specs(executables)

        self.assertEqual(
            [spec.name for spec in specs],
            [
                "hermes-gateway",
                "claude-max-relay",
                "antigravity-relay",
                "hermes-dashboard",
                "hermes-workspace",
            ],
        )
        self.assertEqual([spec.port for spec in specs], [8642, 8650, 8651, 9119, 3000])
        self.assertTrue(all(pathlib.Path(spec.command[0]).is_absolute() for spec in specs))
        self.assertEqual(specs[0].env["API_SERVER_HOST"], "127.0.0.1")
        self.assertEqual(specs[1].env["CLAUDE_RELAY_HOST"], "127.0.0.1")
        self.assertEqual(specs[2].env["ANTIGRAVITY_RELAY_HOST"], "127.0.0.1")
        self.assertEqual(specs[2].env["ANTIGRAVITY_AGY_BIN"], executables.agy)
        self.assertIn("--host", specs[3].command)
        self.assertEqual(specs[3].command[specs[3].command.index("--host") + 1], "127.0.0.1")
        self.assertEqual(specs[4].env["HOST"], "127.0.0.1")
        self.assertTrue(all("127.0.0.1" in spec.health_url for spec in specs))
        self.assertEqual(
            specs[0].command[1:],
            ["gateway", "run", "--replace", "--external-supervisor"],
        )
        self.assertEqual(specs[4].expected_content, "Hermes Workspace")

    def test_health_check_accepts_only_the_expected_status_and_json_content(self):
        with health_server() as base_url:
            good = supervisor.ServiceSpec(
                "good",
                1,
                f"{base_url}/good",
                ["unused"],
                ROOT,
                expected_json={"status": "ok"},
            )
            wrong_status = supervisor.ServiceSpec(
                "wrong-status",
                1,
                f"{base_url}/wrong-status",
                ["unused"],
                ROOT,
                expected_json={"status": "ok"},
            )
            wrong_json = supervisor.ServiceSpec(
                "wrong-json",
                1,
                f"{base_url}/wrong-json",
                ["unused"],
                ROOT,
                expected_json={"status": "ok"},
            )

            self.assertTrue(supervisor.health_check(good))
            self.assertFalse(supervisor.health_check(wrong_status))
            self.assertFalse(supervisor.health_check(wrong_json))

    def test_health_check_requires_the_expected_html_marker(self):
        with health_server() as base_url:
            good = supervisor.ServiceSpec(
                "good-html",
                1,
                f"{base_url}/good-html",
                ["unused"],
                ROOT,
                expected_content="Hermes Workspace",
            )
            wrong = supervisor.ServiceSpec(
                "wrong-html",
                1,
                f"{base_url}/wrong-html",
                ["unused"],
                ROOT,
                expected_content="Hermes Workspace",
            )

            self.assertTrue(supervisor.health_check(good))
            self.assertFalse(supervisor.health_check(wrong))

    def test_workspace_environment_preserves_oauth_relay_routes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = supervisor.build_service_specs(
                make_executables(pathlib.Path(temp_dir))
            )[-1]
        self.assertEqual(workspace.env["PORT"], "3000")
        self.assertEqual(workspace.env["CLAUDE_RELAY_BASE_URL"], "http://127.0.0.1:8650")
        self.assertEqual(
            workspace.env["ANTIGRAVITY_RELAY_BASE_URL"],
            "http://127.0.0.1:8651",
        )

    def test_cli_validates_all_six_pinned_executable_overrides(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            executables = make_executables(pathlib.Path(temp_dir))
            interval, parsed = supervisor.parse_cli(
                [
                    "--interval",
                    "7",
                    "--python-exe",
                    executables.python,
                    "--pythonw-exe",
                    executables.pythonw,
                    "--hermes-exe",
                    executables.hermes,
                    "--node-exe",
                    executables.node,
                    "--npm-exe",
                    executables.npm,
                    "--agy-exe",
                    executables.agy,
                ]
            )

        self.assertEqual(interval, 7)
        self.assertEqual(parsed, executables)


class ServiceLifecycleTests(unittest.TestCase):
    def test_windows_process_group_gets_graceful_break_before_termination(self):
        process = GracefulProcess(909)

        supervisor.terminate_process(process)

        self.assertEqual(process.signals, [signal.CTRL_BREAK_EVENT])
        self.assertFalse(process.terminated)
        self.assertFalse(process.killed)

    def test_unhealthy_unowned_listener_is_reported_degraded_and_never_replaced(self):
        spawned = []
        owned = {}
        retries = {}

        result = supervisor.ensure_service(
            make_spec(),
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: True,
            owns_listener=lambda _spec, _process: False,
            spawn=lambda spec: spawned.append(spec),
            now=100.0,
        )

        self.assertEqual(result.state, "degraded_unowned_listener")
        self.assertFalse(result.healthy)
        self.assertFalse(result.owned)
        self.assertEqual(spawned, [])
        self.assertEqual(owned, {})

    def test_single_failed_probe_does_not_restart_owned_listener(self):
        spec = make_spec()
        process = FakeProcess(100)
        owned = {spec.name: process}
        retries = {spec.name: supervisor.RetryState()}

        result = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: True,
            owns_listener=lambda _spec, current: current is process,
            terminate=supervisor.terminate_process,
            now=100.0,
        )

        self.assertEqual(result.state, "degraded_owned_listener")
        self.assertTrue(result.owned)
        self.assertFalse(process.terminated)
        self.assertIs(owned[spec.name], process)

    def test_hung_owned_listener_is_terminated_then_restarted_after_backoff(self):
        spec = make_spec()
        hung = FakeProcess(101)
        replacement = FakeProcess(202)
        owned = {spec.name: hung}
        retries = {
            spec.name: supervisor.RetryState(started_at=0.0),
        }
        spawned = []

        for current_time in (20.0, 21.0):
            degraded = supervisor.ensure_service(
                spec,
                owned,
                retries,
                health_check=lambda _spec: False,
                port_check=lambda _port: True,
                owns_listener=lambda _spec, process: process is hung,
                spawn=lambda _spec: replacement,
                terminate=supervisor.terminate_process,
                now=current_time,
                startup_grace=10.0,
                backoff_base=5.0,
            )
            self.assertEqual(degraded.state, "degraded_owned_listener")
            self.assertFalse(hung.terminated)

        stopped = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: True,
            owns_listener=lambda _spec, process: process is hung,
            spawn=lambda _spec: replacement,
            terminate=supervisor.terminate_process,
            now=22.0,
            startup_grace=10.0,
            backoff_base=5.0,
        )

        self.assertEqual(stopped.state, "restart_pending")
        self.assertTrue(hung.terminated)
        self.assertNotIn(spec.name, owned)
        self.assertEqual(retries[spec.name].retry_at, 27.0)

        restarted = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: False,
            owns_listener=lambda _spec, _process: False,
            spawn=lambda current: (spawned.append(current), replacement)[1],
            now=27.0,
            startup_grace=10.0,
            backoff_base=5.0,
        )

        self.assertEqual(restarted.state, "started")
        self.assertEqual(restarted.pid, 202)
        self.assertIs(owned[spec.name], replacement)
        self.assertEqual(spawned, [spec])

    def test_slow_start_stays_in_grace_and_cannot_spawn_a_duplicate(self):
        spec = make_spec()
        slow = FakeProcess(303)
        spawned = []
        owned = {}
        retries = {}

        first = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: False,
            spawn=lambda current: (spawned.append(current), slow)[1],
            now=10.0,
            startup_grace=30.0,
        )
        second = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: False,
            spawn=lambda current: (spawned.append(current), FakeProcess(404))[1],
            now=25.0,
            startup_grace=30.0,
        )

        self.assertEqual(first.state, "started")
        self.assertEqual(second.state, "starting")
        self.assertEqual(second.pid, 303)
        self.assertEqual(spawned, [spec])
        self.assertIs(owned[spec.name], slow)

    def test_exited_popen_is_removed_and_backoff_blocks_an_immediate_respawn(self):
        spec = make_spec()
        exited = FakeProcess(505, returncode=17)
        owned = {spec.name: exited}
        retries = {spec.name: supervisor.RetryState(started_at=40.0)}
        spawned = []

        result = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: False,
            spawn=lambda current: spawned.append(current),
            now=41.0,
            backoff_base=5.0,
        )

        self.assertEqual(result.state, "backoff")
        self.assertEqual(result.last_exit_code, 17)
        self.assertNotIn(spec.name, owned)
        self.assertEqual(spawned, [])
        self.assertEqual(retries[spec.name].retry_at, 46.0)

    def test_healthy_unowned_process_is_preserved(self):
        spec = make_spec()
        spawned = []
        owned = {}
        retries = {spec.name: supervisor.RetryState(failures=3, retry_at=500.0)}

        result = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: True,
            port_check=lambda _port: True,
            spawn=lambda current: spawned.append(current),
            now=100.0,
        )

        self.assertEqual(result.state, "healthy")
        self.assertTrue(result.healthy)
        self.assertFalse(result.owned)
        self.assertEqual(spawned, [])
        self.assertEqual(retries[spec.name].failures, 0)
        self.assertEqual(retries[spec.name].retry_at, 0.0)

    def test_backoff_remains_capped_after_many_consecutive_failures(self):
        spec = make_spec()
        exited = FakeProcess(1001, returncode=1)
        owned = {spec.name: exited}
        retries = {
            spec.name: supervisor.RetryState(
                started_at=9.0,
                failures=5000,
            )
        }

        result = supervisor.ensure_service(
            spec,
            owned,
            retries,
            health_check=lambda _spec: False,
            port_check=lambda _port: False,
            now=10.0,
            backoff_base=5.0,
            backoff_max=300.0,
        )

        self.assertEqual(result.state, "backoff")
        self.assertEqual(retries[spec.name].retry_at, 310.0)


class MonitorAndStatusTests(unittest.TestCase):
    def test_spawn_exception_is_isolated_and_later_services_are_still_started(self):
        first = make_spec("first")
        second = make_spec("second")
        replacement = FakeProcess(606)
        spawn_attempts = []

        def spawn(spec):
            spawn_attempts.append(spec.name)
            if spec is first:
                raise OSError("cannot spawn first")
            return replacement

        owned = {}
        statuses = supervisor.supervise_once(
            [first, second],
            owned,
            {},
            health_check=lambda _spec: False,
            port_check=lambda _port: False,
            spawn=spawn,
            now=10.0,
        )

        self.assertEqual(spawn_attempts, ["first", "second"])
        self.assertEqual(statuses["first"]["state"], "spawn_error")
        self.assertIn("cannot spawn first", statuses["first"]["error"])
        self.assertEqual(statuses["second"]["state"], "started")
        self.assertEqual(statuses["second"]["pid"], 606)
        self.assertIs(owned["second"], replacement)

    def test_per_service_health_exception_does_not_abort_the_cycle(self):
        first = make_spec("first")
        second = make_spec("second")

        def check(spec):
            if spec is first:
                raise RuntimeError("broken health probe")
            return True

        statuses = supervisor.supervise_once(
            [first, second],
            {},
            {},
            health_check=check,
            port_check=lambda _port: False,
            now=10.0,
        )

        self.assertEqual(statuses["first"]["state"], "error")
        self.assertIn("broken health probe", statuses["first"]["error"])
        self.assertEqual(statuses["second"]["state"], "healthy")

    def test_status_write_exception_does_not_stop_later_monitor_cycles(self):
        writes = []

        def writer(statuses):
            writes.append(statuses)
            if len(writes) == 1:
                raise OSError("disk temporarily unavailable")

        errors = io.StringIO()
        with contextlib.redirect_stderr(errors):
            supervisor.monitor_loop(
                [make_spec()],
                {},
                {},
                interval=0,
                max_cycles=2,
                writer=writer,
                sleeper=lambda _seconds: None,
                health_check=lambda _spec: True,
                port_check=lambda _port: True,
                now=lambda: 10.0,
            )

        self.assertEqual(len(writes), 2)
        self.assertEqual(writes[1]["test"]["state"], "healthy")
        self.assertIn("status write failed", errors.getvalue())

    def test_status_file_is_published_by_atomic_replace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            status_file = pathlib.Path(temp_dir) / "status.json"
            status_file.write_text('{"generation":"old"}', encoding="utf-8")
            real_replace = os.replace
            observed = {}

            def observe_replace(source, target):
                observed["old"] = status_file.read_text(encoding="utf-8")
                observed["new"] = json.loads(pathlib.Path(source).read_text(encoding="utf-8"))
                real_replace(source, target)

            with patch.object(supervisor.os, "replace", side_effect=observe_replace):
                supervisor._write_status(
                    {"test": {"state": "healthy"}},
                    status_file=status_file,
                )

            self.assertEqual(observed["old"], '{"generation":"old"}')
            self.assertEqual(observed["new"]["services"]["test"]["state"], "healthy")
            published = json.loads(status_file.read_text(encoding="utf-8"))
            self.assertEqual(published["services"]["test"]["state"], "healthy")

    def test_failed_atomic_replace_preserves_old_status_and_removes_temp_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = pathlib.Path(temp_dir)
            status_file = directory / "status.json"
            status_file.write_text('{"generation":"old"}', encoding="utf-8")

            with patch.object(supervisor.os, "replace", side_effect=OSError("locked")):
                with self.assertRaisesRegex(OSError, "locked"):
                    supervisor._write_status(
                        {"test": {"state": "healthy"}},
                        status_file=status_file,
                    )

            self.assertEqual(
                status_file.read_text(encoding="utf-8"),
                '{"generation":"old"}',
            )
            self.assertEqual([path.name for path in directory.iterdir()], ["status.json"])

    def test_shutdown_terminates_only_tracked_owned_children(self):
        owned_process = FakeProcess(707)
        healthy_unowned_process = FakeProcess(808)
        owned = {"owned": owned_process}

        supervisor.shutdown_owned_services(owned)

        self.assertTrue(owned_process.terminated)
        self.assertFalse(healthy_unowned_process.terminated)
        self.assertEqual(owned, {})


class PowerShellScriptTests(unittest.TestCase):
    def test_launcher_surfaces_a_missing_scheduled_task_and_never_opens_browser(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            browser_marker = pathlib.Path(temp_dir) / "browser.txt"
            source = f"""
function Get-ScheduledTask {{ throw 'task lookup failed' }}
function Start-Process {{ param($FilePath) Set-Content -LiteralPath {powershell_quote(browser_marker)} -Value $FilePath }}
. {powershell_quote(ROOT / 'launch-workspace.ps1')} -TimeoutSeconds 0 -PollMilliseconds 1 -NoFailureDialog
"""
            result = run_powershell(source)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "Required scheduled task 'Hermes_Workspace_Stack' was not found",
                result.stdout + result.stderr,
            )
            self.assertFalse(browser_marker.exists())

    def test_launcher_rejects_wrong_health_content_and_never_opens_browser(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            browser_marker = pathlib.Path(temp_dir) / "browser.txt"
            source = f"""
$script:dateCalls = 0
function Get-Date {{
  $script:dateCalls += 1
  if ($script:dateCalls -eq 1) {{ return [datetime]'2026-01-01T00:00:00' }}
  return [datetime]'2026-01-01T00:01:00'
}}
function Get-ScheduledTask {{ [pscustomobject]@{{ State = 'Running' }} }}
function Get-ScheduledTaskInfo {{ [pscustomobject]@{{ LastTaskResult = 0 }} }}
function Invoke-WebRequest {{ [pscustomobject]@{{ StatusCode = 200; Content = '<title>Wrong service</title>' }} }}
function Start-Sleep {{ param($Milliseconds) }}
function Start-Process {{ param($FilePath) Set-Content -LiteralPath {powershell_quote(browser_marker)} -Value $FilePath }}
. {powershell_quote(ROOT / 'launch-workspace.ps1')} -TimeoutSeconds 0 -PollMilliseconds 1 -NoFailureDialog
"""
            result = run_powershell(source)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Hermes Workspace launcher failed", result.stdout + result.stderr)
            self.assertIn("did not become healthy", result.stdout + result.stderr)
            self.assertFalse(browser_marker.exists())

    def test_launcher_opens_operations_only_after_expected_health_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            browser_marker = pathlib.Path(temp_dir) / "browser.txt"
            source = f"""
function Get-ScheduledTask {{ [pscustomobject]@{{ State = 'Running' }} }}
function Invoke-WebRequest {{ [pscustomobject]@{{ StatusCode = 200; Content = '<title>Operations — Hermes Workspace</title>' }} }}
function Start-Process {{ param($FilePath) Set-Content -LiteralPath {powershell_quote(browser_marker)} -Value $FilePath }}
. {powershell_quote(ROOT / 'launch-workspace.ps1')} -TimeoutSeconds 1 -PollMilliseconds 1 -NoFailureDialog
"""
            result = run_powershell(source)

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(
                browser_marker.read_text(encoding="utf-8-sig").strip(),
                "http://127.0.0.1:3000/operations",
            )

    def test_installer_waits_for_pythonw_validation_process(self):
        source = (ROOT / "install.ps1").read_text(encoding="utf-8")
        self.assertIn("Start-Process", source)
        self.assertIn("-Wait", source)
        self.assertIn(".ExitCode", source)

    def test_installer_validates_required_psutil_dependency(self):
        source = (ROOT / "install.ps1").read_text(encoding="utf-8")
        self.assertIn("import psutil", source)

    def test_installer_does_not_resolve_executables_from_path(self):
        source = (ROOT / "install.ps1").read_text(encoding="utf-8")
        self.assertNotIn("Get-ApplicationPath", source)
        self.assertNotIn("Get-Command", source)

    def test_deploy_wrapper_does_not_read_stale_native_exit_code(self):
        source = (ROOT.parent / "deploy.ps1").read_text(encoding="utf-8")
        self.assertNotIn("$LASTEXITCODE", source)

    def test_installer_is_repeatable_pins_all_executables_and_ignores_duplicates(self):
        source = f"""
class FakeShortcut {{
  [string]$TargetPath
  [string]$Arguments
  [string]$WorkingDirectory
  [string]$Description
  [void] Save() {{}}
}}
class FakeShell {{
  [object] CreateShortcut([string]$Path) {{ return [FakeShortcut]::new() }}
}}
$script:registerCount = 0
$script:startCount = 0
$script:taskState = 'Ready'
$script:lastAction = $null
$script:lastSettings = $null
function New-ScheduledTaskAction {{
  param($Execute, $Argument, $WorkingDirectory)
  $script:lastAction = [pscustomobject]@{{ Execute = $Execute; Argument = $Argument; WorkingDirectory = $WorkingDirectory }}
  return $script:lastAction
}}
function New-ScheduledTaskTrigger {{ param([switch]$AtLogOn, $User) return [pscustomobject]@{{ User = $User }} }}
function New-ScheduledTaskSettingsSet {{
  param(
    [switch]$AllowStartIfOnBatteries,
    [switch]$DontStopIfGoingOnBatteries,
    [switch]$StartWhenAvailable,
    $MultipleInstances,
    $RestartCount,
    $RestartInterval,
    $ExecutionTimeLimit
  )
  $script:lastSettings = [pscustomobject]@{{ MultipleInstances = $MultipleInstances; RestartCount = $RestartCount }}
  return $script:lastSettings
}}
function Register-ScheduledTask {{
  param($TaskName, $Action, $Trigger, $Settings, $Description, [switch]$Force)
  if (-not $Force) {{ throw 'installer must register idempotently with -Force' }}
  $script:registerCount += 1
  return [pscustomobject]@{{ TaskName = $TaskName }}
}}
function Get-ScheduledTask {{ param($TaskName) [pscustomobject]@{{ State = $script:taskState }} }}
function Start-ScheduledTask {{
  param($TaskName)
  $script:startCount += 1
  $script:taskState = 'Running'
}}
function New-Object {{ param($ComObject) return [FakeShell]::new() }}
. {powershell_quote(ROOT / 'install.ps1')}
. {powershell_quote(ROOT / 'install.ps1')}
if ($script:registerCount -ne 2) {{ throw "expected two safe registrations, got $script:registerCount" }}
if ($script:startCount -ne 1) {{ throw "expected one nonredundant task start, got $script:startCount" }}
if ($script:lastSettings.MultipleInstances -ne 'IgnoreNew') {{ throw 'task must ignore duplicate instances' }}
if (-not [IO.Path]::IsPathRooted($script:lastAction.Execute)) {{ throw 'pythonw action is not absolute' }}
foreach ($flag in @('--python-exe','--pythonw-exe','--hermes-exe','--node-exe','--npm-exe','--agy-exe')) {{
  if ($script:lastAction.Argument -notlike "*$flag*") {{ throw "missing pinned argument $flag" }}
}}
'INSTALL_TEST_OK'
"""
        result = run_powershell(source, timeout=60)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("INSTALL_TEST_OK", result.stdout)


if __name__ == "__main__":
    unittest.main()
