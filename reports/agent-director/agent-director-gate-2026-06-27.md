# Hermes Agent Director Gate - 2026-06-27

## Gate
- wake_agent: true
- recommended_status: CAPTURE_TO_TRIAGE
- recommended_focus: 11 capture file(s) changed in last 24h

## Signals
- codex_outbox_context: OUTBOX_CONTEXT_ONLY - codex outbox has 13 historical result(s), but inbox is clear (/Users/zondrius/hermes-workspace/handoff/codex-outbox)
- telegram_capture: CAPTURE_TO_TRIAGE - 11 capture file(s) changed in last 24h (/Users/zondrius/hermes-workspace/inbox/telegram-capture/unclear-candidates.md)
- runtime: COMPACT_RUNTIME_GUARD - 1 enabled job(s) have recent timeout/connection errors (/Users/zondrius/.hermes/profiles/neva/cron/jobs.json)

## Runtime Alerts
- NAYYAL_HUB_RADAR_DAILY: RuntimeError: [Errno 32] Broken pipe

## Rule For Meta-CEO
If wake_agent is false, write compact STOP_OR_PARK. If REVIEW_QUEUE_FIRST or runtime alerts exist, prefer cleanup/compact review over new builds.
