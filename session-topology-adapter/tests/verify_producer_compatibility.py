#!/usr/bin/env python3
"""Verify the immutable Hermes producer image against the adapter contract."""

from __future__ import annotations

import ast
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import tomllib


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_PATH = REPOSITORY_ROOT / "docker-compose.yml"
EXPECTED_IMAGE = (
    "nousresearch/hermes-agent@"
    "sha256:606a3b445ed7b963d63b1d96283e97c43c350eebf4f69abfb7fdfc3e2d7b7f56"
)
EXPECTED_DIGEST = "sha256:606a3b445ed7b963d63b1d96283e97c43c350eebf4f69abfb7fdfc3e2d7b7f56"
EXPECTED_REVISION = "fa7b0fcf5d6e3576a59514ef1e281cd1e0872b8b"
EXPECTED_VERSION = "0.19.0"
EXPECTED_SCHEMA_VERSION = 23
REQUIRED_SESSION_COLUMNS = {
    "id",
    "source",
    "model_config",
    "parent_session_id",
    "started_at",
    "ended_at",
    "end_reason",
    "archived",
}


def run(*arguments: str, capture_output: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        arguments,
        check=True,
        text=True,
        capture_output=capture_output,
    )


def compose_image() -> str:
    compose = COMPOSE_PATH.read_text(encoding="utf-8")
    service_match = re.search(
        r"(?ms)^  hermes-agent:\n(?P<body>.*?)(?=^  [A-Za-z0-9_-]+:|\Z)",
        compose,
    )
    if service_match is None:
        raise AssertionError("docker-compose.yml has no hermes-agent service")
    image_match = re.search(r"(?m)^    image:\s*(\S+)\s*$", service_match.group("body"))
    if image_match is None:
        raise AssertionError("hermes-agent service has no image")
    return image_match.group(1)


def assigned_literal(source: str, name: str):
    tree = ast.parse(source)
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            if node.value is None:
                raise AssertionError(f"producer literal {name} has no value")
            return ast.literal_eval(node.value)
    raise AssertionError(f"producer source has no literal {name}")


def main() -> None:
    image = compose_image()
    if image != EXPECTED_IMAGE:
        raise AssertionError(f"unexpected producer image: {image}")

    run("docker", "pull", image)
    inspection = json.loads(
        run("docker", "image", "inspect", image, capture_output=True).stdout
    )[0]
    repo_digests = inspection.get("RepoDigests") or []
    if EXPECTED_IMAGE not in repo_digests:
        raise AssertionError(f"unexpected local image identities: {repo_digests}")
    labels = inspection.get("Config", {}).get("Labels") or {}
    if labels.get("org.opencontainers.image.revision") != EXPECTED_REVISION:
        raise AssertionError(f"unexpected producer revision: {labels}")

    container = run("docker", "create", image, capture_output=True).stdout.strip()
    try:
        with tempfile.TemporaryDirectory(prefix="producer-compatibility-") as directory:
            destination = Path(directory)
            state_source = destination / "hermes_state.py"
            project_file = destination / "pyproject.toml"
            run("docker", "cp", f"{container}:/opt/hermes/hermes_state.py", str(state_source))
            run("docker", "cp", f"{container}:/opt/hermes/pyproject.toml", str(project_file))

            source = state_source.read_text(encoding="utf-8")
            schema_version = assigned_literal(source, "SCHEMA_VERSION")
            schema_sql = assigned_literal(source, "SCHEMA_SQL")
            version = tomllib.loads(project_file.read_text(encoding="utf-8"))["project"][
                "version"
            ]

            if version != EXPECTED_VERSION:
                raise AssertionError(f"unexpected producer version: {version}")
            if schema_version != EXPECTED_SCHEMA_VERSION:
                raise AssertionError(
                    f"unsupported producer schema version: {schema_version}"
                )

            connection = sqlite3.connect(":memory:")
            try:
                connection.executescript(schema_sql)
                schema_columns = [
                    row[1]
                    for row in connection.execute(
                        'PRAGMA table_info("schema_version")'
                    ).fetchall()
                ]
                session_columns = {
                    row[1]
                    for row in connection.execute('PRAGMA table_info("sessions")').fetchall()
                }
            finally:
                connection.close()

            if schema_columns != ["version"]:
                raise AssertionError(
                    f"incompatible schema_version table: {schema_columns}"
                )
            missing = REQUIRED_SESSION_COLUMNS - session_columns
            if missing:
                raise AssertionError(f"producer sessions table is missing: {sorted(missing)}")
    finally:
        run("docker", "rm", "-f", container, capture_output=True)

    print(
        "compatible producer: "
        f"version={EXPECTED_VERSION} revision={EXPECTED_REVISION} "
        f"digest={EXPECTED_DIGEST} schema={EXPECTED_SCHEMA_VERSION}"
    )


if __name__ == "__main__":
    main()
