#!/usr/bin/env bash
# Daily backup of irreplaceable runtime state that is NOT in git:
#   - swarm runtime (.runtime/ — missions, kanban, board)
#   - Obsidian knowledge vault (~/workspace/vault)
#   - agent durable memory (~/.hermes/memory + per-profile memory/)
# Writes a timestamped tar.gz to ~/hermes-backups and prunes old ones.
#
# env: HERMES_BACKUP_DIR (default ~/hermes-backups)
#      HERMES_BACKUP_KEEP (default 14 — how many archives to retain)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${HERMES_BACKUP_DIR:-$HOME/hermes-backups}"
KEEP="${HERMES_BACKUP_KEEP:-14}"
VAULT="${HERMES_KNOWLEDGE_VAULT:-$HOME/workspace/vault}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
ARCHIVE="$BACKUP_DIR/hermes-backup-$STAMP.tar.gz"

# Collect existing sources only (skip missing without failing).
SOURCES=()
[ -d "$REPO_DIR/.runtime" ] && SOURCES+=("$REPO_DIR/.runtime")
[ -d "$VAULT" ] && SOURCES+=("$VAULT")
[ -d "$HOME/.hermes/memory" ] && SOURCES+=("$HOME/.hermes/memory")
# Per-profile durable memory (small markdown), not the multi-GB caches/sandboxes.
for d in "$HOME"/.hermes/profiles/*/memory; do
  [ -d "$d" ] && SOURCES+=("$d")
done

if [ "${#SOURCES[@]}" -eq 0 ]; then
  echo "nothing to back up" >&2
  exit 0
fi

# -P keeps absolute paths readable in the manifest; transform strips leading /
tar -czf "$ARCHIVE" "${SOURCES[@]}" 2>/dev/null || {
  echo "tar failed" >&2
  exit 1
}

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
echo "backup: $ARCHIVE ($SIZE, ${#SOURCES[@]} sources)"

# Prune: keep the newest $KEEP archives.
ls -1t "$BACKUP_DIR"/hermes-backup-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" && echo "pruned $old"
done
