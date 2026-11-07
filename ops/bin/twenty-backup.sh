#!/usr/bin/env bash
# twenty-backup.sh — nightly consistent snapshot of Twenty prod DB. Keeps 7 days.
set -u
# launchd runs with a minimal PATH — ensure docker is found (Homebrew + Docker Desktop + colima).
export PATH="$HOME/.local/bin:$HOME/.hermes/hermes-agent/venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# Resolve docker binary explicitly (launchd PATH may not contain /opt/homebrew yet)
DOCKER_BIN=$(command -v docker 2>/dev/null || echo "/opt/homebrew/bin/docker")
if [ ! -x "$DOCKER_BIN" ] && [ -x "/usr/local/bin/docker" ]; then DOCKER_BIN="/usr/local/bin/docker"; fi
if [ ! -x "$DOCKER_BIN" ]; then echo "BACKUP SKIP docker not found (install Docker Desktop or colima)"; exit 2; fi
DEST="$HOME/hermes-workspace/ops/backups/twenty"
mkdir -p "$DEST"
F="twenty-prod-$(date +%Y%m%d-%H%M).dump"
# Retry 3× with 30s backoff (Docker Desktop cold start)
for i in 1 2 3; do
  if "$DOCKER_BIN" exec twenty-db-1 pg_dump -U postgres -d default -Fc -f "/tmp/$F" 2>/dev/null; then break; fi
  echo "BACKUP RETRY pg_dump attempt $i/3"
  sleep $((i*30))
  [ $i -eq 3 ] && { echo "BACKUP FAIL pg_dump after 3 retries"; exit 1; }
done
# verify restore-ability cheaply: list TOC entries (inside container — no host pg tools needed)
"$DOCKER_BIN" exec twenty-db-1 pg_restore --list "/tmp/$F" >/dev/null 2>&1 || { echo "BACKUP FAIL toc-check $F"; exit 2; }
"$DOCKER_BIN" cp "twenty-db-1:/tmp/$F" "$DEST/" && "$DOCKER_BIN" exec twenty-db-1 rm -f "/tmp/$F"
rm -f "$DEST/${F%.dump}.dump.tmp" 2>/dev/null
find "$DEST" -name "twenty-prod-*.dump" -mtime +7 -delete
echo "BACKUP OK $F ($(du -h "$DEST/$F" | cut -f1))"
