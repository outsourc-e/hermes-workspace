# Pull Request

## Beschreibung

### Was wird geändert?

<!-- Kurze Zusammenfassung der Änderungen (max. 2-3 Sätze) -->

### Warum?

<!-- Welches Problem wird gelöst? Welcher Bedarf wird adressiert? Gibt es ein verlinktes Issue? -->

### Wie?

<!-- Technische Zusammenfassung der Implementierung: Architektur, Patterns, wichtige Entscheidungen, Nebenwirkungen -->

Closes #<!-- Issue-Nummer(n), z. B. #123, #456 -->

---

## Art der Änderung

- [ ] Bugfix (rückwärtskompatible Fehlerbehebung)
- [ ] Feature (rückwärtskompatible neue Funktionalität)
- [ ] Breaking Change (inkompatible Änderung – **vorher mit Team absprechen**)
- [ ] Refactoring (keine Funktionsänderung)
- [ ] Hotfix (produktiver Bug – benötigt beschleunigtes Review)
- [ ] Dokumentation / CI / Tooling
- [ ] Sonstiges (bitte begründen):

---

## Checkliste

### Code-Qualität

- [ ] Code folgt den Projekt-Konventionen (Clean Code, sinnvolle Namen, kleine Funktionen)
- [ ] Keine `console.log` / `debugger` / `TODO`-Kommentare im produktiven Code
- [ ] TypeScript: `strict`-Modus eingehalten, keine `any`-Typen ohne Begründung
- [ ] `tsc --noEmit` zeigt keine neuen Fehler
- [ ] Keine neuen ESLint-Warnings oder -Errors (`pnpm lint`)
- [ ] Keine Zirkelimporte oder unnötigen Abhängigkeiten zwischen Modulen
- [ ] Error Boundaries / globale Fehlerbehandlung vorhanden (falls zutreffend)

### Performance

- [ ] Keine unnötigen Re-Renders (React.memo / useMemo / useCallback geprüft)
- [ ] Bundle-Größe nicht signifikant gestiegen (bei neuen Dependencies geprüft)
- [ ] Lazy Loading / Code Splitting genutzt, wo sinnvoll
- [ ] Keine render-blocking Ressourcen neu eingeführt

### Sicherheit

- [ ] Keine Secrets, API-Keys oder Credentials im Code (auch nicht in Kommentaren)
- [ ] Keine hartcodierten URLs/IPs in produktivem Code
- [ ] Eingabe-Validierung und Sanitization vorhanden (bei User-Input)
- [ ] CSRF / XSS / Injection-Risiken geprüft (bei sicherheitsrelevanten Änderungen)
- [ ] Berechtigungen / Auth-Checks für neue Endpunkte vorhanden

### Tests

- [ ] Existierende Tests laufen durch: `pnpm test`
- [ ] Neue Tests für geänderte/neue Funktionalität hinzugefügt
- [ ] Edge Cases und Fehlerfälle abgedeckt
- [ ] Tests sind unabhängig voneinander und stabil (keine Flakyness)
- [ ] Bei UI-Änderungen: visuelle Regressionstests (Screenshots) aktualisiert
- [ ] Testabdeckung für den geänderten Bereich ≥ 80 % (bei neuen Features)

### UI / UX (falls zutreffend)

- [ ] Responsive Design getestet (Desktop ≥ 1280px, Tablet ≥ 768px, Mobile ≥ 375px)
- [ ] Dark Mode kompatibel
- [ ] Barrierefreiheit beachtet (Tastaturnavigation, Screenreader, Kontraste ≥ 4.5:1)
- [ ] Lade- und Leerzustände behandelt (Loading, Empty, Error, Offline)
- [ ] i18n: alle neuen Texte in Übersetzungsdateien vorhanden
- [ ] Keine Layout Shifts / CLS-Verschlechterung

### Dependencies

- [ ] `pnpm-lock.yaml` / Lockfile aktualisiert und committed
- [ ] Keine unnötigen neuen Abhängigkeiten hinzugefügt
- [ ] Vue / React / Präferenz-Pakete auf konsistenter Version
- [ ] `pnpm audit` zeigt keine neuen kritischen Vulnerabilities
- [ ] Bei neuen Dependencies: Lizenz kompatibel (MIT, Apache 2.0, o. Ä.)

