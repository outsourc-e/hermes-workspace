# Pull Request

## Beschreibung

<!-- Kurze Beschreibung der Änderungen. Welches Problem wird gelöst? -->

Closes #<!-- Issue-Nummer -->

## Art der Änderung

- [ ] Bugfix (rückwärtskompatible Fehlerbehebung)
- [ ] Feature (rückwärtskompatible neue Funktionalität)
- [ ] Breaking Change (inkompatible Änderung)
- [ ] Refactoring (keine Funktionsänderung)
- [ ] Dokumentation / CI / Tooling

## Checkliste

### Code-Qualität

- [ ] Code folgt den Projekt-Konventionen (Clean Code, sinnvolle Namen, kleine Funktionen)
- [ ] Keine `console.log` / `debugger` / `TODO`-Kommentare im produktiven Code
- [ ] TypeScript: keine `any`-Typen ohne Begründung
- [ ] Keine neuen ESLint-Warnings oder -Errors

### Tests

- [ ] Existierende Tests laufen durch: `pnpm test`
- [ ] Neue Tests für geänderte/neue Funktionalität hinzugefügt
- [ ] Edge Cases und Fehlerfälle abgedeckt

### UI / UX (falls zutreffend)

- [ ] Responsive Design getestet (Desktop, Tablet, Mobile)
- [ ] Dark Mode kompatibel
- [ ] Barrierefreiheit beachtet (Tastaturnavigation, Screenreader)

### Dokumentation

- [ ] CHANGELOG.md aktualisiert (unter "Unreleased")
- [ ] Bei neuen Features: README.md oder entsprechende Doku aktualisiert
- [ ] Bei API-Änderungen: Typen und Interfaces dokumentiert

## Screenshots / Screen Recordings (optional)

<!-- Bei UI-Änderungen: Before/After-Screenshots oder Video -->

## Zusätzliche Hinweise

<!-- Was sollte der Reviewer besonders beachten? Gibt es bekannte Einschränkungen? -->

## Hermes Swarm Workflow

<!-- Automatisch ausgefüllt – bitte nicht entfernen -->

/label ~"needs-review"
/assign @reviewer