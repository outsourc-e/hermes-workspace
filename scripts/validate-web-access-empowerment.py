#!/usr/bin/env python3
"""Validate web-access empowerment integration without external Python deps."""
from __future__ import annotations

import json
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROFILE_SKILL_ROOT = pathlib.Path.home() / ".hermes/profiles/laptop-code/skills/web-access"

REQUIRED_WORKSPACE_FILES = [
    "docs/swarm/WEB-ACCESS-EMPOWERMENT-PLAN.md",
    "docs/swarm/WEB-ACCESS-PROFILE-STRATEGY.md",
    "docs/swarm/WEB-ACCESS-EVAL-MATRIX.md",
    "docs/swarm/WEB-ACCESS-PHASE0-REPORT.md",
    "docs/swarm/WEB-ACCESS-GBRAIN-CAPTURE.md",
    "docker-compose.yml",
    "package.json",
    "scripts/setup-web-empowerment.sh",
    "skills/agent-browser-core.md",
    "skills/researcher-agent-browser.md",
    "skills/qa-dogfood-browser.md",
    "skills/builder-agent-browser.md",
    "skills/crawl4ai-research.md",
    "skills/web-access-maintenance.md",
    "evals/web-access/cases/phase0-pilot.json",
    "docs/swarm/WEB-ACCESS-PHASE1-IDEA-ENGINE.md",
    "evals/web-access/contracts/researcher-site-intelligence.yaml",
    "evals/web-access/contracts/market-map-breadth.yaml",
    "evals/web-access/run-researcher-pilot.sh",
    "docs/swarm/WEB-ACCESS-PHASE2-EXECUTION-WORKERS.md",
    "evals/web-access/run-qa-builder-smoke.sh",
    "docs/swarm/WEB-ACCESS-GOVERNANCE-HYGIENE.md",
    "evals/web-access/eval-suite.yaml",
    "evals/web-access/run-web-access-suite.sh",
]

EXPECTED_SWARM = {
    "researcher": {
        "tools": ["agent-browser", "crawl4ai"],
        "skills": ["agent-browser-core", "researcher-agent-browser", "crawl4ai-research"],
        "capabilities": ["agent-browser-research", "crawl4ai-breadth"],
    },
    "qa": {
        "tools": ["agent-browser"],
        "skills": ["agent-browser-core", "qa-dogfood-browser"],
        "capabilities": ["agent-browser-smoke", "browser-evidence-capture"],
    },
    "builder": {
        "tools": ["agent-browser"],
        "skills": ["agent-browser-core", "builder-agent-browser"],
        "capabilities": ["agent-browser-execution"],
    },
    "maintainer": {
        "skills": ["web-access-maintenance"],
        "capabilities": ["web-access-hygiene"],
    },
}

PHASE1_CONTRACT_FILES = [
    "evals/web-access/contracts/researcher-site-intelligence.yaml",
    "evals/web-access/contracts/market-map-breadth.yaml",
]

PHASE1_CONTRACT_KEYS = [
    "Goal",
    "Scope",
    "Metric",
    "Verify",
    "Guard",
    "Iterations",
    "Results_log",
    "Rollback",
    "Greenlight",
]

PHASE1_DOC_MARKERS = [
    "GBrain",
    "Crawl4AI",
    "agent-browser",
    "browser-use/deep-browser",
    "Site-intelligence pattern",
    "Source inventory schema",
    "Market and competitive research pattern",
    "GBrain capture contract",
]

PHASE2_DOC_MARKERS = [
    "QA",
    "Builder",
    "evidence",
    "agent-browser",
    "Crawl4AI",
    "deep-browser gated",
    "no cloud stealth",
    "no credentials",
]

