#!/usr/bin/env python3
"""Verify Compose deploys the reviewed Workspace source candidate."""

from __future__ import annotations

from pathlib import Path
import re


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_PATH = REPOSITORY_ROOT / "docker-compose.yml"
DOCKERFILE_PATH = REPOSITORY_ROOT / "Dockerfile"
EXPECTED_IMAGE = "hermes-workspace:reviewed-candidate"


def compose_workspace_service() -> str:
    compose = COMPOSE_PATH.read_text(encoding="utf-8")
    service_match = re.search(
        r"(?ms)^  hermes-workspace:\n(?P<body>.*?)(?=^  [A-Za-z0-9_-]+:|^volumes:|\Z)",
        compose,
    )
    if service_match is None:
        raise AssertionError("docker-compose.yml has no hermes-workspace service")
    return service_match.group("body")


def main() -> None:
    service = compose_workspace_service()
    required = (
        f"image: {EXPECTED_IMAGE}",
        "pull_policy: build",
        "build:\n      context: .\n      dockerfile: Dockerfile",
        "SESSION_TOPOLOGY_ADAPTER_TOKEN:",
        "hermes-agent-data:/home/workspace/.hermes",
        "session-topology-private",
    )
    for contract in required:
        if contract not in service:
            raise AssertionError(f"workspace source candidate contract missing: {contract}")
    if re.search(r"(?m)^    image:\s*(?:ghcr\.io|docker\.io)/", service):
        raise AssertionError("workspace candidate unexpectedly uses a remote image")

    dockerfile = DOCKERFILE_PATH.read_text(encoding="utf-8")
    for build_step in ("COPY . .", "RUN pnpm build"):
        if build_step not in dockerfile:
            raise AssertionError(f"Dockerfile source build step missing: {build_step}")

    print(
        "verified workspace source candidate: "
        f"image={EXPECTED_IMAGE} context=. dockerfile=Dockerfile pull_policy=build"
    )


if __name__ == "__main__":
    main()
