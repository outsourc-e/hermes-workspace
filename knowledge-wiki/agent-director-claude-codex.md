# Agent Director - Hermes, Claude, Codex

Typ: Workflow
Tags: #agent-director #claude #codex #hermes-os

## Zweck
Hermes soll Claude und Codex nicht parallel-chaotisch nutzen, sondern sauber orchestrieren.

## Rollen
Hermes:
- CEO, Triage, Memory, Stop-Regeln, Proof-Gates.
- Entscheidet, ob Claude, Codex oder niemand gebraucht wird.

Claude:
- Tiefes Denken, Konzept, Sprache, Kritik, Red-Team, grosse Synthese.
- Gut fuer: Nayyal-Strategie, Produktlogik, Unterrichtskonzepte, Investment-Bear-Case, Prompt-Architektur.

Codex:
- Lokale Umsetzung, Dateien, Code, Tests, Verifikation.
- Gut fuer: konkrete Slices, Repo-Arbeit, PDF/Artefakte, Skripte, UI-Checks, Handoff-Ergebnisse.

## Ablauf
1. no-agent Gate prueft, ob ueberhaupt etwas neu ist.
2. Meta-CEO waehlt genau einen Status: EXECUTE_ONE_THING, CODEX_READY, PROOF_REQUIRED, STOP_OR_PARK, REVIEW_QUEUE_FIRST.
3. Wenn Denken fehlt: Claude-Auftrag formulieren.
4. Wenn Umsetzung klar ist: Codex-ready `/goal` formulieren.
5. Wenn Proof fehlt: kein Build, sondern Proof-Zeile.
6. Wenn Queue blockiert: erst Handoff-Hygiene.

## Output-Formate
Claude-ready:
```text
Denke tief ueber <Thema>. Liefere: beste Strategie, Risiken, Gegenargumente, klare Empfehlung, Nicht-tun-Liste. Keine Umsetzung.
```

Codex-ready:
```text
/goal Setze <Slice> lokal um. Lies <Pfade>. Aendere <Pfade>. Akzeptanz: <Checks>. Nicht tun: kein Deploy, kein Push, keine Secrets, keine sensiblen Daten.
```

## Stop-Regel
Wenn Claude und Codex dieselbe Aufgabe bekommen wuerden, ist der Auftrag falsch. Hermes muss trennen:
- Claude denkt.
- Codex baut.
- Hermes entscheidet.

## Qualitaetscheck
- Gibt es genau einen Hauptauftrag?
- Ist klar, welcher Agent dran ist?
- Gibt es einen Outputpfad?
- Sind Nicht-tun-Regeln sichtbar?
- Wird keine offene Queue dupliziert?
