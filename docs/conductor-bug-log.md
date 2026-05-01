# Conductor Bug Log

## 1. Portable Conductor jobs never executed

- Symptom: portable-mode missions were being created as scheduled Hermes jobs, but the jobs stayed in `scheduled` state and never ran.
- Fix: portable Conductor now uses the existing `/api/send-stream` session-streaming path instead of the dead jobs path.
- Validation: portable API smoke test returned `started`, `chunk`, and `done` SSE events, and the build passed.

## 2. Dashboard-backed mission was running but the UI showed `0 active`

- Symptom: the conductor page launched a dashboard-backed mission, but the activity panel stayed at `0 active` even while the dashboard showed live mission sessions.
- Fix: the conductor session filter now matches recent mission-related sessions by exact key and by mission text/summary, not just `worker-*` / `conductor-*` labels.
- Validation: after reloading the conductor page, the mission showed `1 active` and the worker card appeared.
