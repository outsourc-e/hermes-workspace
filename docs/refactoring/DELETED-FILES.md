# Deleted Files Manifest — Full Sweep Refactor

## Phase 0 (none)

## Phase 1 — secrets & hygiene (2026-10-18)

Untracked local files, deleted from disk (never in git):

- `.env.bak`, `.env.bak2`, `.env.pre-cos-fix-backup`, `.env.pre-m3-backup`, `.env.pre-phase1-20260825-122559` — stale env backups containing real secrets (TWENTY_API_KEY, HERMES_PASSWORD, LUSHA keys). **Owner action:** rotate any keys that were committed in git history (see commit `1026571c` — ANTHROPIC_API_KEY recoverable).
- `failed_linkedin_sync.csv` — 9,238 rows of scraped personal data (privacy risk, no project relevance).
- `failed_sync.csv` — duplicate-failure log from one-off sync script.
- Directory `"\t\t\t\t\t/"` (5 tabs) + directory named `` ` `` — shell-accident artifacts.

Removed from git index only (content still exists locally):

- `workspace-final-markdown-review.md` — QA checklist that was tracked while gitignored; now untracked.

## Phase 2 — root debris (2026-10-18)

Untracked one-off scripts, deleted from disk (never in git):

- `introspect.py`, `introspect_v2.py`, `introspect_types.py`, `introspect_person.py`, `verify_schema.py` — Twenty CRM GraphQL schema exploration family (superseded explorations).
- `sync_kritis_to_twenty.py` + `sync_kritis_optimized.py` — CSV→Twenty sync, `_optimized` variant superseded the base; both unused by repo tooling.
- `sync_linkedin_contacts_to_twenty.py` + `sync_linkedin_contacts_final.py` — LinkedIn→Twenty sync family; `_final` supersedes the base.
- `temp_fix.py` — broken one-off patch attempt (syntax error on line ~40), fully superseded.
- `run-server.js` — legacy production launcher importing a `dist/server/server.js` bundle that `pnpm build` never produces; root cause of the documented 2026-10-13 nightly outage (see `docs/ops/remediation-2026-10-13-nightly-outage.md`). Regression guards (`ops/tests/test-night-services.sh`, `ops/bin/test-ops-schedules.sh`) still name it deliberately — they assert installed plists do NOT reference it.
- `keep-alive.sh` — deprecated restart loop for run-server.js (self-documented DEPRECATED header).
- `sbom.cyclonedx.json`, `sbom-core.cyclonedx.json`, `sbom-extension.cyclonedx.json` — regenerable artifacts (`pnpm sbom`); also now gitignored.

Moved:

- `freerouter-for-hermes/` → `~/freerouter-for-hermes` — third-party nested git clone; kept outside this repo to avoid gitlink accidents.
- `linkedin_sync_postmortem.md` → `docs/ops/linkedin-sync-postmortem.md`.
