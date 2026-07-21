# Etsy Market Lab — Sheet Intake to Product Gallery Target

Updated: 2026-06-22 01:47:36 IDT +0300

## User target

DLV wants a controlled flow where he can provide either:

- a local sheet/file, such as CSV/XLSX/TSV/JSON; or
- a Google Sheet link, once Google auth or browser-session readback is available.

The system should ingest the rows, sort/rank products, create a markdown dossier for every product, display the products as a scrollable visual gallery with images and titles, let DLV choose a product, and then hand the chosen product to the next agent for ShotLab preparation.

## Desired flow

```text
Sheet / local file / link
→ Sheet Intake Agent
→ Product normalization + dedupe + scoring
→ one Markdown dossier per product
→ Product Gallery UI
→ DLV selects product
→ ProductScoutPacket / SelectedProductPacket
→ Odin / Etsy Market Lab
→ ShotLab prep agent
→ SEO / Draft preview / Approval
```

## Current reality

Already available:

- Official UI surface: `/war-room?etsyOps=1&bodyRuntime=1`.
- Existing local packet flow: `Scout → Odin → Selected Product → ShotLab → SEO → Draft → Approval`.
- `Scout V2` can already insert a typed `ProductScoutPacket` into Odin.
- Existing code has local Google Sheet placeholder/staging concepts in `etsy-pipeline.ts`, but not a real sheet intake pipeline.
- Existing Product Research screen has at least one static Google Sheet link pattern.

Not available yet:

- Google Sheets API is not authenticated: `NOT_AUTHENTICATED: No token at /Users/mac/.hermes/google_token.json`.
- No end-to-end `Sheet → ProductScoutPacket → Product Gallery → Odin` connector yet.
- No automatic markdown dossier writer for every sheet row/product yet.
- No dedicated scrollable product gallery inside Etsy Market Lab yet.
- No live ShotLab worker action from selected product yet.
- No room manager / supervisor agent watching for bad loops, weak products, missing evidence, or unsafe handoffs yet.

## Required UI

Add an Etsy Market Lab `Sheet Intake` workbench/station surface:

- input box for a local path or Google Sheet URL;
- import/read-only button;
- run summary: row count, rejected rows, duplicates, missing fields;
- product gallery cards with image, title, source, score, status, warnings;
- filters: `ready`, `missing image`, `needs source`, `weak evidence`, `duplicate`, `ShotLab ready`;
- product detail drawer with the markdown dossier preview;
- `Choose for ShotLab` button that creates the next packet.

## Required artifacts

For each product, write a markdown dossier under a run folder, for example:

```text
data/etsy-market-lab/sheet-intake/<runId>/products/<slug>.md
```

Each dossier should include:

```text
# Product name
Source row id
Source sheet/file/link
Image URLs / local image refs
Supplier/source URL if present
Title / proposed title
Variants/options
Price/cost/supplier notes if present
Metrics / demand signals if present
Missing fields
Risk flags
Recommended next step
ShotLab readiness
SEO readiness
Approval notes
```

## Agent roles

1. `Sheet Intake Agent`
   - reads local file or Google Sheet;
   - normalizes columns;
   - dedupes products;
   - creates raw product records.

2. `Product Sorter / Odin Scout`
   - scores and ranks products;
   - writes markdown dossiers;
   - sends candidates to Odin/gallery.

3. `QA Auditor`
   - checks each product for missing image, weak source, too many variants, category mismatch, duplicate, no supplier proof, or unsupported claims.

4. `Room Manager`
   - watches the whole flow;
   - stops loops;
   - rejects unsafe handoffs;
   - requires DLV approval before live ShotLab, paid generation, Etsy draft/upload, supplier messaging, or sheet writes.

5. `ShotLab Prep Agent`
   - after DLV selects one product, opens/prepares ShotLab only in the approved safe mode;
   - first milestone should be a local/preview handoff packet, not paid generation.

## Safety rules

- Initial implementation should be local-only/read-only.
- Google Sheet links should be read-only; no sheet writes unless DLV later approves.
- Local files can be read and normalized, but originals should not be modified.
- No live Etsy upload/publish/edit.
- No supplier messages or purchases.
- No paid ShotLab generation without an explicit phase gate.
- No browser automation except a later approved ShotLab/Google read-only phase.
- Every stage must return to `FROZEN / usageAllowed:false / workerSpawnAllowed:false` unless a very narrow controlled runner is executing.

## Recommended first implementation phase

Start with `Sheet Intake V1 — local file only`:

- support CSV/XLSX/TSV/local JSON path;
- create normalized product records;
- create markdown dossiers;
- add a product gallery in Etsy Market Lab;
- allow DLV to select one product;
- convert the selected product to a local `ProductScoutPacket` / `SelectedProductPacket`;
- stop before live ShotLab.

After V1 passes, add `Sheet Intake V2 — Google Sheet read-only` using either Google OAuth or browser-session readback.

After V2 passes, add `ShotLab Handoff V1` as a controlled next-agent packet only.
