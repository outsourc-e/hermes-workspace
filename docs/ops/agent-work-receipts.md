# Agent Work Receipts + Daily Ops Review MVP

This MVP adds a Git-backed, local-only receipt/state layer for AI OS builder work. It intentionally does **not** write to Hermes profiles, Claude profiles, Paperclip, Linear, cron, gateway configs, external APIs, vector memory, or any dashboard UI.

## Receipt schema

Canonical TypeScript/Zod schema: `src/lib/ops/agent-work-receipts.ts`.

Each `AgentWorkReceipt` includes:

- `receipt_id`
- `schema_version: "agent-work-receipt/v1"`
- `issue_links` and `system_links`
- `venture` and `company`
- `builder` / `runtime` / optional model
- `repo` name, branch, path, optional commit
- `status`: `building | blocked | needs_tom | done | verified | stale`
- `classification`: `live | self_reported | stale | sample`
- timestamps: `started_at`, `updated_at`, optional `completed_at`
- `current_activity`
- `changed_files`
- `diff_summary`
- `verification_evidence`
- `blockers`
- `tom_needed`
- `next_action`
- `sample` flag

Sample receipts live in `scripts/ops/sample-receipts/*.json` and are synthetic only.

## Aggregator

Run from the repo root:

```bash
pnpm tsx scripts/ops/collect-agent-receipts.mjs
```

Optional arguments:

```bash
pnpm tsx scripts/ops/collect-agent-receipts.mjs <receipts-dir> <output-json>
```

Environment overrides:

- `AI_OS_RECEIPTS_DIR`: receipt directory when no first argument is passed.
- `AI_OS_GENERATED_AT`: fixed timestamp for deterministic runs. Defaults to `2026-07-04T12:00:00.000Z` in the CLI sample path.

Default output:

```text
tmp/ops/normalized-ops-state.sample.json
```

The normalized output schema is `normalized-ops-state/v1` and contains deterministic sections:

- `NOW`
- `NEEDS_TOM`
- `BUILDING`
- `WAITING_OR_BLOCKED`
- `CHANGED`
- `STALE_OR_UNVERIFIED`

## Daily Ops Review contract

The normalized JSON embeds `daily_ops_review_contract` with Tom-native categories:

- `NEEDS_TOM`
- `BUILDING`
- `BLOCKED`
- `STALE_OR_DRIFTING`
- `SHIP_READY`

Each top action includes a category, source `receipt_id`, recommended action, and evidence snippets. The contract avoids Jack/Dream branding and treats sample/self-reported/stale state as explicitly non-live.

## Builder writing guidance

After each agent/builder run, write one receipt JSON file to the configured receipts directory. Recommended filename:

```text
<updated-at-compact>-<issue-id-or-system>-<short-builder>.json
```

Minimum discipline:

1. Mark whether the receipt is `live`, `self_reported`, `stale`, or `sample`.
2. Include actual verification commands when available; leave empty only when unverified, which will place the work in `STALE_OR_UNVERIFIED`.
3. Set `tom_needed: true` only when owner input or credentials are truly required.
4. Never include secrets, raw tokens, cookies, credentials, private customer data, or external API responses that should not be committed.
5. Prefer repo-relative changed file paths unless an absolute path is necessary for operator context.

## Verification

```bash
pnpm vitest src/lib/ops/agent-work-receipts.test.ts --run
pnpm tsx scripts/ops/collect-agent-receipts.mjs scripts/ops/sample-receipts tmp/ops/normalized-ops-state.sample.json
```
