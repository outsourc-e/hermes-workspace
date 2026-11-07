# Runbook: product-intel

> Owner: A. Nahrgang · Model: `ternary-bonsai-2-27b:q2_0` @ `:8555` · Profile: `product-intel` · Runner: `ops/bin/run-product-intel.sh` · Launchd: `com.ops.agent-product-intel` 02:45 daily · Channel: `#product-intel` (+ `#approvals` draft on DEEP with candidates) · Battery: `ops/bin/test-product-intel.sh` (TP01–TP17) · Full guide: `docs/ops/product-intel-agent.md`

## What it does

Deep product/tech intel for AI-Protect/PrivacyScrubber. Maintains the knowledge base (`docs/ops/intel/knowledge-base/`: `targets.json` read-only, `taxonomy.yaml`, `own-products.md`, `vendors/*.md`, `comparison-matrix.md`, `candidates/`, `events/changelog.md`). LIGHT nightly = refresh + delta; DEEP every 3rd day (or `DEEP=1`) = broaden + rebuild matrix + `report-<DATE>.md` + Obsidian mirror.

## Inputs → outputs

Targets from `ops/config/product-intel-targets.txt` (Protecto/Straiker/Harmonic/Nightfall/TrueFoundry); mode from `ops/run/product-intel-state.json`.
LIGHT → `docs/ops/research/<DATE>-product-intel-delta.md`; DEEP → `docs/ops/research/<DATE>-product-intel.md` + `KB/report-<DATE>.md` + `candidates/<DATE>-candidates.md` + `events/changelog.md` + Obsidian `Product-Intel/`.

## Flags & exit codes

`FORCE=1` · `DRYRUN=1` · `DEEP=1` · `TIMEOUT_SECS` · `TARGETS_CFG/KB_DIR/RESEARCH_DIR/OBSIDIAN_DIR/STATE_DIR` overrides (tests).
`5` window · `8` lock · `9` timeout · `10` crash · `11` malformed · `3` config problems.

## Debug

```bash
cat ops/run/product-intel-state.json          # last_deep → next DEEP date
tail -n 20 ops/run/product-intel.log
FORCE=1 DRYRUN=1 bash ops/bin/run-product-intel.sh   # safe rehearsal
DEEP=1 FORCE=1 bash ops/bin/run-product-intel.sh     # force deep cycle
bash ops/bin/test-product-intel.sh            # TP01–TP17
bash ops/bin/intel-add-target.sh --help       # approve a candidate (owner)
```

## Known failures

| Symptom | Cause → fix |
|---|---|
| TP07-style schema violations | vendor frontmatter drifted from `taxonomy.yaml` — fix dims/cluster (never the taxonomy, without review) |
| `refused outside window` | daytime manual run without `FORCE=1` — expected |
