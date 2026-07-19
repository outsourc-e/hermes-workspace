#!/usr/bin/env python3
"""Thin JSON wrapper around claude skills search for the workspace API."""
import json
import sys
import os


def _agent_root() -> str:
    """Resolve the hermes-agent checkout that provides tools.skills_hub.

    Priority: HERMES_AGENT_ROOT env, $HERMES_HOME/hermes-agent, the standard
    ~/.hermes/hermes-agent install, then the legacy ~/hermes-agent location.
    """
    candidates = [os.environ.get("HERMES_AGENT_ROOT", "")]
    hermes_home = os.environ.get("HERMES_HOME", "").strip() or os.path.expanduser("~/.hermes")
    candidates.append(os.path.join(hermes_home, "hermes-agent"))
    candidates.append(os.path.expanduser("~/.hermes/hermes-agent"))
    candidates.append(os.path.expanduser("~/hermes-agent"))
    for root in candidates:
        if root and os.path.isfile(os.path.join(root, "tools", "skills_hub.py")):
            return root
    return os.path.expanduser("~/hermes-agent")


sys.path.insert(0, _agent_root())

from tools.skills_hub import GitHubAuth, create_source_router, unified_search


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    source_filter = sys.argv[3] if len(sys.argv) > 3 else "all"

    if not query:
        print(json.dumps({"results": [], "source": "idle"}))
        return

    auth = GitHubAuth()
    sources = create_source_router(auth)
    results = unified_search(query, sources, source_filter=source_filter, limit=limit)

    out = []
    for r in results:
        out.append({
            "id": getattr(r, "identifier", r.name),
            "name": r.name,
            "description": getattr(r, "description", ""),
            "author": getattr(r, "author", getattr(r, "source_label", "")),
            "category": getattr(r, "category", ""),
            "tags": getattr(r, "tags", []),
            "source": getattr(r, "source_label", ""),
            "trust": getattr(r, "trust_level", "community"),
            "installCommand": f"claude skills install {getattr(r, 'identifier', r.name)}",
            "installed": False,
        })

    print(json.dumps({"results": out, "source": "skills-hub", "total": len(out)}))


if __name__ == "__main__":
    main()
