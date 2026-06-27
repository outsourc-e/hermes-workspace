# Wake Gates And Token Economics

Typ: Decision Rule
Tags: #wake-gate #token-economics #hermes-os

## Situation
Ein geplanter Hermes-Job koennte teuer werden, aber es ist unklar, ob es ueberhaupt neue Signale gibt.

## Entscheidung
Zuerst laeuft ein kostenloser no-agent Gate-Check. Das LLM soll nur breit arbeiten, wenn ein echtes Signal vorhanden ist.

## Gate-Signale
Wake breit, wenn:
- Codex-Inbox/Outbox blockiert.
- Chris neues Feedback gegeben hat.
- Proof-Ledger sich geaendert hat.
- Runtime-Fehler sichtbar sind.
- Ein Job eine neue klare Build-/Stop-/Review-Entscheidung erzeugt hat.

Compact/STOP, wenn:
- keine neue Datei,
- keine neue Rueckmeldung,
- keine Queue-Aenderung,
- gleiche Blocker wie gestern,
- letzte Reports schon REVIEW_ONLY/STOP waren.

## Anwendung In Hermes
No-agent Script:
`/Users/zondrius/.hermes/scripts/hermes_agent_director_gate.py`

Outputs:
- `/Users/zondrius/hermes-workspace/reports/agent-director/agent-director-gate-YYYY-MM-DD.md`
- `/Users/zondrius/hermes-workspace/reports/agent-director/agent-director-gate-YYYY-MM-DD.json`
- `/Users/zondrius/hermes-workspace/memory/ceo/agent-director-injection.md`

## Nicht tun
- Kein teures GPT-5.5 fuer reine Statusfragen.
- Kein breites Suchen nach alten Reports, wenn Gate STOP sagt.
- Kein Bauen, wenn Gate REVIEW_QUEUE_FIRST sagt.

## Reopen-Bedingung
Breites LLM-Denken ist wieder erlaubt, wenn frisches Feedback, neue Queue-Lage, neuer Proof oder ein klarer Codex-/Nayyal-/Schule-Slice existiert.
