# Codex Collaboration Memory

Stand: 2026-06-25

## Codex soll bekommen

- Kleine, lokal pruefbare Slices.
- Exakte Dateien und Akzeptanzkriterien.
- Klare Nicht-Tun-Regeln: keine Deploys, keine Installs, keine Secrets, keine echten Personendaten.
- Ein Handoff nur, wenn Queue-Guard und Duplikatregel bestanden sind.

## Hermes soll vorher klaeren

- Gibt es schon einen offenen Codex-Inbox-Handoff zum selben Thema?
- Gibt es bereits eine passende Outbox-Rueckgabe?
- Ist der Slice konkret genug fuer Build + Test?
- Braucht die Sache Chris-Entscheidung, Login, Public/Private-Grenze, Kauf, Deployment oder externe Aktion?

## Gute Codex-Aufgaben

- UI entmischen und Klickpfade testen.
- Lokale Prototypen mit Browser-/Build-Pruefung.
- Kleine Reparaturen an vorhandenen Jobs/Scripts.
- Outbox-Berichte schreiben, damit Hermes den Status spaeter sauber einsortieren kann.

## Schlechte Codex-Aufgaben

- Vage App-Ideen ohne Proof.
- Grosse Missionen ohne Slice 1.
- Mehrere Projekte in einem Handoff.
- Handoffs, die nur eine schon offene Aufgabe doppeln.

## Aktueller Merker

- `HERMES_CODEX_FACTORY_DAILY` bereitet Kandidaten vor.
- `CODEX_HANDOFF_SCOUT_DAILY` bleibt die einzige Stelle, die echte Codex-Inbox-Handoffs erzeugen darf.
- Codex-Outbox muss von Hermes/Janitor gelesen werden, bevor derselbe Task erneut vorgeschlagen wird.
- Beleg 2026-06-24: `codex-result-2026-06-15-lernwerkstatt-startseite-entmischen.md` existiert und meldet Build + Browser-/DOM-Pruefung erfolgreich; derselbe Startseiten-Entmischungs-Slice soll nicht erneut als Handoff erzeugt werden, sondern in Janitor/Review als erledigt bzw. archivfaehig geprueft werden.
- 2026-06-25: Factory-Status bleibt `REVIEW_QUEUE_FIRST`, solange 3 offene Inbox-Handoffs plus eine passende, noch nicht einsortierte Outbox existieren. Evidenz: `codex-factory-2026-06-25.md` empfiehlt nur `passt / anpassen / parken`, keinen neuen Brief.