### Dokumentation

- [ ] CHANGELOG.md aktualisiert (unter "Unreleased")
- [ ] Bei neuen Features: README.md oder entsprechende Doku aktualisiert
- [ ] Bei API-Änderungen: Typen und Interfaces dokumentiert
- [ ] Bei Konfigurationsänderungen: `.env.example` aktualisiert
- [ ] Bei neuen Umgebungsvariablen: `.env.example` aktualisiert

### Migration / Datenbank (falls zutreffend)

- [ ] Migrationen rückwärtskompatibel (Downgrade-Pfad vorhanden)
- [ ] Keine Breaking Changes an existierenden DB-Schemas ohne Absprache
- [ ] Migration wurde lokal getestet (Up + Down)
- [ ] Daten-Migrationen auf Produktionsdatenvolumen getestet (bei großen Datasets)

---

## Testing Instructions

<!--
Schritte, die der Reviewer / QA ausführen soll, um die Änderungen zu validieren.
Nur ausfüllen, wenn mehr als `pnpm test` nötig ist.

Beispiele:
1. `pnpm dev` starten und unter http://localhost:5173/login navigieren
2. Mit Benutzer A (admin@example.com / admin123) anmelden
3. "Neues Projekt" anlegen und folgende Felder ausfüllen: [...]
4. Prüfen, dass die Erfolgsmeldung erscheint und das Projekt in der Liste sichtbar ist
5. Fehlerfall: leeres Formular absenden → Validierungsfehler erwarten
-->

1.
2.
3.

---

## Screenshots / Screen Recordings

<!-- Bei UI-Änderungen: Before/After-Gegenüberstellung oder kurzes Video. Drag & Drop hier möglich. -->

| Before | After |
|--------|-------|
|        |       |

---

## Revert-Plan (falls zutreffend)

<!--
Nur bei Hotfixes oder Breaking Changes ausfüllen.
Wie wird dieser Change rückgängig gemacht, falls er Probleme verursacht?
-->

- [ ] Revert per `git revert <commit>` möglich (keine weiteren Abhängigkeiten)
- [ ] Feature-Flag vorhanden, um die Änderung zu deaktivieren
- [ ] Daten-Migrationen haben einen getesteten Down-Pfad

---

## Zusätzliche Hinweise für den Reviewer

<!--
Was sollte besonders beachtet werden?
- Gibt es bekannte Einschränkungen?
- Risikoreiche Stellen?
- Abhängigkeiten zu anderen PRs / Branches?
- Performance-kritische Bereiche?
-->

---

## Merge-Instructions

<!--
Sofern abweichend vom Standard-Merge (Squash & Merge): Hier angeben.
Z. B. "Rebase & Merge" oder "Merge Commit" bei zusammenhängenden Feature-Branches.
-->

Standard: Squash & Merge

---

## Definition of Done

<!-- Wird vom Reviewer ausgefüllt – bitte nicht manuell entfernen -->

- [ ] Code-Review abgeschlossen
- [ ] Checkliste vollständig abgearbeitet
- [ ] Tests grün
- [ ] Keine offenen Diskussionen / Change Requests
- [ ] Revert-Plan vorhanden (falls erforderlich)

---

## Hermes Swarm Workflow

<!-- Automatisch ausgefüllt durch CI / Bot – bitte nicht manuell entfernen -->

/label ~"needs-review"
/assign @reviewer

### Workflow-Hinweise

1. **Reviewer** führt Code-Review durch und aktualisiert die Labels (`needs-changes` / `ready-to-merge`)
2. **QA** führt E2E-Tests durch (bei UI-Änderungen oder Hotfixes)
3. **Maintainer** merged nach erfolgreichem Review und grünen Tests
4. **Strategist** wird bei Breaking Changes oder architekturrelevanten Entscheidungen hinzugezogen

### Betroffene Worker (optional)

<!--
Für Review ergänzen, falls spezifisch nötig:
- @reviewer – Standard-Code-Review
- @qa – Qualitätssicherung / E2E-Tests
- @maintainer – Repository-Governance / Merge
- @strategist – Strategische / Architekturentscheidungen
-->