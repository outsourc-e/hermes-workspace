# Archiviert: Codex Handoff

Status: automatisch abgeschlossen und archiviert am 2026-06-25
Ergebnis: `/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-15-lernwerkstatt-startseite-entmischen.md`

# Codex Handoff

## Ziel

Verbessere ausschliesslich die Standard-Startseite der GE-Lernwerkstatt: Kinderstart und Lehrkraft-Dashboard sollen klar getrennt werden, damit der erste sichtbare Screen kindzentriert und Beta-3.0-naeher ist.

## Kontext

- Ausloeser: `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/reports/lernwerkstatt-quality-2026-06-15.md`.
- Dort ist `SOFORT_MACHEN`: `Startseite entmischen und Launcher-Klickpfade gezielt pruefen`.
- Der Build war im Review gruen, aber der Startbildschirm mischt Kinderlauncher und Lehrkraft-/Dashboardelemente.
- Die Launcher-Kachel `Mengen legen` reagierte im Browser-Klick nicht sichtbar; ueber die obere Navigation funktionierte der Pfad.
- Ziel ist ein kleiner lokaler App-Slice mit Browser-/Build-Pruefung, keine neue Spielentwicklung.
- Datenschutz: nur Dummy-/Pseudonym-Kontext, keine echten Schueler-, Eltern-, Diagnose-, Foto-, Familien- oder Schuldaten.

## Dateien

Zu lesen/pruefen:
- `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/reports/lernwerkstatt-quality-2026-06-15.md`
- `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/package.json`
- `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/src/main.jsx`
- `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/src/styles.css`

Arbeitsordner:
- `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/`

Rueckgabe schreiben nach:
- `/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-15-lernwerkstatt-startseite-entmischen.md`

## Was Hermes schon gemacht hat

- Handoff-Queue geprueft: 2 offene Inbox-Handoffs, also unter der Queue-Grenze von 3.
- Aehnliche offene Handoffs geprueft: die offenen UK-Startkarten-Handoffs betreffen Material-/Handoff-Hygiene, nicht diesen Lernwerkstatt-Startseiten-Slice.
- Latest Control/Decision/Business/Nayyal/Mission/Lernwerkstatt-Reports gelesen.
- Business-Ideen 2026-06-15 ist `STOP`, kein Handoff.
- Nayyal 2026-06-15 ist zwar `CODEX_HANDOFF_READY`, steht aber unter Chris-Entscheid zur lokalen Registry und wird nicht automatisch geroutet.
- Cron-Fehler `WOCHENPLAN_GE_SONNTAG` braucht Chris-Entscheidung, kein Handoff.
- Der Lernwerkstatt-Qualitaetsbericht liefert den klarsten sicheren lokalen `SOFORT_MACHEN`-Slice.

## Was Codex tun soll

1. Oeffne die GE-Lernwerkstatt lokal im Arbeitsordner.
2. Aendere nur den Standard-Start-/Home-Bereich so, dass der erste Screen ausschliesslich Kinderstart ist:
   - `Heute spielen wir`,
   - `Wer startet?` bzw. Farbprofile,
   - wenige grosse Spielkacheln,
   - ruhiger Zugang `Fuer Lehrkraefte` oder vorhandener Lehrkraft-Disclosure.
3. Entferne/verstecke im Kinderstart die Lehrkraft-Schnellbuttons und Dashboardkarten (`Neue Beobachtung`, `Auswertung`, `Kompetenzraster`, `Heute im Blick`, `App-Zentrale`, Verlaufselemente), ohne die Lehrkraftfunktionen zu loeschen.
4. Repariere gezielt die Launcher-Klickpfade, insbesondere `Mengen legen`, sodass jede Kinder-Startkachel ihren Zielpfad sichtbar oeffnet.
5. Keine neuen Spiele, Module, Symbolpakete, Assets oder Dependencies einfuehren.
6. Fuehre mindestens `npm run build` aus. Wenn ohne Install moeglich, starte eine lokale Preview oder `python3 -m http.server ... -d dist` und pruefe im Browser den Startpfad sowie die Kinderkacheln.
7. Schreibe den Ergebnisbericht in die oben genannte Outbox-Datei.

## Akzeptanzkriterien

- Der erste sichtbare Startscreen zeigt keine Lehrkraft-/Dashboardkarten, bis ein Lehrkraftzugang bewusst geoeffnet wird.
- Lehrkraftfunktionen bleiben erhalten und sind ueber einen ruhigen Zugang erreichbar; sie werden nicht geloescht.
- Jede Kinder-Startkachel oeffnet per Browserklick ihren Zielpfad; `Mengen legen` funktioniert ueber die Launcher-Kachel.
- Im Kinderbereich erscheinen keine 1-10-Skala, keine Noten, kein Ranking, kein Timer-/Druckelement und keine beschämende Fehlerlogik.
- `npm run build` laeuft erfolgreich oder ein vorhandener Build-Blocker wird im Ergebnisbericht konkret dokumentiert.
- Browser-/DOM-/Konsolenpruefung wird dokumentiert: gepruefter Pfad, angeklickte Kacheln, Ergebnis, Konsolenfehler ja/nein.
- Keine echten Schuelerdaten, keine externen Assets, keine Installs, keine Commits, keine Pushes, keine Deploys.

## Risiken

- Die Startseite darf nicht so stark reduziert werden, dass Lehrkraftfunktionen faktisch unauffindbar werden.
- Ein nur visuell verstecktes Dashboard kann weiterhin im ersten Screen auftauchen, wenn CSS/Responsive-Layout nicht sauber greift; deshalb Browserpruefung noetig.
- Frueheres Rolldown/macOS-Bindingproblem war heute nicht reproduziert, sollte aber bei Buildfehlern sauber dokumentiert werden.
- GE-/UK-Symbolik bleibt Platzhaltercharakter; keine validierten Symbolpakete integrieren.

## Nicht tun

- Keine neuen Lernspiele oder Module bauen.
- Keine Dependency-Installationen, keine Symbolpakete, keine externen Assets.
- Keine echten Schueler-, Eltern-, Diagnose-, Foto-, Familien- oder Schuldaten verwenden.
- Keine Fuenferfeld-/Fünferfeld-/five-frame-Linie reaktivieren.
- Keine Deploys, Commits, Pushes, Publikation oder externen Sends.
- Keine Cron-, Hermes-Config- oder Handoff-Archivierungsaktionen.
- Keine Lehrkraftfunktionen loeschen; nur aus dem Kinderstart entmischen/verlagern.

## Rueckgabe erwartet

Codex soll den Ergebnisbericht schreiben nach:
`/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-15-lernwerkstatt-startseite-entmischen.md`

Der Bericht soll enthalten:
- was geaendert wurde,
- Dateien geaendert,
- Checks/Build/Browserpfade mit Ergebnis,
- verbleibende Risiken,
- was Hermes merken oder ignorieren soll,
- naechste kleinste Aktion.
