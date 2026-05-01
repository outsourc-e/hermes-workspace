#!/usr/bin/env python3
"""Thin JSON wrapper around claude skills search for the workspace API."""
import json
import sys
import os

sys.path.insert(0, os.path.expanduser("~/hermes-agent"))

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
