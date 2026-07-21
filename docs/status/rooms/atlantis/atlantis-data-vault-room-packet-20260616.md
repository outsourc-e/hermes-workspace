# Atlantis Data Vault / Archive room packet — 2026-06-16

Status: local room-project packet only; not integrated into shared hot UI files.

## Purpose

Atlantis owns read-only source truth, retention status, and archive packet records. It receives packet references from Treasury and other rooms after review, but it does not mutate external systems or claim final/premium/product readiness by itself.

## Local artifacts

- Data module: `src/screens/war-room/v1/room-projects/atlantis/atlantis-room-project.ts`
- Public packet manifest: `public/war-room/v42-connected-ops/atlantis/project-packets.json`
- Source shell asset already available: `public/war-room/v42-connected-ops/rooms/room-atlantis-vault-shell.svg`
- Existing character assets already available under `public/war-room/atlantis-vault-archivist-v1/processed/`

## Packets

1. `atlantis-packet-source-truth-v1` — read-only source-truth pointers for task ids, artifact paths, and QA evidence.
2. `atlantis-packet-treasury-archive-v1` — archive record for reviewed Treasury approval/money-lock packets.
3. `atlantis-packet-evidence-checklist-v1` — checklist for source provenance, retention status, and no-overclaim review.

## Evidence checklist

- Each archive record must include source provenance.
- Archive state is read-only and local; no credentials or live API calls are loaded.
- Treasury approval and money-lock packets link back to Treasury packet ids.
- Retention status distinguishes draft, accepted, superseded, and blocked records.

## Agent motion

- `atlantis-agent-vault-archivist` records source truth and retention status as local evidence.
- `atlantis-agent-treasury-courier` carries packet references between Atlantis, Treasury, and approval seal corridors.

## Safety statement

Atlantis stores read-only local evidence only. External sync, shop/supplier/account writes, Discord actions, and paid generation remain blocked; `liveEnabled=false`, `externalMutation=false`, `credentialsLoaded=false`, and `liveApiCallsEnabled=false` remain hard locks.