PHASE2_RUNNER_MARKERS = [
    "https://example.com",
    ".agent-browser-profiles",
    "$PROFILE_ROOT/qa",
    "$PROFILE_ROOT/builder",
    "AGENT_BROWSER_QA_PROFILE",
    "AGENT_BROWSER_BUILDER_PROFILE",
    "AGENT_BROWSER_SOCKET_DIR",
    "AGENT_BROWSER_ALLOWED_DOMAINS",
    ".hermes/evidence/web-access/qa-builder-smoke",
    "qa/snapshot-before.txt",
    "qa/screenshot-before.png",
    "qa/qa-report.md",
    "builder/before.snapshot.txt",
    "builder/before.png",
    "builder/actions.md",
    "summary.json",
    "Example Domain",
    "No credential entry",
    "No public actions",
    "No form submission",
    "No external sends",
]

PHASE3_DOC_MARKERS = [
    "Maintainer",
    "Researcher",
    "QA",
    "Builder",
    "Orchestrator",
    "greenlight",
    "no cloud stealth default",
    "robots/site terms",
    "quarterly",
    "monthly",
]

PHASE3_LANES = [
    "phase0-smoke",
    "researcher-pilot",
    "qa-builder-smoke",
    "gated-antibot-matrix",
    "gated-auth-persistence",
    "gated-token-cost-baseline",
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def run(cmd: list[str], timeout: int = 20) -> str:
    try:
        return subprocess.check_output(cmd, cwd=ROOT, text=True, stderr=subprocess.STDOUT, timeout=timeout)
    except subprocess.CalledProcessError as exc:
        fail(f"command failed ({' '.join(cmd)}): {exc.output.strip()}")
    except subprocess.TimeoutExpired:
        fail(f"command timed out ({' '.join(cmd)})")


def worker_block(text: str, worker_id: str) -> str:
    pattern = rf"(?ms)^- id: {re.escape(worker_id)}\n(?P<body>.*?)(?=^- id: |\Z)"
    m = re.search(pattern, text)
    if not m:
        fail(f"missing worker block {worker_id}")
    return m.group("body")


def section_items(block: str, section: str) -> set[str]:
    m = re.search(rf"(?ms)^  {section}:\n(?P<body>(?:  - .*\n)+)", block)
    if not m:
        return set()
    return {line.strip()[2:] for line in m.group("body").splitlines() if line.strip().startswith("- ")}


def main() -> None:
    missing = [p for p in REQUIRED_WORKSPACE_FILES if not (ROOT / p).exists()]
    if missing:
        fail("missing workspace files: " + ", ".join(missing))

    package = json.loads((ROOT / "package.json").read_text())
    scripts = package.get("scripts", {})
    for name, expected in {
        "web-access:validate": "python3 scripts/validate-web-access-empowerment.py",
        "web-access:smoke": "bash evals/web-access/run-phase0-smoke.sh",
        "web-access:suite": "bash evals/web-access/run-web-access-suite.sh",
    }.items():
        if scripts.get(name) != expected:
            fail(f"package.json script {name!r} missing or drifted")

    compose = (ROOT / "docker-compose.yml").read_text()
    for marker in [
        "crawl4ai:",
        "unclecode/crawl4ai:0.8.5",
        "127.0.0.1:11235:11235",
        "http://localhost:11235/health",
    ]:
        if marker not in compose:
            fail(f"docker-compose.yml missing Crawl4AI marker {marker!r}")

    setup = ROOT / "scripts/setup-web-empowerment.sh"
    if not setup.stat().st_mode & 0o111:
        fail("setup-web-empowerment.sh is not executable")
    setup_text = setup.read_text()
    for marker in [
        "npm install -g agent-browser",
        "agent-browser install",
        "unclecode/crawl4ai:0.8.5",
        "127.0.0.1:11235:11235",
        "validate-web-access-empowerment.py",
        "no new MCP servers",
    ]:
        if marker not in setup_text:
            fail(f"setup-web-empowerment.sh missing marker {marker!r}")

    swarm = (ROOT / "swarm.yaml").read_text()
    for worker, sections in EXPECTED_SWARM.items():
        block = worker_block(swarm, worker)
        for section, expected in sections.items():
            have = section_items(block, section)
            absent = [item for item in expected if item not in have]
            if absent:
                fail(f"{worker}.{section} missing {absent}; have={sorted(have)}")

    skill_names = [
        "agent-browser-core",
        "researcher-agent-browser",
        "qa-dogfood-browser",
        "builder-agent-browser",
        "crawl4ai-research",
        "web-access-maintenance",
    ]
    for name in skill_names:
        repo_skill = ROOT / "skills" / f"{name}.md"
        txt = repo_skill.read_text()
        if f"name: {name}" not in txt.split("---", 2)[1]:
            fail(f"workspace skill has wrong frontmatter: {repo_skill}")

    # Active laptop profile mirrors are runtime rollout proof, but they live
    # outside this repo and must not make clean-checkout validation fail.
    if PROFILE_SKILL_ROOT.exists():
        for name in skill_names:
            p = PROFILE_SKILL_ROOT / name / "SKILL.md"
            if p.exists():
                txt = p.read_text()
                if f"name: {name}" not in txt.split("---", 2)[1]:
                    fail(f"profile skill has wrong frontmatter: {p}")

    cases = json.loads((ROOT / "evals/web-access/cases/phase0-pilot.json").read_text())
    if not cases or not all("guard" in c and "methods" in c for c in cases):
        fail("phase0 pilot eval cases missing guard/methods")

    phase1_doc = (ROOT / "docs/swarm/WEB-ACCESS-PHASE1-IDEA-ENGINE.md").read_text()
    absent_doc_markers = [marker for marker in PHASE1_DOC_MARKERS if marker not in phase1_doc]
    if absent_doc_markers:
        fail(f"phase1 idea-engine doc missing markers: {absent_doc_markers}")

    for rel in PHASE1_CONTRACT_FILES:
        text = (ROOT / rel).read_text()
        absent_keys = [key for key in PHASE1_CONTRACT_KEYS if f"{key}:" not in text]
        if absent_keys:
            fail(f"{rel} missing contract keys: {absent_keys}")
        for guard_marker in ["no cloud stealth", "no Opportunity Engine", "credentials"]:
            if guard_marker not in text:
                fail(f"{rel} missing guard marker {guard_marker!r}")

    pilot = ROOT / "evals/web-access/run-researcher-pilot.sh"
    if not pilot.stat().st_mode & 0o111:
        fail("run-researcher-pilot.sh is not executable")
    pilot_text = pilot.read_text()
    for marker in [
        "https://example.com",
        ".hermes/evidence/web-access/researcher-pilot",
        "source-inventory.json",
        "browser-screenshot.png",
        "crawl4ai-md.json",
    ]:
        if marker not in pilot_text:
            fail(f"run-researcher-pilot.sh missing marker {marker!r}")

    fanin = ROOT / ".hermes/recovery/web-access-empowerment-install-2026/phase1-fanin-report.md"
    if fanin.exists():
        fanin_text = fanin.read_text()
        for marker in ["Decision:", "Files changed", "Checks", "Evidence paths", "Remaining risk"]:
            if marker not in fanin_text:
                fail(f"phase1 fan-in report missing marker {marker!r}")

    phase2_doc = (ROOT / "docs/swarm/WEB-ACCESS-PHASE2-EXECUTION-WORKERS.md").read_text()
    phase2_doc_lower = phase2_doc.lower()
    absent_phase2_markers = []
    for marker in PHASE2_DOC_MARKERS:
        if marker.lower() not in phase2_doc_lower:
            absent_phase2_markers.append(marker)
    if absent_phase2_markers:
        fail(f"phase2 execution-workers doc missing markers: {absent_phase2_markers}")

    qa_builder = ROOT / "evals/web-access/run-qa-builder-smoke.sh"
    if not qa_builder.stat().st_mode & 0o111:
        fail("run-qa-builder-smoke.sh is not executable")
    qa_builder_text = qa_builder.read_text()
    absent_runner_markers = [marker for marker in PHASE2_RUNNER_MARKERS if marker not in qa_builder_text]
    if absent_runner_markers:
        fail(f"run-qa-builder-smoke.sh missing markers: {absent_runner_markers}")

    if "crawl4ai" not in qa_builder_text.lower():
        fail("run-qa-builder-smoke.sh must mention Crawl4AI posture")
    if "cloud stealth" not in qa_builder_text.lower():
        fail("run-qa-builder-smoke.sh must mention no cloud stealth posture")

    phase3_doc = (ROOT / "docs/swarm/WEB-ACCESS-GOVERNANCE-HYGIENE.md").read_text()
    phase3_doc_lower = phase3_doc.lower()
    absent_phase3_doc = [
        marker for marker in PHASE3_DOC_MARKERS
        if marker.lower() not in phase3_doc_lower
    ]
    if absent_phase3_doc:
        fail(f"phase3 governance doc missing markers: {absent_phase3_doc}")

    eval_suite = (ROOT / "evals/web-access/eval-suite.yaml").read_text()
    absent_lanes = [lane for lane in PHASE3_LANES if lane not in eval_suite]
    if absent_lanes:
        fail(f"eval-suite.yaml missing lanes: {absent_lanes}")
    for gated_lane in [
        "gated-antibot-matrix",
        "gated-auth-persistence",
        "gated-token-cost-baseline",
    ]:
        pattern = rf"(?ms)- id: {re.escape(gated_lane)}\n(?P<body>.*?)(?=\n  - id: |\Z)"
        m = re.search(pattern, eval_suite)
        if not m:
            fail(f"eval-suite.yaml missing gated lane block {gated_lane}")
        if "manual_gated" not in m.group("body"):
            fail(f"eval-suite.yaml gated lane {gated_lane} missing manual_gated")

    suite_runner = ROOT / "evals/web-access/run-web-access-suite.sh"
    if not suite_runner.stat().st_mode & 0o111:
        fail("run-web-access-suite.sh is not executable")
    suite_runner_text = suite_runner.read_text()
    for marker in [
        "run-phase0-smoke.sh",
        "run-researcher-pilot.sh",
        "run-qa-builder-smoke.sh",
        "validate-web-access-empowerment.py",
        "docker ps --filter name=crawl4ai",
        "latest-summary.md",
        "latest-summary.json",
        "gated_lanes_not_run",
    ]:
        if marker not in suite_runner_text:
            fail(f"run-web-access-suite.sh missing marker {marker!r}")
    forbidden_runner_markers = [
        "gated-antibot-matrix.sh",
        "gated-auth-persistence.sh",
        "cloud stealth --enable",
        "proxy escalation --enable",
    ]
    for marker in forbidden_runner_markers:
        if marker in suite_runner_text:
            fail(f"run-web-access-suite.sh contains forbidden runnable gated marker {marker!r}")

    if not shutil.which("agent-browser"):
        fail("agent-browser not on PATH")
    version = run(["agent-browser", "--version"])
    if "agent-browser" not in version:
        fail(f"unexpected agent-browser version output: {version!r}")

    if not shutil.which("docker"):
        fail("docker CLI not on PATH")
    ps = run(["docker", "ps", "--filter", "name=crawl4ai", "--format", "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"])
    if "crawl4ai" not in ps or "unclecode/crawl4ai:0.8.5" not in ps:
        fail(f"crawl4ai container not running as expected: {ps!r}")

    try:
        with urllib.request.urlopen("http://localhost:11235/health", timeout=10) as resp:
            health = json.loads(resp.read().decode())
    except Exception as exc:
        fail(f"crawl4ai health request failed: {exc}")
    if health.get("status") != "ok" or health.get("version") != "0.8.5":
        fail(f"bad crawl4ai health: {health}")

    print("PASS: web-access Phase 0 + Phase 1 + Phase 2 + Phase 3 integration validates")
    print(f"agent_browser_version={version.strip()}")
    print(f"crawl4ai_health={health}")


if __name__ == "__main__":
    main()
