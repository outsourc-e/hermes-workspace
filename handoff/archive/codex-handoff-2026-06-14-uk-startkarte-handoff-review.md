# Archiviert: Codex Handoff

Status: automatisch abgeschlossen und archiviert am 2026-06-27
Ergebnis: `/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-13-uk-startkarte-handoff-review.md`

# Codex Handoff

## Ziel

Pruefe den offenen Codex-Handoff zur UK-Startkarte lokal gegen die vorhandenen Codex-Outbox-Ergebnisse und erstelle eine reine Review-Notiz. Ergebnis ist ein Statusvorschlag, keine Archivierung.

## Kontext

- Ausloeser: `/Users/zondrius/hermes-workspace/reports/mission-chain/mission-chain-2026-06-13.md`, Slice 1 / Codex Handoff Drafts.
- Aktuelle Lage laut Control Tower 2026-06-14: Es gibt 1 offenen Inbox-Handoff und keine neue passende Outbox-Rueckgabe vom 2026-06-14.
- Der offene Handoff ist: `/Users/zondrius/hermes-workspace/handoff/codex-inbox/codex-handoff-2026-06-07-uk-startkarte-fachfremde-kollegen.md`.
- Ziel ist Handoff-Hygiene: klaeren, ob ein passendes Codex-Ergebnis schon existiert oder ob der Handoff offen bleiben muss.
- Datenschutz-/Risikogrenze: nur lokale Dateien lesen und eine lokale Review-Notiz schreiben; keine personenbezogenen Daten, keine echten Schuelerdaten, keine externen Aktionen.

## Dateien

Zu lesen:
- `/Users/zondrius/hermes-workspace/handoff/codex-inbox/codex-handoff-2026-06-07-uk-startkarte-fachfremde-kollegen.md`
- `/Users/zondrius/hermes-workspace/handoff/codex-outbox/`
- `/Users/zondrius/hermes-workspace/reports/hermes-control/handoff-janitor-2026-06-13.md`
- `/Users/zondrius/hermes-workspace/reports/mission-chain/mission-chain-2026-06-13.md`
- optional zur Einordnung: `/Users/zondrius/hermes-workspace/handoff/HANDOFF_OVERVIEW.md`

Zu schreiben:
- `/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-13-uk-startkarte-handoff-review.md`

## Was Hermes schon gemacht hat

- Handoff-Queue geprueft: weniger als 3 offene Inbox-Handoffs.
- Bestehende offene Inbox erkannt: `codex-handoff-2026-06-07-uk-startkarte-fachfremde-kollegen.md`.
- Latest Control/Decision/Business/Nayyal/Mission-Reports gelesen.
- Business-Ideen 2026-06-14 ist `STOP`, kein Codex-Handoff.
- Nayyal 2026-06-14 ist `HUMAN_REVIEW_FIRST`, kein Codex-Handoff.
- Mission Chain 2026-06-13 enthaelt einen konkreten sicheren Slice-1-Draft fuer diese lokale Review.
- Keine Umsetzung, keine Archivierung und keine App-Code-Aenderung vorgenommen.

## Was Codex tun soll

1. Lies den offenen UK-Startkarten-Handoff.
2. Lies die vorhandenen Dateien in `/Users/zondrius/hermes-workspace/handoff/codex-outbox/` und pruefe Dateinamen, Auftragstitel und Inhalt auf ein passendes Ergebnis.
3. Erstelle nur die Review-Notiz unter:
   `/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-13-uk-startkarte-handoff-review.md`
4. Die Review-Notiz muss enthalten:
   - gepruefte Dateien,
   - passendes Ergebnis gefunden: `ja`, `nein` oder `unsicher`,
   - kurze Begruendung,
   - empfohlener Status: `offen`, `archiv-kandidat` oder `blockiert`,
   - ob Chris-Entscheid benoetigt wird,
   - verbleibende Risiken,
   - naechste kleinste Aktion.

## Akzeptanzkriterien

- Die Review-Notiz existiert am angegebenen Pfad.
- Sie nennt den offenen Handoff exakt.
- Sie nennt mindestens die Outbox-Dateien oder Suchlogik, die geprueft wurden.
- Sie begruendet eindeutig, ob ein passendes Ergebnis existiert.
- Sie verschiebt, archiviert, loescht oder veraendert keine Handoff-Dateien.
- Sie fuehrt keine externen Aktionen aus und verwendet keine personenbezogenen Daten.

## Risiken

- Aehnliche GE-/UK-Dateinamen koennen zu False Positives fuehren; bei Unsicherheit Status `offen` waehlen.
- Archivierung bleibt eine Chris-/Janitor-Entscheidung und darf nicht automatisch erfolgen.
- Die urspruengliche UK-Startkarten-Aufgabe darf nicht inhaltlich bearbeitet oder erweitert werden.

## Nicht tun

- Nicht archivieren, nicht loeschen, nicht verschieben.
- Keine App-Code-Aenderungen.
- Keine neuen Unterrichtsmaterialien erstellen.
- Keine externen Sends, Publikation, Deploys, Commits oder Pushes.
- Keine Installationen.
- Keine echten Schueler-, Eltern-, Diagnose-, Foto-, Familien- oder Schuldaten verwenden.
- Keine Fuenferfeld-/Fünferfeld-Linie reaktivieren.

## Rueckgabe erwartet

Codex soll den Ergebnisbericht schreiben nach:
`/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-13-uk-startkarte-handoff-review.md`

Der Bericht soll enthalten:
- was geprueft wurde,
- welche Dateien/Dateinamen abgeglichen wurden,
- ob ein passendes Ergebnis existiert,
- empfohlener Status,
- Risiken,
- was Hermes merken oder ignorieren soll,
- naechste kleinste Aktion.
