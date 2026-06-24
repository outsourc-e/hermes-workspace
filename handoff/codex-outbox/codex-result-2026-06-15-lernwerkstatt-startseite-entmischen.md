# Codex Ergebnis - Lernwerkstatt Startseite entmischen

Datum: 2026-06-24

## Kurzfazit

Der Handoff wurde umgesetzt. Die Standard-Startseite der GE-Lernwerkstatt ist jetzt klarer getrennt: Der erste Screen bleibt Kinderstart, Lehrkraft-Navigation und Dashboardkarten sind erst nach bewusstem Oeffnen sichtbar. Der Launcher-Pfad `Mengen legen` wurde im Browser geprueft und zusaetzlich robuster gegen schnelle Doppel-Klicks gemacht.

## Umgesetzt

- Kinderstart bleibt zuerst sichtbar mit `Heute spielen wir`, Farbprofilen und grossen Spielkacheln.
- Lehrkraft-Schnellnavigation im Header bleibt erhalten, ist aber geschlossen und zeigt keine Buttons mehr, solange `Fuer Lehrkraefte` nicht geoeffnet wird.
- Dashboard-/Arbeitsuebersichtskarten wurden in einen separaten Lehrkraft-Drawer verschoben.
- Der fruehere direkte Lehrkraft-Schnellbuttonblock im Kinderlauncher wurde entfernt.
- Kinder-Launcher-Kacheln nutzen jetzt robuste Pointer-/Click-Behandlung.
- `Mengen legen` zaehlt schnelle Mehrfachklicks auf `Stein legen` korrekt ueber funktionale State-Updates.

## Dateien geaendert

- `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/src/main.jsx`
- `/Users/zondrius/hermes-workspace/projects/ge-lernwerkstatt/src/styles.css`
- `/Users/zondrius/hermes-workspace/handoff/codex-outbox/codex-result-2026-06-15-lernwerkstatt-startseite-entmischen.md`

## Build

Ausgefuehrt im Arbeitsordner:

`npm run build`

Ergebnis: erfolgreich.

- `dist/index.html`
- `dist/assets/index-Deekf2x_.css`
- `dist/assets/index-DfSHrCHL.js`

## Browser- und DOM-Pruefung

Geprueft ueber lokalen statischen Server:

`http://127.0.0.1:5187/?v=20260624c`

Ergebnis:

- Startscreen zeigt `Heute spielen wir`, `Wer startet?`, Farbprofile und Spielkacheln.
- Vor dem Oeffnen sind nicht sichtbar: `Neue Beobachtung`, `Kompetenzraster`, `Auswertung / Export`, `Heute im Blick`, `Zuletzt eingeschätzte Lernbereiche`, `Offene Transferprüfungen`, `App-Zentrale`.
- DOM/CSS bestaetigt: `.teacherNav` und `.teacherDashboardGrid` haben geschlossen `display: none` und Hoehe `0`.
- Nach bewusstem Oeffnen von `Fuer Lehrkraefte` erscheinen `Neue Beobachtung` und `Kompetenzraster`.
- Launcher-Kachel `Symbol-Garten` oeffnet den Symbol-Sortiergarten.
- Launcher-Kachel `Mehr, fertig, nochmal` oeffnet den UK-Spielraum.
- Launcher-Kachel `Alltags-Spiele` oeffnet den Schueler:innen-/Uebungsspielbereich.
- Launcher-Kachel `Mengen legen` oeffnet den Mengen-Spielraum.
- `Mengen legen`: zwei schnelle Klicks auf `Stein legen`, danach Antwort `2`, erzeugen korrekt `Passt. Die Menge ist gelegt.`
- Browser-Konsole: keine Fehler.

## Nicht geaendert

- Keine neuen Spiele oder Module.
- Keine neuen Dependencies.
- Keine externen Assets.
- Keine echten Schuelerdaten.
- Keine Deploys.
- Keine Hermes-Cron-/Config-Aenderungen.
- Keine Fuenferfeld-/S-Kiste-Linie reaktiviert.

## Verbleibende Risiken

- Eine schmale visuelle Viewport-Pruefung wurde nicht als eigener Screenshotlauf abgeschlossen; der Handoff verlangte Build-, Browser-, DOM- und Konsolenpruefung, die erledigt sind.
- In einzelnen Spielraeumen gibt es weiterhin Lehrkraft-Hinweise innerhalb des jeweiligen Spiels. Das wurde nicht geaendert, weil der Handoff nur den Standard-Start-/Home-Bereich entmischen sollte.

## Fuer Hermes

Erinnern:

- Dieser Handoff ist fachlich umgesetzt und kann nach Janitor-/Review-Regel als erledigt betrachtet werden.
- Bei Folgechecks nicht erneut dieselbe Startseiten-Entmischung als neuen Handoff erzeugen, solange keine neue echte UX-Rueckmeldung vorliegt.
- Wenn spaeter mobil geprueft wird, dann gezielt Startscreen + Kachelwege bei ca. 390 px testen.

Ignorieren:

- Kein neuer App-Ausbau aus diesem Handoff ableiten.
- Keine Produktisierung ohne echten Unterrichts-/Nutzungsproof.
- Keine weitere Entmischung in Spielraeumen starten, solange nicht konkret beauftragt.

## Naechste kleinste Aktion

Die Startseite einmal real oeffnen und nur pruefen: Findet ein Kind oder eine assistierende Person ohne Erklaerung zuerst die passende Spielkachel?
