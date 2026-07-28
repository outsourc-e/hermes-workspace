#!/usr/bin/env python3
"""Verify the immutable Workspace image selected for credential-bearing Compose use."""

from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_PATH = REPOSITORY_ROOT / "docker-compose.yml"
EXPECTED_IMAGE = (
    "ghcr.io/outsourc-e/hermes-workspace@"
    "sha256:bf0fd5e65c4ec45b7f772630946b60b1b4424b586eeba08ba3afa54da43990fa"
)
EXPECTED_DIGEST = "sha256:bf0fd5e65c4ec45b7f772630946b60b1b4424b586eeba08ba3afa54da43990fa"
EXPECTED_REVISION = "1da76ae97a46c7273c5d0835fc2b4777627bd5ec"


def run(*arguments: str, capture_output: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        arguments,
        check=True,
        text=True,
        capture_output=capture_output,
    )


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
    image_match = re.search(r"(?m)^    image:\s*(\S+)\s*$", service)
    if image_match is None:
        raise AssertionError("hermes-workspace service has no image")
    image = image_match.group(1)
    if image != EXPECTED_IMAGE:
        raise AssertionError(f"unexpected workspace image: {image}")

    # This service receives both the private adapter token and the shared agent
    # data mount, so CI must bind those capabilities to the reviewed image.
    if "SESSION_TOPOLOGY_ADAPTER_TOKEN:" not in service:
        raise AssertionError("workspace service no longer receives the adapter token")
    if "hermes-agent-data:/home/workspace/.hermes" not in service:
        raise AssertionError("workspace service no longer receives the agent data mount")

    run("docker", "pull", image)
    inspection = json.loads(
        run("docker", "image", "inspect", image, capture_output=True).stdout
    )[0]
    repo_digests = inspection.get("RepoDigests") or []
    if EXPECTED_IMAGE not in repo_digests:
        raise AssertionError(f"unexpected local image identities: {repo_digests}")
    labels = inspection.get("Config", {}).get("Labels") or {}
    if labels.get("org.opencontainers.image.revision") != EXPECTED_REVISION:
        raise AssertionError(f"unexpected workspace revision: {labels}")

    print(
        "verified workspace image: "
        f"revision={EXPECTED_REVISION} digest={EXPECTED_DIGEST}"
    )


if __name__ == "__main__":
    main()
