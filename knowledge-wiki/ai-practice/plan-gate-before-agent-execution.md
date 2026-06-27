# Plan-Gate vor Agenten-Ausführung

## Problem
Agenten und Coding-Tools arbeiten oft zu schnell los: sie lesen viel Kontext, ändern Dateien oder schlagen breite Umbauten vor, bevor Ziel, Risiko und Verifikation klar sind.

## Pattern
Vor der Ausführung eine kurze Plan-Gate-Runde erzwingen: nur lesen/planen, keine Änderungen. Der Plan muss klein, prüfbar und side-effect-frei sein. Erst danach wird Umsetzung freigegeben.

## Prompt
```text
Arbeite zuerst nur im Planmodus. Ziel: <Ziel>. Grenzen: keine sensiblen Daten, keine externen Aktionen, keine Commits/Pushes/Uploads, keine Installationen ohne Freigabe.
Liefere Kurzdiagnose, betroffene Dateien/Quellen, Risiko-Check, Mini-Plan mit maximal 3 Schritten, Akzeptanzkriterien, Verifikation und Stop-Bedingung. Erst nach Freigabe darfst du ändern oder ausführen.
```

## Chris use
- Codex-Handoffs kleiner und prüfbarer machen.
- Lernwerkstatt-/Nayyal-App-Aufgaben vor Umbauten absichern.
- Schule/VdS-Kontexte datensparsam halten.
- Hermes-Orchestrierung klarer trennen: Plan -> Freigabe -> Umsetzung -> Verifikation.

## Risk
Planmodus ist kein Erfolgstest. Nach Umsetzung braucht es echte Verifikation: Test, Build, Browsercheck, Quellencheck oder menschliche Freigabe. Bei Schüler-, Eltern- oder Verbandsdaten weiter anonymisieren und Safety-Modus nutzen.

## Source
- Anthropic Claude Code Common Workflows: Plan before editing, subagents, parallel sessions. https://code.claude.com/docs/en/common-workflows
- OpenAI Tools Guide: bewusst konfigurierte Tools wie Web Search, File Search, Function Calling, Remote MCP, Shell, Computer Use. https://developers.openai.com/api/docs/guides/tools
