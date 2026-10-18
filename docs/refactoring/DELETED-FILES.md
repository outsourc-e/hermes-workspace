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
