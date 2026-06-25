# Hermes CEO Memory System

Stand: 2026-06-24

Zweck:
Dieses Verzeichnis ist die kompakte Alltagsschicht zwischen vielen Hermes-Reports und Chris' naechstem echten Schritt. Es ersetzt nicht die Hermes-Hauptmemory und schaltet agentmemory nicht als Deep-Hook ein. Es sammelt nur stabile, sichere, belegte Muster.

## Die 5 S-Tier-Memory-Karten

1. `chris-life-memory.md`
   - Was Chris im Alltag wirklich entlastet.
   - Was morgens hilft.
   - Welche Formate zu viel oder zu plump sind.

2. `codex-collaboration-memory.md`
   - Wie Hermes Codex besser vorbereiten soll.
   - Welche Handoffs funktionieren.
   - Welche offenen Queue-/Scope-Regeln Codex schuetzen.

3. `project-lane-memory.md`
   - Welche Projektbahnen gerade wichtig sind.
   - Schule, Nayyal, Apps, Investment Research und Hermes-System.
   - Je Bahn genau: fuehren, warten, beweisen oder bauen.

4. `proof-outcome-memory.md`
   - Was real getestet wurde.
   - Was nur Report-Logik ist.
   - Welche V2s, Apps oder Handoffs erst nach Proof erlaubt sind.

5. `stoplist-memory.md`
   - Was Hermes nicht wiederholen soll.
   - Geparkte Muster, platte Aufgaben, Hype-Schleifen und doppelte Codex-Handoffs.

## Daily Injection

`morning-injection.md` ist die kurze Bruecke in den Morgen-CEO. Sie darf nur wenige Saetze enthalten:

- Heute fuehren:
- Heute parken:
- Codex-Hinweis:
- Proof-Hinweis:
- Nicht tun:

## Sicherheitsregeln

- Keine echten Schuelerdaten, Diagnosen, Fotos, Familieninfos oder personenbezogenen Rohdaten.
- Keine Broker-, Konto-, Steuer-, Login-, Token- oder Secret-Daten.
- Keine automatische Hauptmemory-Aenderung.
- Keine Commits, Pushes, Deploys, Installs oder externen Sends.
- Stable memory braucht Beleg: Proof, Feedback, wiederholter Reportbefund oder Codex-Outbox.

## Job

Der Job `HERMES_MEMORY_CEO_DAILY` soll taeglich vor dem Morgen-CEO laufen und diese Karten aktualisieren. Er darf nicht mehr als fuenf neue/veraenderte Memory-Punkte pro Lauf erzeugen.
