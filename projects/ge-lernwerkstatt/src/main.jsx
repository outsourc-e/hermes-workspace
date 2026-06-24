import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Clipboard, Download, Eye, FileText, PlusCircle, Printer, ShieldCheck, Trash2, Pencil, Upload, Search, Layers, TrendingUp } from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'ge-lernwerkstatt-beobachtungen-v3-kompetenzraster';
const STATIONS_KEY = 'ge-lernwerkstatt-eigene-stationen-v1';
const PRIVACY_HINT = 'Bitte prüfen: Dieser Text könnte sensible Daten enthalten. Für die App besser Kürzel/Farbe, konkrete Beobachtung, Kontext und Hilfeform nutzen.';

function today() { return new Date().toISOString().slice(0, 10); }
function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function loadJson(key, fallback) { try { const parsed = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; } }
function saveObservations(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
function loadObservations() { return loadJson(STORAGE_KEY, []); }
function loadCustomStations() { return loadJson(STATIONS_KEY, []); }
function saveCustomStations(list) { localStorage.setItem(STATIONS_KEY, JSON.stringify(list)); }

const scale = {
  1: 'zeigt die Kompetenz in dieser Situation noch nicht beobachtbar',
  2: 'reagiert kurz oder unspezifisch auf Angebot',
  3: 'zeigt erste Aufmerksamkeit oder Beteiligung mit viel Unterstützung',
  4: 'beteiligt sich mit klarer Struktur und direkter Hilfe',
  5: 'zeigt die Kompetenz in vertrauter Situation mit Unterstützung',
  6: 'zeigt die Kompetenz wiederholt mit geringer Hilfe',
  7: 'zeigt die Kompetenz in vertrauter Situation weitgehend selbstständig',
  8: 'überträgt die Kompetenz auf ähnliche Materialien oder Situationen',
  9: 'zeigt die Kompetenz flexibel in mehreren Situationen',
  10: 'nutzt die Kompetenz sicher, selbstständig und alltagsbezogen'
};

const competencyAreas = [
  { id: 'mathe', name: 'Mathematik / Pränumerik', competencies: ['Mengen wahrnehmen', 'mehr / weniger / gleich unterscheiden', 'zuordnen', 'sortieren', 'Teil-Ganzes erleben', 'Zahl- oder Mengenbegriffe nutzen', 'Alltagstransfer: decken, verteilen, einkaufen'], indicators: ['basal: Material wahrnehmen, Blickwendung, Berührung oder Ablehnung zeigen', 'unterstützt: mit Struktur zuordnen, vergleichen oder wiederholen', 'erweitert: Begriffe, Symbole oder Alltagssituationen übertragen'], questions: ['Welche Menge wird über Sehen, Fühlen oder Handeln bedeutsam?', 'Welche Hilfe macht Zuordnung oder Vergleich verständlich?', 'Gelingt die Handlung auch beim Verteilen oder Tischdecken?'] },
  { id: 'deutsch', name: 'Deutsch / Kommunikation', competencies: ['Blickkontakt / Aufmerksamkeit auf Kommunikationsangebot', 'Auswahl treffen', 'Wunsch ausdrücken', 'Bild / Symbol / Gegenstand verstehen', 'Gebärde, Talker oder Sprache nutzen', 'einfache Anweisung verstehen', 'Erzähl- oder Gesprächsanlass nutzen', 'Schrift / Bild / Symbol wiedererkennen'], indicators: ['basal: Reaktion auf Ansprache, Objekt oder Stimme', 'unterstützt: Auswahl mit Bild, Geste oder Modell', 'erweitert: Mitteilung in vertrauter und ähnlicher Situation nutzen'], questions: ['Welche Kommunikationsform ist aktuell am zugänglichsten?', 'Wird Kommunikation als echte Handlungshilfe genutzt?', 'Welche Wartezeit oder Modellierung hilft?'] },
  { id: 'sach', name: 'Sachunterricht / Weltverstehen', competencies: ['Alltagsgegenstände erkunden', 'Ursache-Wirkung erleben', 'Tiere, Pflanzen, Körper, Jahreszeiten, Umwelt unterscheiden', 'einfache Handlungsabläufe verstehen', 'Erfahrungen beschreiben oder zeigen', 'Alltagssituationen einordnen'], indicators: ['basal: Wirkung eines Gegenstands erleben', 'unterstützt: Ablauf mit Bildern, Gegenständen oder Vormachen nachvollziehen', 'erweitert: Erfahrung zeigen, benennen oder in neue Situation übertragen'], questions: ['Welche Erfahrung ist konkret beobachtbar?', 'Welche Materialien machen Ursache-Wirkung sichtbar?', 'Wo zeigt sich Alltagstransfer?'] },
  { id: 'wahrnehmung', name: 'Wahrnehmung', competencies: ['visuelle Reize wahrnehmen', 'auditive Reize wahrnehmen', 'taktile Reize tolerieren oder nutzen', 'vestibuläre / propriozeptive Reize verarbeiten', 'Reizüberflutung anzeigen', 'passende Reizangebote auswählen'], indicators: ['basal: Reiz bemerken, tolerieren oder ablehnen', 'unterstützt: Reizangebot mit klarer Dosierung nutzen', 'erweitert: passende Reize wählen oder Grenzen anzeigen'], questions: ['Welche Reizqualität unterstützt Beteiligung?', 'Wann wird es zu viel?', 'Wie zeigt das Kind Zustimmung, Grenze oder Bedarf nach Pause?'] },
  { id: 'motorik', name: 'Motorik', competencies: ['greifen', 'loslassen', 'zeigen', 'platzieren', 'sortieren', 'feinmotorisch handeln', 'grobmotorisch teilnehmen', 'Hilfsmittel oder Material angepasst nutzen'], indicators: ['basal: Bewegungsangebot wahrnehmen oder beginnen', 'unterstützt: Handlung mit Materialstruktur oder Assistenz ausführen', 'erweitert: Bewegung zielgerichtet und in Alltagssituation einsetzen'], questions: ['Welche Materialgröße erleichtert Handlung?', 'Welche Assistenz ist nötig und welche kann reduziert werden?', 'Ist die Aufgabe motorisch oder kognitiv begrenzt?'] },
  { id: 'leben', name: 'Lebenspraxis', competencies: ['anziehen / ausziehen', 'essen / trinken', 'Tisch decken', 'aufräumen', 'Material holen / bringen', 'Hygieneabläufe', 'Orientierung im Raum', 'einfache Dienste übernehmen'], indicators: ['basal: Teilhandlung erleben oder mitmachen', 'unterstützt: vertraute Handlung mit Struktur und Hilfe ausführen', 'erweitert: Dienst oder Ablauf selbstständiger und alltagsbezogen nutzen'], questions: ['Welche Teilhandlung ist schon sicher?', 'Welche visuelle oder materielle Struktur hilft?', 'Kann die Handlung mit reduzierter Hilfe erneut gelingen?'] },
  { id: 'sozial', name: 'Sozial-emotionale Entwicklung', competencies: ['Kontakt aufnehmen', 'Nähe / Distanz regulieren', 'warten', 'Hilfe annehmen', 'Frustration zeigen oder regulieren', 'Übergänge bewältigen', 'Wahl treffen', 'gemeinsam handeln'], indicators: ['basal: Kontakt, Grenze oder Belastung zeigen', 'unterstützt: mit klarer Struktur warten, wählen oder Hilfe annehmen', 'erweitert: Regulation oder gemeinsames Handeln in mehreren Situationen zeigen'], questions: ['Welche Struktur macht Übergänge vorhersehbar?', 'Wie wird Hilfe angeboten, ohne zu überfordern?', 'Welche Co-Regulation wirkt?'] },
  { id: 'uk', name: 'Unterstützte Kommunikation', competencies: ['Objektwahl', 'Bildkarte nutzen', 'Symbol verstehen', 'Ja/Nein anzeigen', 'Talker-Wort nutzen', 'Kommunikationsanlass erkennen', 'Kommunikationsmittel aktiv einsetzen'], indicators: ['basal: Objekt, Blick oder Körperreaktion als Mitteilung nutzen', 'unterstützt: Symbol, Bildkarte oder Talker mit Modellierung verwenden', 'erweitert: Kommunikationsmittel aktiv in Alltagssituation einsetzen'], questions: ['Ist der Kommunikationsanlass echt und bedeutsam?', 'Welche Wörter/Symbole werden modelliert?', 'Wird das Mittel aktiv oder nur nach Aufforderung genutzt?'] },
  { id: 'arbeit', name: 'Arbeitsverhalten / Lernhaltung', competencies: ['Aufgabe beginnen', 'bei einer Tätigkeit bleiben', 'Material passend nutzen', 'Wartezeit aushalten', 'Hilfe einfordern oder annehmen', 'Arbeitsplatz strukturieren', 'Aufgabe beenden', 'Rückmeldung nutzen'], indicators: ['basal: Angebot wahrnehmen, Nähe zum Material tolerieren oder kurze Beteiligung zeigen', 'unterstützt: mit Ritual, Timer, Bildplan oder Materialstruktur beginnen und dabeibleiben', 'erweitert: Aufgabe mit vereinbarter Hilfe planen, durchführen und beenden'], questions: ['Welche Startstruktur erleichtert Beteiligung?', 'Welche Dauer ist realistisch und beobachtbar?', 'Welche Rückmeldung unterstützt den nächsten Versuch?'] },
  { id: 'orientierung', name: 'Selbstständigkeit / Orientierung im Schulalltag', competencies: ['Tagesstruktur wiedererkennen', 'Wege im Schulhaus bewältigen', 'Material finden oder wegräumen', 'Übergänge mitgestalten', 'eigene Bedürfnisse anzeigen', 'Hilfe holen', 'Routinen wiederholen', 'kleine Dienste übernehmen'], indicators: ['basal: Übergang, Ort oder Routine wahrnehmen und Reaktion zeigen', 'unterstützt: mit Bild, Gegenstand, Begleitung oder Handlungsplan eine Routine ausführen', 'erweitert: vertraute Abläufe zunehmend selbstständiger und situationsangemessen nutzen'], questions: ['Welche Orientierungshilfe ist wirklich wirksam?', 'Wo kann Assistenz reduziert werden?', 'Welche Routine lässt sich in den Alltag übertragen?'] }
];

const helpLevels = ['ohne Hilfe', 'mit verbaler Hilfe', 'mit Geste / Zeigen', 'mit Symbol / Talker / Bild', 'mit Vormachen', 'mit Materialstruktur', 'mit körpernaher Assistenz'];
const confidenceLevels = ['sehr unsicher', 'eher unsicher', 'ausreichend beobachtet', 'mehrfach beobachtet'];
const transferLevels = ['nur in dieser Situation', 'mit gleichem Material', 'mit ähnlichem Material', 'in Alltagssituation', 'noch nicht geprüft'];
const kuerzelOptions = ['Lila', 'Gelb', 'Orange', 'Gruen', 'Blau'];
const betaProfiles = [
  { id: 'Lila', label: 'Lila', className: 'profileLila' },
  { id: 'Gelb', label: 'Gelb', className: 'profileGelb' },
  { id: 'Orange', label: 'Orange', className: 'profileOrange' },
  { id: 'Gruen', label: 'Grün', className: 'profileGruen' },
  { id: 'Blau', label: 'Blau', className: 'profileBlau' }
];
const betaPlayTiles = [
  { id: 'symbol-sortiergarten', title: 'Symbol-Garten', icon: '🌿', area: 'Wahrnehmen', hint: 'Karten antippen und in den passenden Garten legen.' },
  { id: 'uk-mehr-fertig-nochmal', title: 'Mehr, fertig, nochmal', icon: '🃏', area: 'UK', hint: 'Drei Karten wählen: weiter, abschließen oder neu starten.' },
  { id: 'mengen-bis-5', title: 'Mengen legen', icon: '🔢', area: 'Mathe', hint: 'Steine legen, Menge wählen, in Ruhe prüfen.' },
  { id: 'student-beta', title: 'Alltags-Spiele', icon: '🎮', area: 'Für alle', hint: 'Wählen, handeln, Hilfe nehmen, fertig werden.' }
];

const baseStations = [
  { id: 'mengen-erleben', title: 'Mengen erleben – Füllen, leeren, vergleichen', pilot: 'Mengen erleben', ziel: 'Menge als sinnliche Erfahrung: leer/voll, viel/wenig, mehr/weniger.', material: 'Becher, Schalen, Löffel, Pompons/Duplo, Tablett, Symbole: mehr, fertig, leer, voll.', einstieg: 'Ein Material und zwei Gefäße ruhig anbieten. Eine kurze Handlung vormachen und Wartezeit geben.', durchfuehrung: 'Füllen, Leeren, Stoppen und Wiederholen ermöglichen. Begriffe nur begleitend nutzen.', basal: 'Material wahrnehmen, berühren, hören, Blickwendung/Greifen/Wegschieben beachten.', unterstuetzt: 'Gezielt füllen oder leeren, mit Geste/Symbol zwischen „mehr“ und „fertig“ wählen.', erweitert: 'Zwei Mengen vergleichen, mehr/weniger/gleich nutzen, Mengen ausgleichen.', hilfen: ['Wartezeit', 'Materialreduktion', 'Vormachen', 'Geste / Zeigen', 'Talker'], beobachtungsfragen: ['Welche Wahrnehmung macht Beteiligung möglich?', 'Welche Hilfe ermöglicht Start, Wiederholung oder Stopp?'], impuls: 'Füll- und Leer-Situationen mit „mehr“ und „fertig“ wiederholen und Alltagssituationen nutzen.', foerderplanung: 'nutzt eine sinnlich erfahrbare Mengensituation, um Beteiligung, Auswahl oder Wiederholung zu zeigen.' },
  { id: 'eins-zu-eins', title: 'Eins-zu-eins-Zuordnung – Tisch decken oder Material verteilen', pilot: 'zuordnen', ziel: 'Jede Person / jeder Platz bekommt einen Gegenstand.', material: 'Platzsets/Fotos, Teller, Becher, Löffel, Bildkarten: fehlt, noch einer, fertig.', einstieg: 'Zwei Plätze vorbereiten. Ein Gegenstand wird sichtbar einem Platz zugeordnet.', durchfuehrung: 'Gegenstände nacheinander anbieten, Zuordnen ermöglichen und Fehlendes sichtbar machen.', basal: 'Geben, Nehmen und Platzieren in sinnvoller Alltagssituation erleben.', unterstuetzt: 'Mit Platzset, Umriss, Modell oder Zeigegeste jedem Platz einen Gegenstand zuordnen.', erweitert: 'Passende Anzahl holen, Gleichheit prüfen, Fehler entdecken, Symbol/Talker „fehlt“ nutzen.', hilfen: ['Vormachen', 'Geste / Zeigen', 'Handlungsplan', 'Symbolkarte', 'Materialreduktion'], beobachtungsfragen: ['Wird „ein Platz – ein Gegenstand“ sichtbar?', 'Welche Unterstützung macht Fehlendes verständlich?'], impuls: 'In echten Diensten „jeder eins“ üben und Fehlendes sichtbar machen.', foerderplanung: 'ordnet in einer alltagsnahen Situation Gegenstände zu Plätzen oder Personen und erlebt „jeder eins“.' },
  { id: 'sortieren-teil-ganzes', title: 'Sortieren und Teil-Ganzes – Snack-Teller, Bausteine oder Alltagsmaterial', pilot: 'Teil-Ganzes', ziel: 'Gleich/anders erleben, Gruppen bilden, Teile zu einem Ganzen zusammenstellen.', material: 'Sortierschalen, Snack- oder Spielmaterial, Bildkarten, Teller mit Markierung, optional Rezeptkarte.', einstieg: 'Zwei verschiedene Materialien anbieten und eine Zielstruktur sichtbar machen.', durchfuehrung: 'Sortieren modellieren, Teile zu einem Ganzen zusammenstellen, Abschluss begleiten.', basal: 'Unterschiede sinnlich erleben, wählen, ablehnen, nehmen oder legen.', unterstuetzt: 'Nach einem Merkmal mit echtem Beispiel oder Bildvorlage sortieren.', erweitert: 'Rezeptkarte nutzen, Fehlendes erkennen, „fertig/fehlt/noch“ kommunizieren.', hilfen: ['Wartezeit', 'Auswahlfeld', 'Symbolkarte', 'Talker', 'Handlungsplan'], beobachtungsfragen: ['Gelingt Sortieren über reale Gegenstände besser als über Bilder?', 'Kann eine Vorlage genutzt werden?'], impuls: 'Alltagssortieren in Snack-, Koch-, Kunst- oder Aufräumsituationen nutzen.', foerderplanung: 'nutzt reale Materialien, um Gleiches/Anderes zu unterscheiden oder Teile zu einem Ganzen zusammenzustellen.' }
];

const EMPTY_FORM = { datum: today(), kuerzel: 'Lila', lerngruppe: 'Pilotgruppe', stationId: 'mengen-erleben', situation: 'Lernwerkstattstation', setting: 'Einzelsetting', lernbereich: 'mathe', kompetenz: 'Mengen wahrnehmen', einschaetzung: 5, sicherheit: 'ausreichend beobachtet', hilfegrad: 'mit Materialstruktur', transfer: 'noch nicht geprüft', konkret: '', gelingt: '', hilfe: [], kommunikation: [], barriere: [], lernschritt: '' };
const examples = { observations: [
  { ...EMPTY_FORM, id: 'bsp-mathe', kuerzel: 'Lila', lernbereich: 'mathe', kompetenz: 'Mengen wahrnehmen', einschaetzung: 3, sicherheit: 'eher unsicher', hilfegrad: 'mit Materialstruktur', transfer: 'nur in dieser Situation', konkret: 'wendet den Blick zum Becher, greift nach Füllmaterial und wiederholt die Schüttelbewegung', gelingt: 'zeigt Interesse; wiederholt Handlung', hilfe: ['Wartezeit', 'Materialreduktion'], kommunikation: ['Blick'], barriere: ['zu viele Reize'], lernschritt: 'Füllen/Leeren mit zwei klaren Begriffen „mehr“ und „fertig“ wiederholen.' },
  { ...EMPTY_FORM, id: 'bsp-deutsch', kuerzel: 'Gelb', lernbereich: 'deutsch', kompetenz: 'Auswahl treffen', einschaetzung: 6, sicherheit: 'ausreichend beobachtet', hilfegrad: 'mit Symbol / Talker / Bild', transfer: 'mit gleichem Material', konkret: 'wählt zwischen zwei Bildkarten wiederholt das gewünschte Material aus', gelingt: 'trifft Auswahl', hilfe: ['Symbolkarte', 'Wartezeit'], kommunikation: ['Bildkarte'], lernschritt: 'Auswahl mit ähnlichem Material erneut anbieten und Wartezeit beibehalten.' },
  { ...EMPTY_FORM, id: 'bsp-wahrnehmung', kuerzel: 'Orange', lernbereich: 'wahrnehmung', kompetenz: 'taktile Reize tolerieren oder nutzen', einschaetzung: 4, sicherheit: 'ausreichend beobachtet', hilfegrad: 'mit Vormachen', transfer: 'nur in dieser Situation', konkret: 'berührt das strukturierte Material nach Vormachen kurz und zieht sich bei zu viel Material zurück', gelingt: 'toleriert kurzen Kontakt', hilfe: ['Vormachen', 'Materialreduktion'], barriere: ['zu viele Reize'], lernschritt: 'Materialmenge reduzieren und Wahl zwischen zwei taktilen Angeboten ermöglichen.' },
  { ...EMPTY_FORM, id: 'bsp-leben', kuerzel: 'Gruen', lernbereich: 'leben', kompetenz: 'Tisch decken', einschaetzung: 5, sicherheit: 'mehrfach beobachtet', hilfegrad: 'mit Geste / Zeigen', transfer: 'in Alltagssituation', stationId: 'eins-zu-eins', konkret: 'legt nach Zeigegeste je einen Becher auf zwei markierte Platzsets', gelingt: 'ordnet zu', hilfe: ['Geste / Zeigen', 'Vormachen'], lernschritt: 'gleiche Handlung mit reduzierter Zeigegeste und einem weiteren Platz wiederholen.' },
  { ...EMPTY_FORM, id: 'bsp-uk', kuerzel: 'Blau', lernbereich: 'uk', kompetenz: 'Talker-Wort nutzen', einschaetzung: 7, sicherheit: 'mehrfach beobachtet', hilfegrad: 'mit verbaler Hilfe', transfer: 'mit ähnlichem Material', konkret: 'nutzt nach kurzer Wartezeit das Talker-Wort „mehr“, um weiteres Material anzufordern', gelingt: 'kommuniziert Wunsch', hilfe: ['Talker', 'Wartezeit'], kommunikation: ['Talker'], lernschritt: 'Talker-Wort in einer Alltagssituation wie Snack oder Materialdienst anbieten.' },
  { ...EMPTY_FORM, id: 'bsp-arbeit', kuerzel: 'Lila', lernbereich: 'arbeit', kompetenz: 'Aufgabe beginnen', einschaetzung: 5, sicherheit: 'ausreichend beobachtet', hilfegrad: 'mit Materialstruktur', transfer: 'mit gleichem Material', konkret: 'beginnt nach visuellem Startsignal und bereitgelegtem Material mit der bekannten Sortieraufgabe', gelingt: 'beginnt Aufgabe mit Struktur', hilfe: ['Handlungsplan', 'Materialreduktion'], kommunikation: ['Blick', 'Zeigen'], lernschritt: 'gleiches Startsignal in einer zweiten Station prüfen und Wartezeit dokumentieren.' },
  { ...EMPTY_FORM, id: 'bsp-orientierung', kuerzel: 'Gelb', lernbereich: 'orientierung', kompetenz: 'Material finden oder wegräumen', einschaetzung: 6, sicherheit: 'ausreichend beobachtet', hilfegrad: 'mit Symbol / Talker / Bild', transfer: 'in Alltagssituation', konkret: 'legt die Bildkarte zum Materialfach und räumt zwei bekannte Materialien nach kurzer Zeigegeste zurück', gelingt: 'nutzt Routine im Schulalltag', hilfe: ['Symbolkarte', 'Geste / Zeigen'], kommunikation: ['Bildkarte'], lernschritt: 'Rückräum-Routine mit einem zusätzlichen Material und reduzierter Zeigegeste wiederholen.' }
] };

const options = { situation: ['Lernwerkstattstation', 'Alltagssituation', 'Einzelbeobachtung', 'Kleingruppe', 'freie Beobachtung'], setting: ['Einzelsetting', 'Partnerarbeit', 'Kleingruppe', 'Alltag'], gelingt: ['zeigt Interesse', 'beteiligt sich kurz', 'wiederholt Handlung', 'erkennt Unterschied', 'ordnet zu', 'wartet ab', 'nutzt Material zielgerichtet', 'zeigt Auswahl', 'kommuniziert Wunsch', 'beendet Handlung selbstständig'], hilfe: ['Wartezeit', 'Vormachen', 'Geste / Zeigen', 'Symbolkarte', 'Talker', 'Ja/Nein-Karte', 'Auswahlfeld', 'Handlungsplan', 'Materialreduktion', 'gemeinsame Handlung'], kommunikation: ['Blick', 'Mimik', 'Körperbewegung', 'Zeigen', 'Gebärde', 'Lautieren', 'Sprache', 'Symbol', 'Bildkarte', 'Talker', 'Gegenstand'], barriere: ['Material zu komplex', 'zu viele Reize', 'unklare Aufgabe', 'motorische Hürde', 'Wahrnehmungshürde', 'Kommunikationshürde', 'fehlende Wartezeit', 'Tagesform / Regulation', 'soziale Situation', 'noch unklar'] };
function areaById(id) { return competencyAreas.find(a => a.id === id) || competencyAreas[0]; }
function stationFor(obs, allStations = baseStations) { return allStations.find(s => s.id === obs?.stationId) || allStations[0]; }
function scaleMeaning(value) { return scale[Number(value)] || scale[5]; }
function nextScaleStep(value) { const n = Math.min(10, Number(value || 1) + 1); return `${n}/10: ${scaleMeaning(n)}`; }
function nextQuestion(obs) { const area = areaById(obs.lernbereich); if (obs.transfer === 'noch nicht geprüft') return 'Gelingt die Kompetenz mit gleichem oder ähnlichem Material erneut?'; if ((obs.sicherheit || '').includes('unsicher')) return 'Welche weitere Beobachtung unter ruhigen, vergleichbaren Bedingungen ist nötig?'; return area.questions[0]; }
function suggestStep(obs, station = stationFor(obs)) { if (obs.lernschritt) return obs.lernschritt; if (obs.transfer === 'noch nicht geprüft') return 'die gleiche Handlung erneut beobachten und Transfer mit gleichem Material prüfen.'; if ((obs.hilfegrad || '').includes('körpernah')) return 'die Handlung mit sicherer Assistenz wiederholen und prüfen, ob eine weniger eingreifende Hilfe möglich ist.'; if ((obs.hilfegrad || '').includes('Vormachen') || (obs.hilfegrad || '').includes('Geste')) return 'die Handlung mit gleicher Struktur wiederholen und eine Hilfeform vorsichtig reduzieren.'; if (Number(obs.einschaetzung) >= 8) return 'die Kompetenz in einer ähnlichen Alltagssituation beobachten und Kontext/Hilfeform dokumentieren.'; return station.impuls; }
function warnSensitive(text) { const patterns = [/\b(diagnose|diagnostiziert|autismus|adhs|ads|down.?syndrom|epilepsie|diabetes|medikament|krankheit|trauma|pflegegrad|therapie|arzt|jugendamt|sorgerecht|mutter|vater|eltern|familie|adresse|straße|strasse|geburtsdatum|geboren)\b/i, /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/, /\b[A-ZÄÖÜ][a-zäöüß]{2,}\s+[A-ZÄÖÜ][a-zäöüß]{2,}\b/]; return patterns.some(p => p.test(text || '')); }
function countValues(list, getter) { const counts = new Map(); list.map(getter).flat().filter(Boolean).forEach(v => counts.set(v, (counts.get(v) || 0) + 1)); return [...counts.entries()].sort((a,b)=>b[1]-a[1]); }
function trendFor(list) { if (list.length < 3) return 'noch zu wenig Daten'; const vals = [...list].sort((a,b)=>(a.datum||'').localeCompare(b.datum||'')).map(o=>Number(o.einschaetzung || 0)).filter(Boolean); if (vals.length < 3) return 'noch zu wenig Daten'; const diff = vals.at(-1) - vals[0]; const spread = Math.max(...vals) - Math.min(...vals); if (spread >= 4 && Math.abs(diff) < 2) return 'unsicher'; if (diff >= 2) return 'zunehmend'; return 'stabil'; }
function averageText(list) { const vals = list.map(o=>Number(o.einschaetzung || 0)).filter(Boolean); if (!vals.length) return 'keine Einschätzung'; return `${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)}/10 als vorsichtige Orientierung, nicht als Note`; }
function foerderplanText(obs) { const area = areaById(obs.lernbereich).name; const hilfe = obs.hilfegrad ? `mit der Hilfeform „${obs.hilfegrad}“` : 'mit notierter Hilfeform'; return `Im Bereich ${area} zeigt ${obs.kuerzel || '[Kürzel]'} zur Kompetenz „${obs.kompetenz || 'Kompetenz'}“: ${scaleMeaning(obs.einschaetzung)}. Beobachtet wurde dies ${hilfe}; Transferstatus: ${obs.transfer || 'nicht notiert'}. Als nächster Schritt: ${suggestStep(obs)}`; }
function generateAnalysis(obs, allStations = baseStations) { const station = stationFor(obs, allStations); const area = areaById(obs.lernbereich); const stufe = Number(obs.einschaetzung || 5); const lernschritt = suggestStep(obs, station); return { beobachtung: `Bei ${obs.situation || 'der Beobachtung'} wurde im Bereich „${area.name}“ zur Kompetenz „${obs.kompetenz || area.competencies[0]}“ sichtbar: ${obs.konkret || obs.gelingt || 'eine konkrete Beteiligung wurde beschrieben'}.`, interpretation: `Einschätzung ${stufe}/10 bedeutet: ${scaleMeaning(stufe)}. Das ist eine pädagogische Momentaufnahme, keine Note, keine Diagnose und kein normierter Testwert.`, annahme: `Die Einschätzung ist nur gemeinsam mit Kontext, Tagesform, Hilfegrad (${obs.hilfegrad || 'nicht notiert'}), Sicherheit (${obs.sicherheit || 'nicht notiert'}) und Transfer (${obs.transfer || 'nicht notiert'}) sinnvoll.`, empfehlung: `Passende nächste Stufe: ${nextScaleStep(stufe)}. Nächster kleiner Lernschritt: ${lernschritt}`, ressourcen: `Ressource/Stärke: ${obs.gelingt || obs.konkret || 'Beteiligung wurde beobachtet'}.`, wirksameHilfe: `Hilfegrad: ${obs.hilfegrad || 'nicht notiert'}; weitere Hilfen: ${(obs.hilfe||[]).join(', ') || 'nicht notiert'}.`, barriere: `Transferstatus: ${obs.transfer || 'nicht notiert'}; Barriere/Bedingung: ${(obs.barriere||[]).join(', ') || 'nicht notiert'}.`, lernschritt, stationIdee: station.title, foerderplanung: foerderplanText(obs), team: `Kurz fürs Team: ${obs.kuerzel || 'Kürzel'} zeigte im Bereich ${area.name} die Kompetenz „${obs.kompetenz || area.competencies[0]}“ auf Stufe ${stufe}/10 (${scaleMeaning(stufe)}). Nächste Frage: ${nextQuestion(obs)}`, impulse: [{ ziel: lernschritt, material: station.material, einstieg: station.einstieg, durchfuehrung: station.durchfuehrung, hilfeform: obs.hilfegrad || 'passende Hilfeform festlegen', basal: area.indicators[0], unterstuetzt: area.indicators[1], erweitert: area.indicators[2], beobachtungsfrage: nextQuestion(obs), alltagstransfer: station.impuls, foerderplanung: foerderplanText(obs) }]}; }
function toMarkdown(obs, allStations) { const a = generateAnalysis(obs, allStations); return `# Lernwerkstatt-Beobachtung: ${obs.kuerzel || 'Kürzel'}\n\nDatenschutz: Pseudonym/Kürzel genutzt. Einschätzungen 1–10 sind sensible pädagogische Daten. Keine Diagnose, keine Note, kein normierter Testwert.\n\n## Basisdaten\n- Datum: ${obs.datum || today()}\n- Kürzel/Farbe: ${obs.kuerzel || ''}\n- Situation/Setting: ${obs.situation || ''} / ${obs.setting || ''}\n- Station: ${stationFor(obs, allStations).title}\n\n## Kompetenzraster\n- Lernbereich: ${areaById(obs.lernbereich).name}\n- Kompetenz: ${obs.kompetenz || ''}\n- Pädagogische Einschätzung: ${obs.einschaetzung || ''}/10\n- Bedeutung: ${scaleMeaning(obs.einschaetzung)}\n- Sicherheit der Einschätzung: ${obs.sicherheit || ''}\n- Hilfegrad: ${obs.hilfegrad || ''}\n- Transferstatus: ${obs.transfer || ''}\n- Passende nächste Stufe: ${nextScaleStep(obs.einschaetzung)}\n- Nächste Beobachtungsfrage: ${nextQuestion(obs)}\n\n## Konkrete Beobachtung\n${obs.konkret || obs.gelingt || ''}\n\n## Pädagogische Einordnung\n- Beobachtung: ${a.beobachtung}\n- Interpretation: ${a.interpretation}\n- Annahme: ${a.annahme}\n- Empfehlung: ${a.empfehlung}\n\n## Nächster Lernschritt\n${a.lernschritt}\n\n## Förderplan-Formulierung\n${a.foerderplanung}\n`; }
function MultiSelect({ label, values, selected, setSelected }) { const toggle = v => setSelected(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]); return <section className="field full"><span>{label}</span><div className="chips">{values.map(v => <button type="button" key={v} className={selected.includes(v) ? 'chip selected' : 'chip'} onClick={() => toggle(v)}>{v}</button>)}</div></section>; }
function CompetencyBadge({ obs }) { return <div className="competencyBadge"><strong>{areaById(obs.lernbereich).name}</strong><span>{obs.kompetenz}</span><small>Pädagogische Einschätzung in dieser Situation: {obs.einschaetzung}/10 · {scaleMeaning(obs.einschaetzung)}</small><small>Hilfe: {obs.hilfegrad || 'nicht notiert'} · Transfer: {obs.transfer || 'nicht notiert'}</small></div>; }
function FilterPanel({ filters, setFilters, stations, kuerzels }) { return <section className="card full filterPanel"><h2><Search size={18}/> Filter und Suche</h2><div className="row four"><label className="field"><span>Kürzel/Farbe</span><select value={filters.kuerzel} onChange={e=>setFilters({...filters, kuerzel:e.target.value})}><option value="">alle</option>{kuerzels.map(k=><option key={k}>{k}</option>)}</select></label><label className="field"><span>Lernbereich</span><select value={filters.lernbereich} onChange={e=>setFilters({...filters, lernbereich:e.target.value})}><option value="">alle</option>{competencyAreas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="field"><span>Station</span><select value={filters.stationId} onChange={e=>setFilters({...filters, stationId:e.target.value})}><option value="">alle</option>{stations.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label className="field"><span>Freitext</span><input value={filters.text} onChange={e=>setFilters({...filters, text:e.target.value})} placeholder="Beobachtung, Kompetenz …"/></label></div><button type="button" onClick={()=>setFilters({kuerzel:'', stationId:'', lernbereich:'', text:''})}>Filter zurücksetzen</button></section>; }
function Dashboard({ observations, setView, setActiveId, addExample, startNew }) {
  const todayCount = observations.filter(o => o.datum === today()).length;
  const recent = observations.slice(0,4);
  const areas = countValues(observations.slice(0,10), o=>areaById(o.lernbereich).name).slice(0,4);
  const transferOpen = observations.filter(o=>o.transfer === 'noch nicht geprüft').slice(0,3);
  const developments = competencyAreas.map(a => ({area:a, list:observations.filter(o=>o.lernbereich===a.id), trend:trendFor(observations.filter(o=>o.lernbereich===a.id))})).filter(x=>x.list.length).slice(0,4);
  const handleQuickOpen = (event, targetView) => { event.preventDefault(); event.stopPropagation(); setView(targetView); };
  const openChildStart = (event, targetView) => { event.preventDefault(); event.stopPropagation(); setView(targetView); };
  return <main className="grid two dashboardGrid dashboardBeta">
    <section className="beta3Launcher full">
      <div className="beta3NavIcons" aria-label="Lernbereiche">
        <button type="button" aria-label="Start" onPointerUp={(e)=>openChildStart(e, 'dashboard')} onClick={(e)=>openChildStart(e, 'dashboard')}>🏠</button>
        <button type="button" aria-label="Deutsch und Kommunikation" onPointerUp={(e)=>openChildStart(e, 'student-beta')} onClick={(e)=>openChildStart(e, 'student-beta')}>📖</button>
        <button type="button" aria-label="Mathe und Mengen" onPointerUp={(e)=>openChildStart(e, 'mengen-bis-5')} onClick={(e)=>openChildStart(e, 'mengen-bis-5')}>🧮</button>
        <button type="button" aria-label="Sachunterricht und Alltag" onPointerUp={(e)=>openChildStart(e, 'student-beta')} onClick={(e)=>openChildStart(e, 'student-beta')}>🌍</button>
        <button type="button" aria-label="Spiele für alle" onPointerUp={(e)=>openChildStart(e, 'uebungen')} onClick={(e)=>openChildStart(e, 'uebungen')}>🎮</button>
      </div>
      <div className="beta3Scene" aria-hidden="true">
        <span>🌸</span><span>🌼</span><span>🦋</span><span>🌿</span><span>🍃</span>
      </div>
      <p className="eyebrow">Beta-3.0-Schnitt · Schüler:innen zuerst</p>
      <h2>Wer startet?</h2>
      <div className="profileLauncher" aria-label="Farbprofil wählen">
        {betaProfiles.map(profile => <button type="button" key={profile.id} className={`profileBubble ${profile.className}`} onClick={()=>setView('uebungen')}><span></span><strong>{profile.label}</strong></button>)}
      </div>
      <p className="beta3Or">oder</p>
      <div className="beta3PlayGrid">
        {betaPlayTiles.map(tile => <button type="button" key={tile.id} className="beta3PlayTile" onPointerUp={(e)=>openChildStart(e, tile.id)} onClick={(e)=>openChildStart(e, tile.id)}>
          <span className="beta3PlayIcon">{tile.icon}</span>
          <span className="eyebrow">{tile.area}</span>
          <strong>{tile.title}</strong>
          <small>{tile.hint}</small>
        </button>)}
      </div>
    </section>
    <details className="teacherDashboardDrawer full">
      <summary>Für Lehrkräfte: Arbeitsübersicht öffnen</summary>
      <div className="teacherDashboardGrid">
    <section className="card hero">
      <p className="eyebrow">Arbeitsübersicht</p>
      <h2>Heute im Blick</h2>
      <p className="big">{todayCount}</p>
      <p>heutige Beobachtungen</p>
      <div className="cardActions">
        <button className="primary large" onClick={startNew}><PlusCircle size={18}/> Neue Beobachtung</button>
        <button className="secondary" onClick={addExample}>Beispieldaten laden</button>
      </div>
    </section>
    <section className="card">
      <h2>Zuletzt eingeschätzte Lernbereiche</h2>
      {areas.length ? areas.map(([v,c])=><p key={v}><strong>{v}</strong> · {c}× beobachtet</p>) : <p className="emptyState">Noch keine Kompetenzdaten gespeichert. Beginnen Sie mit einer Beobachtung oder sichten Sie das Kompetenzraster.</p>}
      <button onClick={()=>setView('kompetenzraster')}><Layers size={18}/> Kompetenzraster öffnen</button>
    </section>
    <section className="card">
      <h2>Offene Transferprüfungen</h2>
      {transferOpen.length ? transferOpen.map(o=><button className="listitem" key={o.id} onClick={()=>{setActiveId(o.id);setView('auswertung');}}><strong>{o.kuerzel} · {o.kompetenz}</strong><span>{nextQuestion(o)}</span></button>) : <p className="emptyState">Keine offenen Transferprüfungen in den gespeicherten Beobachtungen.</p>}
    </section>
    <section className="card dashboardQuickStart">
      <h2>App-Zentrale: direkt weiter</h2>
      <p className="assist">Schnelle Wege zu den wichtigsten Arbeitsbereichen.</p>
      <div className="quickLinks"><button type="button" className="primary" onPointerUp={(e)=>handleQuickOpen(e, 'uebungen')} onClick={(e)=>handleQuickOpen(e, 'uebungen')}><strong>Übungsbibliothek</strong><small>Übungen suchen, filtern und starten</small></button><button type="button" onPointerUp={(e)=>handleQuickOpen(e, 'student-beta')} onClick={(e)=>handleQuickOpen(e, 'student-beta')}><strong>Schüler:innenmodus</strong><small>Alltagsstationen ohne Punkte</small></button><button type="button" onPointerUp={(e)=>handleQuickOpen(e, 'stationen')} onClick={(e)=>handleQuickOpen(e, 'stationen')}><strong>Stationen vorbereiten</strong><small>Material und Niveaus A/B/C</small></button><button type="button" onPointerUp={(e)=>handleQuickOpen(e, 'kompetenzraster')} onClick={(e)=>handleQuickOpen(e, 'kompetenzraster')}><strong>Kompetenzraster</strong><small>Lernbereiche und Fragen</small></button><button type="button" onPointerUp={(e)=>handleQuickOpen(e, 'auswertung')} onClick={(e)=>handleQuickOpen(e, 'auswertung')}><strong>Auswertung / Export</strong><small>Beobachtung auswählen</small></button></div>
    </section>
    <section className="card">
      <h2>Kompetenzen mit Entwicklung</h2>
      {developments.map(d=><p key={d.area.id}><strong>{d.area.name}:</strong> {d.trend} · {averageText(d.list)}</p>)}
      {!developments.length && <p className="emptyState">Nach mehreren Beobachtungen erscheinen hier vorsichtige Entwicklungshinweise.</p>}
    </section>
    <section className="card">
      <h2>Letzte Beobachtungen</h2>
      {recent.length ? recent.map(o=><button className="listitem" key={o.id} onClick={()=>{setActiveId(o.id);setView('auswertung');}}><strong>{o.kuerzel} · {o.datum}</strong><span>{o.kompetenz}</span><small>{o.konkret || o.gelingt}</small></button>) : <p className="emptyState">Noch keine Beobachtungen vorhanden. Neue Einträge erscheinen hier chronologisch.</p>}
    </section>
    <section className="card privacy">
      <h2><ShieldCheck size={20}/> Lokal, pseudonym, ohne Diagnosen</h2>
      <ul><li>Nur Kürzel/Farben nutzen, keine echten Namen.</li><li>1–10 ist eine pädagogische Einschätzung, keine Note.</li><li>Kontext, Hilfeform, Transfer und Tagesform immer mitlesen.</li><li>Die Fachkraft entscheidet; die App bewertet nicht automatisch.</li></ul>
    </section>
      </div>
    </details>
  </main>;
}
function ObservationForm({ form, setForm, stations, sensitiveWarning, editingId, onSubmit, onCancel }) {
  const area = areaById(form.lernbereich);
  const setArea = id => { const a = areaById(id); setForm({...form, lernbereich:id, kompetenz:a.competencies[0]}); };
  return <main><form className="card form" onSubmit={onSubmit}>
    <div className="formHeader">
      <div>
        <p className="eyebrow">Beobachtung</p>
        <h2>{editingId ? 'Beobachtung bearbeiten' : 'Neue Beobachtung erfassen'}</h2>
        <p className="assist">Kurz, konkret und beobachtbar. Die 1–10-Skala ist eine pädagogische Momentaufnahme, keine Note und keine Diagnose.</p>
      </div>
      <button className="primary" type="submit">{editingId ? 'Änderungen speichern' : 'Beobachtung speichern'}</button>
    </div>
    {sensitiveWarning && <div className="warning">{PRIVACY_HINT}</div>}
    <fieldset className="formGroup">
      <legend>Basisdaten</legend>
      <div className="row threeCols"><label className="field"><span>Datum *</span><input required type="date" value={form.datum} onChange={e=>setForm({...form, datum:e.target.value})}/></label><label className="field"><span>Kürzel/Farbe *</span><select required value={form.kuerzel} onChange={e=>setForm({...form, kuerzel:e.target.value})}>{kuerzelOptions.map(k=><option key={k}>{k}</option>)}</select></label><label className="field"><span>Lerngruppe optional</span><input value={form.lerngruppe} onChange={e=>setForm({...form, lerngruppe:e.target.value})}/></label></div>
    </fieldset>
    <fieldset className="formGroup">
      <legend>Kompetenz und Kontext</legend>
      <div className="row threeCols"><label className="field"><span>Lernbereich *</span><select required value={form.lernbereich} onChange={e=>setArea(e.target.value)}>{competencyAreas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="field"><span>Kompetenzkategorie *</span><select required value={form.kompetenz} onChange={e=>setForm({...form, kompetenz:e.target.value})}>{area.competencies.map(k=><option key={k}>{k}</option>)}</select></label><label className="field"><span>Station</span><select value={form.stationId} onChange={e=>setForm({...form, stationId:e.target.value})}>{stations.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label></div>
      <div className="row threeCols"><label className="field"><span>Situation</span><select value={form.situation} onChange={e=>setForm({...form, situation:e.target.value})}>{options.situation.map(x=><option key={x}>{x}</option>)}</select></label><label className="field"><span>Setting</span><select value={form.setting} onChange={e=>setForm({...form, setting:e.target.value})}>{options.setting.map(x=><option key={x}>{x}</option>)}</select></label><label className="field"><span>Transfer</span><select value={form.transfer} onChange={e=>setForm({...form, transfer:e.target.value})}>{transferLevels.map(x=><option key={x}>{x}</option>)}</select></label></div>
    </fieldset>
    <fieldset className="formGroup emphasisGroup">
      <legend>Einschätzung und Hilfe</legend>
      <div className="row threeCols"><label className="field scaleField"><span>Pädagogische Einschätzung 1–10 *</span><input type="range" min="1" max="10" value={form.einschaetzung} onChange={e=>setForm({...form, einschaetzung:Number(e.target.value)})}/><strong>{form.einschaetzung}/10</strong><small>{scaleMeaning(form.einschaetzung)}</small></label><label className="field"><span>Sicherheit der Einschätzung</span><select value={form.sicherheit} onChange={e=>setForm({...form, sicherheit:e.target.value})}>{confidenceLevels.map(x=><option key={x}>{x}</option>)}</select></label><label className="field"><span>Hilfegrad</span><select value={form.hilfegrad} onChange={e=>setForm({...form, hilfegrad:e.target.value})}>{helpLevels.map(x=><option key={x}>{x}</option>)}</select></label></div>
    </fieldset>
    <fieldset className="formGroup">
      <legend>Konkrete Beobachtung</legend>
      <label className="field full"><span>Konkrete Beobachtung / Ressource *</span><textarea required value={form.konkret} onChange={e=>setForm({...form, konkret:e.target.value})} placeholder="Was war sichtbar? Handlung, Kommunikation, Material, Kontext, Hilfeform …"/></label><label className="field full"><span>Was gelingt / Ressource</span><input value={form.gelingt} onChange={e=>setForm({...form, gelingt:e.target.value})}/></label>
    </fieldset>
    <fieldset className="formGroup">
      <legend>Hilfen, Kommunikation und Bedingungen</legend>
      <MultiSelect label="Weitere beobachtete Hilfen" values={options.hilfe} selected={form.hilfe || []} setSelected={v=>setForm({...form, hilfe:v})}/><MultiSelect label="Kommunikationsformen" values={options.kommunikation} selected={form.kommunikation || []} setSelected={v=>setForm({...form, kommunikation:v})}/><MultiSelect label="Barrieren / Bedingungen" values={options.barriere} selected={form.barriere || []} setSelected={v=>setForm({...form, barriere:v})}/>
    </fieldset>
    <fieldset className="formGroup">
      <legend>Nächster Schritt</legend>
      <label className="field full"><span>Nächster kleiner Lernschritt optional</span><textarea value={form.lernschritt} onChange={e=>setForm({...form, lernschritt:e.target.value})}/></label>
    </fieldset>
    <div className="actions stickyActions"><button className="primary">{editingId ? 'Änderungen speichern' : 'Beobachtung speichern'}</button><button type="button" onClick={onCancel}>Abbrechen</button></div>
  </form></main>;
}
function Kompetenzraster() { const [areaId, setAreaId] = useState('mathe'); const area = areaById(areaId); return <main className="grid two"><section className="card"><h2><Layers size={20}/> Kompetenzraster</h2><p className="assist">GE-orientiertes Raster für Beobachtungen. Es ersetzt keine Förderdiagnostik und erzeugt keine automatische Bewertung.</p><label className="field"><span>Lernbereich auswählen</span><select value={areaId} onChange={e=>setAreaId(e.target.value)}>{competencyAreas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><h3>Kompetenzen</h3><div className="chips static">{area.competencies.map(c=><span className="chip selected" key={c}>{c}</span>)}</div><h3>Beispielindikatoren</h3><ul>{area.indicators.map(i=><li key={i}>{i}</li>)}</ul><h3>Passende Beobachtungsfragen</h3><ul>{area.questions.map(q=><li key={q}>{q}</li>)}</ul></section><section className="card"><h2>Skala 1–10: pädagogische Einschätzung</h2><p className="warning soft">Keine Note. Keine Diagnose. Kein normierter Testwert. Immer Kontext, Hilfegrad, Transfer und Tagesform mitdenken.</p><div className="scaleList">{Object.entries(scale).map(([n,t])=><p key={n}><strong>{n}/10</strong> {t}</p>)}</div></section></main>; }
function Verlauf({ observations, selected, setSelected }) { const kuerzels = [...new Set(observations.map(o=>o.kuerzel).filter(Boolean))].sort(); const active = selected || kuerzels[0] || ''; const list = observations.filter(o=>o.kuerzel===active).sort((a,b)=>(b.datum||'').localeCompare(a.datum||'')); const byArea = competencyAreas.map(a=>({ area:a, list:list.filter(o=>o.lernbereich===a.id)})).filter(x=>x.list.length); const byComp = countValues(list, o=>o.kompetenz).slice(0,8); return <main className="grid two"><section className="card"><h2><TrendingUp size={18}/> Verlauf pro Kürzel/Farbe</h2><p className="assist">Durchschnitt nur als Orientierung, nicht als Leistungswert. Bei wenigen Beobachtungen vorsichtig formulieren.</p><label className="field"><span>Kürzel/Farbe auswählen</span><select value={active} onChange={e=>setSelected(e.target.value)}>{kuerzels.map(k=><option key={k}>{k}</option>)}</select></label>{list.length < 3 && <p className="warning soft">Noch keine belastbare Verlaufsaussage. Weitere Beobachtungen nötig.</p>}{list.map(o=><article className="mini" key={o.id}><strong>{o.datum} · {areaById(o.lernbereich).name}</strong><CompetencyBadge obs={o}/><p>{o.konkret || o.gelingt}</p></article>)}</section><section className="card"><h2>Kompetenzentwicklung</h2><h3>Entwicklung pro Lernbereich</h3>{byArea.map(({area,list})=><p key={area.id}><strong>{area.name}:</strong> {trendFor(list)} · {averageText(list)}</p>)}<h3>Entwicklung pro Kompetenz</h3>{byComp.length ? byComp.map(([v,c])=><p key={v}>{v}: {c} Beobachtung(en)</p>) : <p>Noch keine Kompetenzdaten.</p>}<h3>Letzte Einschätzungen</h3><ul>{list.slice(0,5).map(o=><li key={o.id}>{o.datum}: {o.kompetenz} · {o.einschaetzung}/10 · {scaleMeaning(o.einschaetzung)}</li>)}</ul></section></main>; }
function MaterialCards({ stations }) { return <main><section className="card"><h2>Materialkarten für Lernwerkstattstationen</h2><p className="assist">Zum Ausdrucken, Laminieren oder für die Vorbereitung im Team.</p><button onClick={()=>window.print()}><Printer size={18}/> Materialkarten drucken</button></section><section className="grid three materialCards">{stations.map(s=><article className="card materialCard" key={s.id}><p className="eyebrow">Materialkarte</p><h2>{s.title}</h2><p><strong>Ziel:</strong> {s.ziel}</p><p><strong>Material:</strong> {s.material}</p><p><strong>Einstieg:</strong> {s.einstieg}</p><p><strong>Ablauf:</strong> {s.durchfuehrung}</p><div className="levels"><p><strong>A basal:</strong> {s.basal}</p><p><strong>B unterstützt:</strong> {s.unterstuetzt}</p><p><strong>C erweitert:</strong> {s.erweitert}</p></div><p><strong>Hilfen:</strong> {(s.hilfen||[]).join(', ')}</p><p><strong>Beobachten:</strong> {(s.beobachtungsfragen||[]).join(' · ')}</p></article>)}</section></main>; }
function Beobachtungsbogen({ stations }) { return <main className="printPage"><button className="noPrint" onClick={()=>window.print()}><Printer size={18}/> Beobachtungsbogen drucken</button><h1>Druckbarer Beobachtungsbogen</h1><p className="printHint">Nur Farben/Kürzel nutzen. Keine Namen, Diagnosen oder Familieninfos eintragen. 1–10 ist eine pädagogische Einschätzung, keine Note.</p><section><h2>Basisdaten</h2><p>Datum: __________ Kürzel/Farbe: __________ Lernbereich: __________ Kompetenz: __________</p><p>Station/Situation: ____________________ Setting: ____________________</p></section><section><h2>Pädagogische Einschätzung</h2><p>Stufe 1–10: ___ Sicherheit: sehr unsicher / eher unsicher / ausreichend beobachtet / mehrfach beobachtet</p><p>Hilfegrad: ohne / verbal / Geste / Symbol-Talker-Bild / Vormachen / Materialstruktur / körpernahe Assistenz</p><p>Transfer: nur hier / gleiches Material / ähnliches Material / Alltagssituation / noch nicht geprüft</p></section><section><h2>Konkrete Beobachtung</h2><p className="writeLines">Was war sichtbar? Handlung, Kommunikation, Materialkontakt, Hilfe, Kontext.</p></section><section><h2>Nächste Beobachtungsfrage und Lernschritt</h2><p className="writeLines">Welche kleine Veränderung wird als Nächstes beobachtet?</p></section><section><h2>Stationen-Check</h2>{stations.map(s=><p key={s.id}>□ {s.title}</p>)}</section></main>; }
function Teamgespraech({ observations }) { const list = observations.slice(0,5); return <main className="grid two"><section className="card"><h2>Teamgespräch-Vorlage</h2><p className="assist">10–15 Minuten: Beobachtung sichern, Hilfegrad prüfen, nächsten Schritt festlegen.</p><button onClick={()=>window.print()}><Printer size={18}/> Vorlage drucken</button><h3>1. Beobachtung</h3><ul><li>Was war konkret sichtbar?</li><li>Welche Kompetenz und welcher Lernbereich?</li><li>Welche Hilfeform war wirksam?</li></ul><h3>2. Pädagogische Einschätzung</h3><p>Stufe ___/10, weil ____________________________________. Keine Note, keine Diagnose.</p><h3>3. Nächster Schritt</h3><p>Nächste Woche testen wir: ____________________________________.</p></section><section className="card"><h2>Aktuelle Beobachtungen</h2>{list.map(o=>{const a=generateAnalysis(o);return <article className="mini" key={o.id}><strong>{o.kuerzel} · {o.kompetenz}</strong><p>{a.team}</p></article>;})}</section></main>; }
function NaechsteWoche({ observations, stations }) { const items = observations.slice(0,6).map(o=>({obs:o, analysis:generateAnalysis(o, stations), station:stationFor(o, stations)})); return <main className="grid two"><section className="card"><h2>Nächste Woche planen</h2><p className="assist">Kleine, überprüfbare Handlungsschritte. Bitte fachlich auswählen, nicht automatisch übernehmen.</p>{items.map(({obs,analysis,station})=><article className="mini planItem" key={obs.id}><h3>{obs.kuerzel} · {obs.kompetenz}</h3><p><strong>Einschätzung:</strong> {obs.einschaetzung}/10 · {scaleMeaning(obs.einschaetzung)}</p><p><strong>Ziel:</strong> {analysis.lernschritt}</p><p><strong>Hilfe:</strong> {obs.hilfegrad}</p><p><strong>Beobachtungsfrage:</strong> {nextQuestion(obs)}</p><p><strong>Materialidee:</strong> {station.material}</p></article>)}</section><section className="card"><h2>Wochenplan leer</h2><p>Montag: ________________________________________________</p><p>Dienstag: ________________________________________________</p><p>Mittwoch: ________________________________________________</p><p>Donnerstag: ________________________________________________</p><p>Freitag: ________________________________________________</p></section></main>; }

const STUDENT_SUPPORTS = ['Warten','Zeigen','Vormachen','Bild','Talker','Pause'];
const STUDENT_REFLECTIONS = ['nochmal','fertig','Pause','leicht','schwer','Hilfe war gut'];
const STUDENT_LEARNING_STATES = ['Ich entdecke','Ich mache mit Hilfe','Ich mache es wieder','Ich mache es fast allein','Ich probiere es woanders'];
const STUDENT_GAMES = [
  { id:'getraenk-waehlen', title:'Ich wähle mein Getränk', area:'Kommunikation/Sprache', icon:'🥤', shortTask:'Was möchtest du? Zeig es.', material:'Zwei Getränke oder Becher, zwei Symbole, Tablett.', status:'sofort geeignet', steps:['Schau: zwei Sachen sind da.','Zeig, greif, schau oder sag: das möchte ich.','Die Wahl wird bestätigt.','Lege das Symbol ab oder bekomme dein Getränk.'], nextStep:'Später zwischen drei Möglichkeiten wählen.', safetyNote:'Echte Wahl respektieren. Lebensmittel und Allergien beachten. Keine Fotos nötig.' },
  { id:'bild-auftrag', title:'Bild sagt Auftrag', area:'Kommunikation/Sprache', icon:'🖼️', shortTask:'Schau das Bild an. Mach es.', material:'Neutrale Bildkarten: sitzen, stehen, klatschen, winken, Ball holen.', status:'mit Symbolen testen', steps:['Schau eine Bildkarte an.','Die Handlung wird vorgemacht.','Mach mit: ganz oder ein Stück.','Lege die Karte auf Fertig.'], nextStep:'Zwei Bildaufträge nacheinander ausprobieren.', safetyNote:'Keine ungeprüften Kinderfotos nutzen. Besser neutrale Symbole oder Gegenstände.' },
  { id:'fuehlbeutel-gleich', title:'Fühlbeutel: Was ist gleich?', area:'Wahrnehmung', icon:'✋', shortTask:'Fühl. Such das Gleiche.', material:'Stoffbeutel, gleiche Gegenstände, Tablett.', status:'sofort geeignet', steps:['Fühl einen Gegenstand.','Such den gleichen Gegenstand.','Leg gleiche Dinge zusammen.','Zeig: gleich.'], nextStep:'Weich und hart sortieren.', safetyNote:'Kleinteile, Hygiene und sensorische Grenzen beachten. Pause ist erlaubt.' },
  { id:'geraeusch-finden', title:'Geräusch finden', area:'Wahrnehmung', icon:'👂', shortTask:'Hör gut. Was klingt so?', material:'Schlüssel, Dose mit Reis, Glöckchen oder andere sichere Geräusche.', status:'reizarm prüfen', steps:['Hör ein Geräusch.','Wähle zwischen zwei oder drei Dingen.','Hör nochmal.','Leg den Gegenstand auf Gehört.'], nextStep:'Geräusch-Memory oder Start-Stopp-Signal.', safetyNote:'Lautstärke, Reizbelastung, Pause und Rückzug beachten.' },
  { id:'teller-loeffel', title:'Ein Teller, ein Löffel', area:'Mathematische Grunderfahrungen', icon:'🍽️', shortTask:'Zu jedem Teller ein Löffel.', material:'Teller oder Tellerbilder, Löffel, Tablett.', status:'sofort geeignet', steps:['Schau die Teller an.','Ein Löffel wird als Beispiel gelegt.','Gib jedem Teller einen Löffel.','Prüfe: Hat jeder Teller einen Löffel?'], nextStep:'Prüfen: Sind genug Löffel da?', safetyNote:'Alltagsnah arbeiten. Keine personenbezogenen Daten nötig.' },
  { id:'muster-weiter', title:'Baue das Muster weiter', area:'Mathematische Grunderfahrungen', icon:'🧱', shortTask:'Schau. Baue weiter.', material:'Große Bauklötze oder Steckwürfel in zwei Farben.', status:'später / optional', steps:['Schau die Reihe an.','Wähle das nächste Teil.','Leg oder steck es an.','Zeig: fertig.'], nextStep:'Erst nach sicheren Sortier- und Reihen-Erfahrungen erweitern.', safetyNote:'Für manche Kinder abstrakt. Stark vormachen und Material sehr klar halten.' },
  { id:'jacke-platz', title:'Meine Jacke an den Platz', area:'Selbstständigkeit', icon:'🧥', shortTask:'Bring deine Jacke an den Platz.', material:'Jacke, Garderoben-Symbol, ggf. Bildplan.', status:'sofort geeignet', steps:['Nimm die Jacke.','Such den Platz oder das Symbol.','Häng die Jacke auf oder leg sie ab.','Zeig: fertig.'], nextStep:'Mit weniger Zeigegeste oder anderem Material üben.', safetyNote:'Keine Namen oder Fotos digital übernehmen.' },
  { id:'turm-zusammen', title:'Wir bauen zusammen einen Turm', area:'Soziales Lernen', icon:'🏗️', shortTask:'Wir bauen zusammen. Ich warte. Du bist dran.', material:'Große Bausteine, Start-/Dran-/Fertig-Karten.', status:'mit Frustschutz', steps:['Nimm einen Baustein.','Warte: die andere Person ist dran.','Du bist dran und baust weiter.','Schaut den Turm zusammen an.','Wähle: fertig oder nochmal.'], nextStep:'Partnerwechsel oder klare Rollenkarte.', safetyNote:'Wartezeit, Frustschutz, Pause und Partnerdynamik beachten.' }
];

function StudentModeBeta({ setView }) {
  const [selectedId,setSelectedId] = useState(null);
  const selectedStation = STUDENT_GAMES.find(s=>s.id===selectedId) || null;
  const [stepIndex,setStepIndex] = useState(0);
  const [help,setHelp] = useState('');
  const [reflection,setReflection] = useState('');
  const [state,setState] = useState(STUDENT_LEARNING_STATES[0]);
  const resetForStation = station => { setSelectedId(station.id); setStepIndex(0); setHelp(''); setReflection(''); setState(STUDENT_LEARNING_STATES[0]); };
  const goBackToLibrary = () => { setSelectedId(null); setStepIndex(0); setReflection(''); };
  if (!selectedStation) return <main className="studentMode student-game-library">
    <section className="card betaHero student-game-hero"><p className="eyebrow">Schüler:innenmodus Beta · keine Note · kein Test</p><h2>Übungsspiel wählen</h2><p>Wähle eine Lernstation. Es gibt keine Punkte, keine Sterne und keine Rangliste. Du darfst Hilfe wählen, Pause machen und nochmal probieren.</p><div className="student-game-nav"><button type="button" onClick={()=>setView('dashboard')}>Zur Lehrkraft-App</button></div></section>
    <section className="student-game-grid full">{STUDENT_GAMES.map(s=><article className="card student-game-card" key={s.id}><div className="student-game-icon" aria-hidden="true">{s.icon}</div><p className="eyebrow">{s.area}</p><h3>{s.title}</h3><p className="student-game-task">{s.shortTask}</p><p className="student-game-status">{s.status}</p><button type="button" className="primary large" onClick={()=>resetForStation(s)}>Spiel starten</button></article>)}</section>
  </main>;
  const isLastStep = stepIndex >= selectedStation.steps.length - 1;
  return <main className="studentMode student-station-mode">
    <section className="card betaHero student-station-head"><p className="eyebrow">Schüler:innenmodus Beta · keine Note · kein Test</p><div className="student-station-title"><span className="student-game-icon" aria-hidden="true">{selectedStation.icon}</span><div><h2>{selectedStation.title}</h2><p>{selectedStation.area}</p></div></div><p className="student-game-task">{selectedStation.shortTask}</p><div className="student-game-nav"><button type="button" onClick={goBackToLibrary}>Zurück zu den Übungsspielen</button><button type="button" onClick={()=>setView('dashboard')}>Zur Lehrkraft-App</button></div></section>
    <section className="grid two full student-station-grid"><section className="card student-material-card"><h3>Material</h3><p>{selectedStation.material}</p><h3>Sicher arbeiten</h3><p>{selectedStation.safetyNote}</p></section><section className="card student-step-card"><p className="eyebrow">Schritt {stepIndex + 1} von {selectedStation.steps.length}</p><p className="student-step-current">{selectedStation.steps[stepIndex]}</p><div className="student-step-actions"><button type="button" onClick={()=>setStepIndex(Math.max(0, stepIndex-1))} disabled={stepIndex===0}>Zurück</button><button type="button" className="primary" onClick={()=> isLastStep ? setReflection(reflection || 'fertig') : setStepIndex(Math.min(selectedStation.steps.length-1, stepIndex+1))}>{isLastStep ? 'Fertig' : 'Weiter'}</button></div></section></section>
    <section className="grid two full student-station-grid"><section className="card student-support-card"><h3>Ich brauche Hilfe</h3><p className="assist">Hilfe ist erlaubt. Wähle eine Karte.</p><div className="student-support-options">{STUDENT_SUPPORTS.map(x=><button type="button" key={x} className={help===x?'student-support selectedTile':'student-support'} onClick={()=>setHelp(x)}>{x}</button>)}</div></section><section className="card student-finish-card"><h3>Fertig / Nochmal / Pause</h3><p className="assist">Keine richtige oder falsche Antwort.</p><div className="student-reflection-options">{STUDENT_REFLECTIONS.map(x=><button type="button" key={x} className={reflection===x?'student-reflection selectedTile':'student-reflection'} onClick={()=>setReflection(x)}>{x}</button>)}</div></section></section>
    <section className="card full student-state-card"><h3>Mein Lernzustand</h3><div className="student-state-options">{STUDENT_LEARNING_STATES.map(x=><button type="button" key={x} className={state===x?'student-state selectedTile':'student-state'} onClick={()=>setState(x)}>{x}</button>)}</div></section>
    <section className="card full learningTrace student-learning-trace"><h2>Das habe ich gemacht</h2><p><strong>Station:</strong> {selectedStation.icon} {selectedStation.title}</p><p><strong>Hilfe:</strong> {help || 'noch nicht gewählt'}</p><p><strong>Antwort:</strong> {reflection || 'noch offen'}</p><p><strong>Nächster kleiner Schritt:</strong> {selectedStation.nextStep}</p><p><strong>Lernzustand:</strong> {state}</p><p className="warning soft">Nur sichtbare Beta-Lernspur im UI. Keine Namen, keine Fotos, keine Diagnosen, keine Speicherung, keine automatische Bewertung.</p><div className="student-game-nav"><button type="button" onClick={()=>{setStepIndex(0); setReflection('nochmal');}}>Nochmal</button><button type="button" onClick={goBackToLibrary}>Anderes Material / andere Station</button></div></section>
  </main>;
}


const SYMBOL_GARDEN_LEVELS = {
  A: {
    title: 'A · ganz basal: essen oder anziehen',
    hint: 'Erst mit echten Dingen zeigen: Apfel essen. Jacke anziehen. Dann eine Karte antippen und in das passende Feld legen.',
    realObjectHint: 'Vor der digitalen Runde möglichst echte Gegenstände oder Spielobjekte zeigen: Apfel/Brot und Jacke/Schuh.',
    targets: [
      { id: 'essen', label: 'Essen', icon: '🍎', objectWord: 'Apfel' },
      { id: 'anziehen', label: 'Anziehen', icon: '🧥', objectWord: 'Jacke' }
    ],
    cards: [
      { id: 'apfel', label: 'Apfel', icon: '🍎', target: 'essen' },
      { id: 'brot', label: 'Brot', icon: '🍞', target: 'essen' },
      { id: 'jacke', label: 'Jacke', icon: '🧥', target: 'anziehen' },
      { id: 'schuh', label: 'Schuh', icon: '👟', target: 'anziehen' }
    ],
    observationQuestions: ['Schaut oder greift das Kind zum echten Gegenstand?', 'Hilft Vormachen mehr als Sprache?', 'Ist eine Wahl aus zwei Karten schon passend?'],
    nextOptions: ['Mit echten Gegenständen wiederholen.', 'Nur zwei Karten anbieten.', 'Eine Hilfeform reduzieren.', 'Pause und später gleicher Aufbau.'],
    nextStep: 'Mit echten Gegenständen gleiches/anderes nochmal legen.'
  },
  B: {
    title: 'B · drei Orte im Alltag',
    hint: 'Sortiere Alltagssymbole nach dem Ort. Erst vormachen, dann selbst probieren.',
    realObjectHint: 'Optional mit Teller, Becher, Seife und Ball vorentlasten.',
    targets: [
      { id: 'kueche', label: 'Küche', icon: '🍽️', objectWord: 'Teller' },
      { id: 'bad', label: 'Bad', icon: '🧼', objectWord: 'Seife' },
      { id: 'spiel', label: 'Spiel', icon: '⚽', objectWord: 'Ball' }
    ],
    cards: [
      { id: 'teller', label: 'Teller', icon: '🍽️', target: 'kueche' },
      { id: 'becher', label: 'Becher', icon: '🥤', target: 'kueche' },
      { id: 'seife', label: 'Seife', icon: '🧼', target: 'bad' },
      { id: 'buerste', label: 'Bürste', icon: '🪥', target: 'bad' },
      { id: 'ball', label: 'Ball', icon: '⚽', target: 'spiel' },
      { id: 'klotz', label: 'Klotz', icon: '🧱', target: 'spiel' }
    ],
    observationQuestions: ['Wird der Ort erkannt oder nur die Form verglichen?', 'Welche Karte braucht Vormachen?', 'Bleibt die Aufmerksamkeit bei drei Feldern stabil?'],
    nextOptions: ['Einen Ort mit Bildkarte vormachen.', 'Auf zwei Orte reduzieren.', 'Gleiches Material erneut anbieten.', 'In Alltagssituation Küche/Bad/Spiel prüfen.'],
    nextStep: 'Einen Ort mit Bildkarte vormachen und dann Hilfe langsam reduzieren.'
  },
  C: {
    title: 'C · Merkmal finden',
    hint: 'Sortiere nach Merkmal: rund, zum Essen oder zum Anziehen.',
    realObjectHint: 'Erst nutzen, wenn Sortieren nach Gegenstand/Ort sicherer wirkt.',
    targets: [
      { id: 'rund', label: 'rund', icon: '⭕', objectWord: 'Kreis' },
      { id: 'essen', label: 'zum Essen', icon: '🍌', objectWord: 'Banane' },
      { id: 'kleidung', label: 'Kleidung', icon: '🧦', objectWord: 'Socke' }
    ],
    cards: [
      { id: 'ball-c', label: 'Ball', icon: '⚽', target: 'rund' },
      { id: 'reifen', label: 'Reifen', icon: '⭕', target: 'rund' },
      { id: 'banane', label: 'Banane', icon: '🍌', target: 'essen' },
      { id: 'suppe', label: 'Suppe', icon: '🥣', target: 'essen' },
      { id: 'muetze', label: 'Mütze', icon: '🧢', target: 'kleidung' },
      { id: 'socke', label: 'Socke', icon: '🧦', target: 'kleidung' }
    ],
    observationQuestions: ['Wird nach Merkmal oder nach Bekanntheit sortiert?', 'Ist die Aufgabe zu abstrakt?', 'Welche Begründung/Zeigegeste unterstützt?'],
    nextOptions: ['Ein neues Symbol gemeinsam besprechen.', 'Zurück zu Niveau B.', 'Nur ein Merkmal üben.', 'Mit realem Material vergleichen.'],
    nextStep: 'Ein neues Symbol gemeinsam besprechen: Welches Merkmal passt?'
  }
};

function SymbolSortiergarten({ setView }) {
  const [level,setLevel] = useState('A');
  const [placed,setPlaced] = useState({});
  const [selected,setSelected] = useState('');
  const [feedback,setFeedback] = useState('Wähle eine Karte. Hilfe ist okay.');
  const [visualMode,setVisualMode] = useState(true);
  const [teacherHelp,setTeacherHelp] = useState('Wartezeit');
  const [teacherObservation,setTeacherObservation] = useState('Blick / Aufmerksamkeit');
  const [teacherQuestion,setTeacherQuestion] = useState('Hilft echtes Material vor dem Symbol?');
  const [teacherNext,setTeacherNext] = useState('');
  const [teacherExtra,setTeacherExtra] = useState('');
  const data = SYMBOL_GARDEN_LEVELS[level];
  const remaining = data.cards.filter(c=>!placed[c.id]);
  const done = remaining.length === 0;
  const reset = nextLevel => {
    setLevel(nextLevel);
    setPlaced({});
    setSelected('');
    setFeedback('Wähle eine Karte. Hilfe ist okay.');
    setTeacherQuestion(SYMBOL_GARDEN_LEVELS[nextLevel].observationQuestions[0]);
    setTeacherNext('');
    setTeacherExtra('');
  };
  const chooseCard = id => {
    setSelected(id);
    const card = data.cards.find(c=>c.id===id);
    setFeedback(`${card?.label || 'Karte'} ist bereit. Suche den passenden Garten.`);
  };
  const putInGarden = targetId => {
    const card = data.cards.find(c=>c.id===selected);
    if (!card) { setFeedback('Erst eine Karte wählen. Hilfe ist okay.'); return; }
    if (card.target === targetId) {
      setPlaced({...placed, [card.id]: targetId});
      setSelected('');
      setFeedback('Passt. Gut gelegt.');
    } else {
      setFeedback('Nochmal. Schau in Ruhe. Hilfe ist okay.');
    }
  };
  const renderSymbol = item => <span className="symbolIcon" aria-hidden="true">{item.icon}</span>;
  const renderLabel = item => <strong className={visualMode ? 'visuallyQuietLabel' : ''}>{visualMode ? item.objectWord || item.label : item.label}</strong>;
  return <main className="symbolGarden studentMode">
    <section className="card symbolGardenHero">
      <p className="eyebrow">Symbol-Sortiergarten · lokal · ohne Punkte</p>
      <h2>Symbol-Sortiergarten</h2>
      <p>Ruhiges Sortierspiel mit großen Feldern. Keine Zeit, keine Punkte, keine Namen und keine Speicherung.</p>
      <div className="symbolLevelButtons" aria-label="Niveau wählen">{Object.keys(SYMBOL_GARDEN_LEVELS).map(k=><button type="button" key={k} className={level===k?'active symbolLevel':'symbolLevel'} onClick={()=>reset(k)}>{SYMBOL_GARDEN_LEVELS[k].title}</button>)}</div>
      <label className="symbolToggle"><input type="checkbox" checked={visualMode} onChange={e=>setVisualMode(e.target.checked)}/> Bilder statt Wörter betonen</label>
      <div className="student-game-nav"><button type="button" onClick={()=>setView('student-beta')}>Zu den Übungsspielen</button><button type="button" onClick={()=>setView('dashboard')}>Zur Lehrkraft-App</button></div>
    </section>
    <section className="card full symbolGardenTask">
      <h3>{data.title}</h3>
      <p className="student-game-task">{data.hint}</p>
      <p className="assist"><strong>Vorentlastung:</strong> {data.realObjectHint}</p>
      <p className="symbolFeedback" aria-live="polite">{done ? 'Alles liegt im Garten. Du bist fertig.' : feedback}</p>
    </section>
    <section className="symbolGardenBoard full">
      <div className="card symbolCards"><h3>Karten</h3><div className="symbolCardGrid">{remaining.map(c=><button type="button" key={c.id} className={selected===c.id?'symbolCard selectedTile':'symbolCard'} onClick={()=>chooseCard(c.id)}>{renderSymbol(c)}{renderLabel(c)}</button>)}</div>{!remaining.length && <p className="success">Alle Karten sind gelegt.</p>}</div>
      <div className="card symbolTargets"><h3>Gärten</h3><div className="symbolTargetGrid">{data.targets.map(t=><button type="button" key={t.id} className="symbolTarget" onClick={()=>putInGarden(t.id)}>{renderSymbol(t)}{renderLabel(t)}<small>{data.cards.filter(c=>placed[c.id]===t.id).map(c=>`${c.icon} ${visualMode ? '' : c.label}`).join(' · ') || 'hier ablegen'}</small></button>)}</div></div>
    </section>
    <section className="quantitySupportBar symbolSupportBar"><button type="button" onClick={()=>setFeedback('Hilfe ist da: Erst zeigen, dann gemeinsam legen.')}>Hilfe</button><button type="button" onClick={()=>reset(level)}>Nochmal</button><button type="button" onClick={()=>setFeedback('Pause ist okay.')}>Pause</button><button type="button" onClick={()=>setView('uebungen')}>Zurück</button></section>
    {done && <section className="card full symbolDone"><h2>Fertig</h2><p>Du kannst nochmal sortieren, Pause machen oder mit echten Gegenständen weiterüben.</p><div className="student-game-nav"><button type="button" onClick={()=>reset(level)}>Nochmal</button><button type="button" onClick={()=>setFeedback('Pause ist okay.')}>Pause</button></div></section>}
    <section className="card full symbolTeacherTrace">
      <p className="eyebrow">Lehrkraft-Lernspur · nicht speichern</p>
      <h2>Kurze sichere Beobachtung</h2>
      <p className="warning soft">Nur Auswahlfelder und kurze pädagogische Fragen nutzen. Keine Namen, Diagnosen, Familieninfos oder freien personenbezogenen Rohdaten eintragen. Die Lernspur wird nicht gespeichert und ersetzt keine Dokumentation oder Förderdiagnostik.</p>
      <div className="row threeCols">
        <label className="field"><span>Niveau</span><input readOnly value={data.title}/></label>
        <label className="field"><span>Hilfeform</span><select value={teacherHelp} onChange={e=>setTeacherHelp(e.target.value)}>{['Wartezeit','Vormachen','Zeigen / Geste','Auswahl aus zwei Karten','echter Gegenstand','Pause / Regulation'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Beobachteter Zugang</span><select value={teacherObservation} onChange={e=>setTeacherObservation(e.target.value)}>{['Blick / Aufmerksamkeit','Greifen / Legen','Auswahl zeigen','Nachahmen','Sprache / Gebärde / Talker','Pause gebraucht'].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <label className="field full"><span>Beobachtungsfrage</span><select value={teacherQuestion} onChange={e=>setTeacherQuestion(e.target.value)}>{data.observationQuestions.map(x=><option key={x}>{x}</option>)}</select></label>
      <div className="row twoCols">
        <label className="field"><span>Sicherer nächster Schritt</span><select value={teacherNext} onChange={e=>setTeacherNext(e.target.value)}><option value="">bitte auswählen</option>{data.nextOptions.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Optionaler kurzer Zusatz ohne Personendaten</span><textarea maxLength="160" value={teacherExtra} onChange={e=>setTeacherExtra(e.target.value)} placeholder="Max. 160 Zeichen: sichtbare Handlung, Material, Hilfe. Keine Namen/Diagnosen/Familieninfos."/><small>{teacherExtra.length}/160 · besser leer lassen, wenn nicht nötig.</small></label>
      </div>
      <p><strong>Aktuelle Lernspur:</strong> {teacherHelp} · {teacherObservation} · {teacherQuestion} · {teacherNext || data.nextStep}</p>
    </section>
  </main>;
}

const UK_CHOICES = [
  { id: 'mehr', label: 'mehr', icon: '+', tone: 'green', feedback: 'Du hast mehr gewählt. Ein neues Teil kommt dazu.', teacher: 'mehr gewählt' },
  { id: 'fertig', label: 'fertig', icon: 'OK', tone: 'blue', feedback: 'Jetzt ist es fertig. Du hast entschieden.', teacher: 'fertig gewählt' },
  { id: 'nochmal', label: 'nochmal', icon: '↻', tone: 'amber', feedback: 'Nochmal ist okay. Die Runde startet neu.', teacher: 'nochmal gewählt' }
];

const UK_LEVELS = {
  A: {
    title: 'A · zeigen',
    prompt: 'Lege eine Karte. Wähle dann mehr oder fertig.',
    task: 'Eine kleine Karte liegt auf dem Tablett. Die Auswahl ist reduziert.',
    initialItems: 1,
    maxItems: 3,
    choices: ['mehr', 'fertig'],
    reducedChoices: ['mehr', 'fertig'],
    observationQuestions: ['Reagiert die lernende Person auf mehr oder fertig?', 'Hilft eine echte Karte vor dem Antippen?', 'Welche Wartezeit ist passend?'],
    nextOptions: ['Gleiche Wahl mit echtem Material wiederholen.', 'Die dritte Karte nochmal später zeigen.', 'Nur eine Handlung und zwei Karten nutzen.'],
    nextStep: 'Gleiche Wahl mit echtem Material und zwei Karten wiederholen.'
  },
  B: {
    title: 'B · entscheiden',
    prompt: 'Wähle mehr, fertig oder nochmal.',
    task: 'Zwei Karten liegen bereit. Nach jeder Wahl verändert sich die Runde sichtbar.',
    initialItems: 2,
    maxItems: 5,
    choices: ['mehr', 'fertig', 'nochmal'],
    reducedChoices: ['mehr', 'fertig'],
    observationQuestions: ['Welche Karte wird aktiv genutzt?', 'Braucht die Wahl Vormachen, Geste oder nur Wartezeit?', 'Wird nochmal als echte Wiederholung verstanden?'],
    nextOptions: ['Drei Karten beibehalten und Wartezeit geben.', 'Auswahl kurz auf zwei Karten reduzieren.', 'Transfer in Snack, Materialdienst oder Aufräumen prüfen.'],
    nextStep: 'Drei Karten beibehalten und die gleiche kleine Routine erneut anbieten.'
  },
  C: {
    title: 'C · steuern',
    prompt: 'Steuere die Runde: mehr, fertig oder nochmal.',
    task: 'Die Runde kann wachsen, ruhig enden oder neu starten.',
    initialItems: 3,
    maxItems: 6,
    choices: ['mehr', 'fertig', 'nochmal'],
    reducedChoices: ['mehr', 'fertig', 'nochmal'],
    observationQuestions: ['Steuert die lernende Person den Ablauf selbst?', 'Wird fertig passend zum Abschluss eingesetzt?', 'Lässt sich die Entscheidung in eine Klassenroutine übertragen?'],
    nextOptions: ['In eine echte Materialroutine übertragen.', 'Eine kurze Begründung mit Geste, Symbol oder Sprache anbieten.', 'Bei Belastung wieder Niveau B nutzen.'],
    nextStep: 'Die Karten in eine echte Klassenroutine übertragen.'
  }
};

function UKDecisionStation({ setView }) {
  const [level,setLevel] = useState('B');
  const [items,setItems] = useState(UK_LEVELS.B.initialItems);
  const [selected,setSelected] = useState('');
  const [round,setRound] = useState(1);
  const [reduced,setReduced] = useState(false);
  const [demo,setDemo] = useState(false);
  const [feedback,setFeedback] = useState('Die Karten sind bereit. Wähle in Ruhe.');
  const [teacherHelp,setTeacherHelp] = useState('Wartezeit');
  const [teacherAccess,setTeacherAccess] = useState('Antippen');
  const [teacherQuestion,setTeacherQuestion] = useState(UK_LEVELS.B.observationQuestions[0]);
  const [teacherNext,setTeacherNext] = useState('');
  const [teacherScore,setTeacherScore] = useState(5);
  const data = UK_LEVELS[level];
  const visibleIds = demo && level === 'A' ? ['mehr', 'fertig', 'nochmal'] : (reduced ? data.reducedChoices : data.choices);
  const visibleChoices = visibleIds.map(id => UK_CHOICES.find(choice => choice.id === id)).filter(Boolean);
  const material = Array.from({ length: items });
  const reset = nextLevel => {
    const nextData = UK_LEVELS[nextLevel];
    setLevel(nextLevel);
    setItems(nextData.initialItems);
    setSelected('');
    setRound(1);
    setReduced(false);
    setDemo(false);
    setFeedback('Die Karten sind bereit. Wähle in Ruhe.');
    setTeacherQuestion(nextData.observationQuestions[0]);
    setTeacherNext('');
  };
  const repeatRound = () => {
    setItems(data.initialItems);
    setSelected('');
    setRound(round + 1);
    setDemo(false);
    setFeedback('Nochmal ist okay. Die gleiche Runde startet neu.');
  };
  const chooseCard = id => {
    const choice = UK_CHOICES.find(item => item.id === id);
    setSelected(id);
    setDemo(false);
    if (id === 'mehr') {
      if (items >= data.maxItems) {
        setFeedback('Mehr ist gerade genug. Fertig oder nochmal ist möglich.');
        return;
      }
      setItems(items + 1);
      setFeedback(choice.feedback);
      return;
    }
    if (id === 'nochmal') {
      repeatRound();
      setSelected(id);
      return;
    }
    setFeedback(choice.feedback);
  };
  const support = kind => {
    if (kind === 'less') {
      setReduced(true);
      setTeacherHelp('Auswahl aus zwei Karten');
      setFeedback('Weniger Karten sind bereit. Du kannst in Ruhe wählen.');
      return;
    }
    if (kind === 'show') {
      setDemo(true);
      setTeacherHelp('Vormachen');
      setFeedback('Ich zeige es dir: mehr, fertig, nochmal.');
      return;
    }
    if (kind === 'pause') {
      setTeacherHelp('Pause / Regulation');
      setFeedback('Pause ist okay. Die Karten bleiben bereit.');
    }
  };
  return <main className="studentMode ukPlaySpace">
    <section className="ukGameHeader">
      <div>
        <p className="eyebrow">UK-Spielraum · lokal · ohne Punkte</p>
        <h1>Mehr, fertig, nochmal</h1>
        <p>{data.prompt}</p>
      </div>
      <button type="button" className="quietExit" onClick={()=>setView('uebungen')}>Zurück</button>
    </section>
    <section className="ukLevelBar" aria-label="Niveau wählen">{Object.keys(UK_LEVELS).map(k=><button key={k} type="button" className={level===k?'active ukLevel':'ukLevel'} onClick={()=>reset(k)}>{k}<span>{UK_LEVELS[k].title.replace(`${k} · `,'')}</span></button>)}</section>
    <section className="ukPlayBoard">
      <section className="ukFocus card">
        <p className="eyebrow">Tablett · Runde {round}</p>
        <h2>Kleine Aufgabe</h2>
        <p>{data.task}</p>
        <div className="ukTable" aria-label={`${items} Karten auf dem Tablett`}>
          <span className="ukRoundChip">Runde {round}</span>
          {material.map((_,i)=><span key={i} className="ukPiece">{i + 1}</span>)}
        </div>
        <div className="ukActionButtons">
          <button type="button" className="large" onClick={()=>setItems(Math.max(1, items - 1))}>Karte weg</button>
          <button type="button" className="primary large" onClick={()=>setItems(Math.min(data.maxItems, items + 1))}>Karte legen</button>
          <button type="button" className="large" onClick={repeatRound}>Neu</button>
        </div>
      </section>
      <section className="ukChoicePanel card">
        <h2>Was brauchst du?</h2>
        <div className="ukChoiceGrid">{visibleChoices.map(choice=><button type="button" key={choice.id} aria-pressed={selected===choice.id} className={selected===choice.id?`ukChoiceCard ${choice.tone} selectedTile`:`ukChoiceCard ${choice.tone}`} onClick={()=>chooseCard(choice.id)}>
          <span className="ukChoiceIcon" aria-hidden="true">{choice.icon}</span>
          <strong>{choice.label}</strong>
        </button>)}</div>
        <p className="ukFeedback" aria-live="polite">{feedback}</p>
      </section>
    </section>
    <section className="ukSupportBar">
      <button type="button" onClick={()=>{setTeacherHelp('Zeigen / Geste');setFeedback('Hilfe ist da: Erst zeigen, dann wählen.')}}>Hilfe</button>
      <button type="button" onClick={()=>support('less')}>Weniger Karten</button>
      <button type="button" onClick={()=>support('show')}>Zeig es mir</button>
      <button type="button" onClick={()=>support('pause')}>Pause</button>
      <button type="button" onClick={repeatRound}>Nochmal</button>
    </section>
    <details className="ukTeacherDrawer">
      <summary>Lehrkraft-Hinweis</summary>
      <p className="warning soft">Nur anonyme Farben/Kürzel und kurze Beobachtungen nutzen. Keine Namen, Diagnosen, Familieninfos oder Fotos. Diese Lernspur wird nicht gespeichert.</p>
      <div className="row threeCols">
        <label className="field"><span>Niveau</span><input readOnly value={data.title}/></label>
        <label className="field"><span>Hilfeform</span><select value={teacherHelp} onChange={e=>setTeacherHelp(e.target.value)}>{['Wartezeit','Zeigen / Geste','Vormachen','Auswahl aus zwei Karten','Symbolhilfe','Pause / Regulation'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Zugang</span><select value={teacherAccess} onChange={e=>setTeacherAccess(e.target.value)}>{['Blick','Zeigen','Antippen','Sprache / Gebärde','Talker / Symbol','gemeinsame Handlung'].map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <label className="field full"><span>Beobachtungsfrage</span><select value={teacherQuestion} onChange={e=>setTeacherQuestion(e.target.value)}>{data.observationQuestions.map(x=><option key={x}>{x}</option>)}</select></label>
      <div className="row twoCols">
        <label className="field"><span>Momentaufnahme 1-10</span><input type="range" min="1" max="10" value={teacherScore} onChange={e=>setTeacherScore(Number(e.target.value))}/><small>{teacherScore}/10 · nur Lehrkraft, keine Note</small></label>
        <label className="field"><span>Nächster kleiner Schritt</span><select value={teacherNext} onChange={e=>setTeacherNext(e.target.value)}><option value="">bitte auswählen</option>{data.nextOptions.map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <p><strong>Aktuelle Lernspur:</strong> {teacherHelp} · {teacherAccess} · {selected ? UK_CHOICES.find(choice=>choice.id===selected)?.teacher : 'noch keine Karte gewählt'} · {teacherQuestion} · {teacherNext || data.nextStep}</p>
    </details>
  </main>;
}


const EXERCISE_LIBRARY = [
  { id:'symbol-sortiergarten', icon:'🌿', title:'Symbol-Sortiergarten 2.0', area:'Wahrnehmen und Zuordnen', level:'A/B/C', duration:'5–10 Min.', material:'Bildkarten, echte Gegenstände optional', action:'sortieren/zuordnen', mode:'visuell + handelnd', prep:'gering', student:true, observable:true, goal:'Symbole und reale Gegenstände alltagsnah zuordnen.', observation:'Welche Hilfe macht Zuordnung möglich: echtes Material, Vormachen, Zeigen oder Wartezeit?', summary:'Symbole nach Essen, Kleidung, Ort oder Merkmal sortieren. Stark geführt, mit Hilfe und Lehrkraft-Lernspur.' },
  { id:'mengen-bis-5', icon:'🔢', title:'Mengen bis 5 legen', area:'Mengen und Zahlen', level:'A/B/C', duration:'5–8 Min.', material:'Plättchen, Muggelsteine oder Bauklötze', action:'legen, vergleichen, auswählen', mode:'konkret-handelnd + visuell', prep:'gering', student:true, observable:true, goal:'Mengen bis 5 handelnd legen, verändern und wiedererkennen.', observation:'Erkennt die lernende Person Menge über Sehen, Legen, Mitsprechen oder Modell?', summary:'Eine Zielmenge wird mit großen Plättchen gelegt. Kein Tempo, keine Punkte, ruhiges Feedback.' },
  { id:'uk-mehr-fertig-nochmal', icon:'🃏', title:'Mehr, fertig, nochmal', area:'Unterstützte Kommunikation', level:'A/B/C', duration:'3–8 Min.', material:'zentrales Tablett, Karten mehr/fertig/nochmal', action:'wählen, fortsetzen, beenden, wiederholen', mode:'UK + Spielraum', prep:'gering', student:true, observable:true, goal:'Drei alltagsnahe UK-Absichten in einer kleinen Handlungssituation nutzen.', observation:'Welche Karte wird aktiv genutzt und welche Hilfe macht die Wahl möglich?', summary:'Ruhige UK-Station mit Tablett, drei großen Karten, Hilfe, Pause und getrenntem Lehrkraftfach.' },
  { id:'student-beta', icon:'🎮', title:'Alltagsstationen: wählen, handeln, fertig', area:'Alltag und Sachunterricht', level:'A/B', duration:'3–8 Min.', material:'Alltagsmaterial, Bildkarten', action:'wählen/Handlung ausführen', mode:'handelnd + UK', prep:'mittel', student:true, observable:true, goal:'Alltagshandlungen mit Wahl, Hilfe und Abschluss strukturieren.', observation:'Welche Kommunikationsform und welche Hilfe ermöglichen Beteiligung?', summary:'Geführte Schrittfolge für echte Alltags- und UK-Situationen mit Hilfe-, Pause- und Nochmal-Karten.' },
  { id:'stationen', icon:'🧺', title:'Lehrkraft-Stationen vorbereiten', area:'Basale Förderformate', level:'A/B/C', duration:'Vorbereitung', material:'frei wählbar', action:'planen/differenzieren', mode:'Lehrkraftmodus', prep:'mittel', student:false, observable:true, goal:'Eigene Stationen mit Ziel, Material und drei Zugängen vorbereiten.', observation:'Ist die Lernhandlung konkret beobachtbar und mit passender Hilfe möglich?', summary:'Stationen mit Ziel, Material, Durchführung und Niveaus A/B/C dokumentieren.' }
];

function ExerciseLibrary({ setView }) {
  const [filters,setFilters] = useState({ area:'', level:'', student:'', text:'' });
  const areas = [...new Set(EXERCISE_LIBRARY.map(x=>x.area))];
  const list = EXERCISE_LIBRARY.filter(x => {
    const hay = `${x.title} ${x.area} ${x.level} ${x.material} ${x.action} ${x.mode} ${x.summary}`.toLowerCase();
    return (!filters.area || x.area===filters.area) && (!filters.level || x.level.includes(filters.level)) && (!filters.student || String(x.student)===filters.student) && (!filters.text || hay.includes(filters.text.toLowerCase()));
  });
  const openExercise = id => setView(id);
  return <main className="exerciseLibrary">
    <section className="card full libraryIntro libraryAppHeader">
      <div className="libraryHeroIcon" aria-hidden="true">🎮</div>
      <p className="eyebrow">Übungsbibliothek · Beta-3.0-Launcher</p>
      <h2>Spiele für alle</h2>
      <p>Die Bibliothek zeigt wenige, geprüfte Lernstationen mit Niveau, Material, Lernhandlung, Beobachtbarkeit und Schüler:innenmodus. Die 1–10-Skala bleibt im Lehrkraft-/Beobachtungskontext.</p>
      <div className="row four">
        <label className="field"><span>Lernbereich</span><select value={filters.area} onChange={e=>setFilters({...filters, area:e.target.value})}><option value="">alle</option>{areas.map(a=><option key={a}>{a}</option>)}</select></label>
        <label className="field"><span>Niveau</span><select value={filters.level} onChange={e=>setFilters({...filters, level:e.target.value})}><option value="">alle</option><option>A</option><option>B</option><option>C</option></select></label>
        <label className="field"><span>Schüler:innenmodus</span><select value={filters.student} onChange={e=>setFilters({...filters, student:e.target.value})}><option value="">alle</option><option value="true">ja</option><option value="false">nein</option></select></label>
        <label className="field"><span>Suche</span><input value={filters.text} onChange={e=>setFilters({...filters, text:e.target.value})} placeholder="Material, Handlung, Modalität …"/></label>
      </div>
      <div className="libraryStatus"><strong>{list.length}</strong> von {EXERCISE_LIBRARY.length} Übungen sichtbar. Filter und Suche wirken direkt lokal.</div>
      <button type="button" onClick={()=>setFilters({ area:'', level:'', student:'', text:'' })}>Filter zurücksetzen</button>
    </section>
    <section className="grid two full libraryGrid">{list.map(x=><article className="card exerciseCard appExerciseCard" key={x.id}>
      <div className="exerciseGameIcon" aria-hidden="true">{x.icon}</div>
      <p className="eyebrow">{x.area}</p><h2>{x.title}</h2><p>{x.summary}</p>
      <dl className="exerciseFacts"><div><dt>Ziel</dt><dd>{x.goal}</dd></div><div><dt>Niveau</dt><dd>{x.level}</dd></div><div><dt>Material</dt><dd>{x.material}</dd></div><div><dt>Lernhandlung</dt><dd>{x.action}</dd></div><div><dt>Beobachtungsfrage</dt><dd>{x.observation}</dd></div><div><dt>Dauer</dt><dd>{x.duration}</dd></div><div><dt>Modalität</dt><dd>{x.mode}</dd></div><div><dt>Vorbereitung</dt><dd>{x.prep}</dd></div><div><dt>Beobachtbar</dt><dd>{x.observable ? 'ja' : 'nein'}</dd></div></dl>
      <div className="cardActions"><button type="button" className={x.student?'primary large':'secondary'} onClick={()=>openExercise(x.id)}>{x.student ? 'Starten' : 'Detail öffnen'}</button><button type="button" onClick={()=>setView('bogen')}>Beobachtung vorbereiten</button></div>
    </article>)}{list.length===0 && <div className="card emptyState full"><strong>Keine Übung gefunden.</strong><p>Filter zurücksetzen oder mit weniger Suchbegriffen erneut prüfen.</p></div>}</section>
  </main>;
}

const MENGE_LEVELS = {
  A: { title:'A · Mengen sehen und legen', target:2, choices:[1,2], instruction:'Lege zwei Steine in das Feld.', help:'Erst echte Steine zeigen. Gemeinsam zählen ist erlaubt.', next:'Gleiche Menge mit anderem Material erneut legen.' },
  B: { title:'B · Mengen bis 4 wählen', target:3, choices:[2,3,4], instruction:'Lege drei Steine. Dann wähle die passende Menge.', help:'Bei Bedarf Auswahlfeld verkleinern oder vormachen.', next:'Menge 3 in Alltagssituation legen: drei Becher, drei Klötze.' },
  C: { title:'C · Mengen bis 5 vergleichen', target:5, choices:[3,4,5], instruction:'Lege fünf Steine und prüfe: Welche Zahl passt?', help:'Nur nutzen, wenn Menge 1–4 sicherer wirkt.', next:'Mehr/weniger mit zwei kleinen Mengen vergleichen.' }
};
function MengenBis5({ setView }) {
  const [level,setLevel] = useState('A');
  const [count,setCount] = useState(0);
  const [choice,setChoice] = useState(null);
  const [help,setHelp] = useState('Wartezeit');
  const [feedback,setFeedback] = useState('Lege Steine. Dann wähle die Menge.');
  const data = MENGE_LEVELS[level];
  const reset = next => { setLevel(next); setCount(0); setChoice(null); setFeedback('Lege Steine. Dann wähle die Menge.'); };
  const laid = Array.from({length:count});
  const correct = count === data.target && choice === data.target;
  const chooseAmount = n => { setChoice(n); setFeedback(count === data.target && n === data.target ? 'Passt. Die Menge ist gelegt.' : 'Schau in Ruhe. Du darfst nochmal legen oder Hilfe wählen.'); };
  const repeat = () => { setCount(0); setChoice(null); setFeedback('Nochmal ist okay. Lege die Steine neu.'); };
  return <main className="studentMode quantityMode quantityPlaySpace">
    <section className="quantityGameHeader"><div><p className="eyebrow">Kinder-Spielraum · keine Punkte · kein Timer</p><h1>Mengen legen</h1><p>{data.instruction}</p></div><button type="button" className="quietExit" onClick={()=>setView('uebungen')}>Zurück</button></section>
    <section className="quantityLevelBar" aria-label="Niveau wählen">{Object.keys(MENGE_LEVELS).map(k=><button key={k} type="button" className={level===k?'active quantityLevel':'quantityLevel'} onClick={()=>reset(k)}>{k}<span>{MENGE_LEVELS[k].title.replace(`${k} · `,'')}</span></button>)}</section>
    <section className="quantityGameBoard"><section className="quantityFocus card"><p className="eyebrow">Menge-Matte</p><div className="quantityMat" aria-label={`${count} gelegte Steine`}>{laid.length ? laid.map((_,i)=><span key={i} className="stone">●</span>) : <span className="emptyMat">Steine hier legen</span>}</div><div className="student-step-actions quantityActions"><button type="button" className="large" onClick={()=>setCount(current=>Math.max(0,current-1))}>Wegnehmen</button><button type="button" className="primary large" onClick={()=>setCount(current=>Math.min(5,current+1))}>Stein legen</button><button type="button" className="large" onClick={repeat}>Nochmal</button></div></section><section className="quantityChoice card"><h2>Welche Menge passt?</h2><div className="quantityChoiceGrid">{data.choices.map(n=><button type="button" key={n} className={choice===n?'quantityNumber selectedTile':'quantityNumber'} onClick={()=>chooseAmount(n)}>{n}</button>)}</div><p className="symbolFeedback" aria-live="polite">{feedback}</p></section></section>
    <section className="quantitySupportBar"><button type="button" onClick={()=>{setHelp('Vormachen');setFeedback('Hilfe ist da: Erst vormachen, dann gemeinsam legen.')}}>Hilfe</button><button type="button" onClick={()=>{setHelp('Material reduzieren');setFeedback('Weniger Auswahl ist okay.')}}>Weniger Auswahl</button><button type="button" onClick={()=>{setHelp('Pause');setFeedback('Pause ist okay.')}}>Pause</button><button type="button" onClick={repeat}>Nochmal</button><button type="button" onClick={()=>setView('dashboard')}>Lehrkraft-App</button></section>
    <details className="quantityTeacherDrawer"><summary>Lehrkraft-Hinweis</summary><p>{data.help}</p><p><strong>Aktuelle Hilfe:</strong> {help}</p><p><strong>Beobachten:</strong> Erkennt die lernende Person Menge über Sehen, Legen, Mitsprechen oder Modell? Welche Hilfe bleibt nötig?</p><p><strong>Nächster kleiner Schritt:</strong> {data.next}</p><p className="warning soft">Keine Namen, keine Speicherung, keine Bewertung. 1–10 erst später in der Beobachtungsmaske einschätzen.</p></details>
  </main>;
}

function QualityCheck() { return <main className="card"><h2>Qualitätssicherung GE</h2><ul className="qualityList"><li><strong>Ressourcenorientiert:</strong> Kompetenzen werden über beobachtbare Beteiligung, Hilfeformen und nächste kleine Schritte beschrieben.</li><li><strong>Nicht diagnostisch:</strong> 1–10 ist keine Note, kein Testwert und keine Diagnose.</li><li><strong>GE-passend:</strong> Basale, unterstützte und erweiterte Zugänge sind sichtbar.</li><li><strong>Datenschutz:</strong> Einschätzungen sind sensible pädagogische Daten; nur Kürzel/Farben nutzen.</li><li><strong>Kein Ranking:</strong> Keine Schülervergleiche, keine Ampel „bestanden/nicht bestanden“.</li></ul><p><strong>Fachlicher Hinweis:</strong> Förderplanung bleibt eine professionelle Teamentscheidung.</p></main>; }
function App() { const [view,setView] = useState('dashboard'); const [observations,setObservations] = useState(loadObservations); const [customStations,setCustomStations] = useState(loadCustomStations); const stations = useMemo(()=>[...baseStations,...customStations],[customStations]); const [activeId,setActiveId] = useState(null); const [editingId,setEditingId] = useState(null); const [copyState,setCopyState] = useState(''); const [form,setForm] = useState(EMPTY_FORM); const [filters,setFilters] = useState({ kuerzel:'', stationId:'', lernbereich:'', text:'' }); const [verlaufKuerzel,setVerlaufKuerzel] = useState(''); const [newStation,setNewStation] = useState({ title:'', ziel:'', material:'', durchfuehrung:'', basal:'', unterstuetzt:'', erweitert:'' }); const fileInput = useRef(null); const activeObs = observations.find(o=>o.id===activeId) || observations[0] || examples.observations[0]; const analysis = useMemo(()=>generateAnalysis(activeObs, stations),[activeObs, stations]); const md = useMemo(()=>toMarkdown(activeObs, stations),[activeObs, stations]); const sensitiveWarning = warnSensitive(`${form.kuerzel} ${form.konkret} ${form.gelingt} ${form.lernschritt}`); const kuerzels = [...new Set(observations.map(o=>o.kuerzel).filter(Boolean))].sort(); const filteredObservations = observations.filter(o => { const hay = `${o.konkret||''} ${o.gelingt||''} ${o.lernschritt||''} ${o.kompetenz||''} ${areaById(o.lernbereich).name} ${(o.hilfe||[]).join(' ')} ${(o.barriere||[]).join(' ')}`.toLowerCase(); return (!filters.kuerzel || o.kuerzel===filters.kuerzel) && (!filters.stationId || o.stationId===filters.stationId) && (!filters.lernbereich || o.lernbereich===filters.lernbereich) && (!filters.text || hay.includes(filters.text.toLowerCase())); }); const persist = list => { setObservations(list); saveObservations(list); }; const startNew = () => { setEditingId(null); setForm({...EMPTY_FORM, datum: today()}); setView('neu'); }; const addExample = () => { const prepared = examples.observations.map(o=>({...o, id:uid(), datum:today()})); persist([...prepared,...observations]); setActiveId(prepared[0].id); setView('auswertung'); }; const submit = e => { e.preventDefault(); const obs = { ...EMPTY_FORM, ...form, einschaetzung:Number(form.einschaetzung) }; if (editingId) { persist(observations.map(o=>o.id===editingId ? {...obs, id:editingId, updatedAt:new Date().toISOString()} : o)); setActiveId(editingId); setEditingId(null); setView('auswertung'); return; } const created = {...obs, id:uid(), createdAt:new Date().toISOString()}; persist([created,...observations]); setActiveId(created.id); setView('auswertung'); setForm({...EMPTY_FORM, datum:today()}); }; const editObservation = obs => { setEditingId(obs.id); setForm({...EMPTY_FORM, ...obs}); setView('neu'); }; const deleteObservation = obs => { if (!window.confirm('Diese Beobachtung wirklich löschen?')) return; const next = observations.filter(o=>o.id!==obs.id); persist(next); setActiveId(next[0]?.id || null); }; const exportJson = () => { const payload = { exportedAt:new Date().toISOString(), app:'GE Lernwerkstatt Beobachtungs-App', version:4, privacy:'Die Sicherung enthält sensible pädagogische Kompetenz-Einschätzungen. Nur pseudonymisierte Daten exportieren und sicher speichern.', observations }; const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`ge-lernwerkstatt-backup-${today()}.json`; a.click(); URL.revokeObjectURL(url); }; const importJson = async e => { const file = e.target.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); const incoming = Array.isArray(data) ? data : (Array.isArray(data.observations) ? data.observations : []); const byId = new Set(observations.map(o=>o.id)); const clean = incoming.filter(o=>o && !byId.has(o.id)).map(o=>({...EMPTY_FORM, ...o, id:o.id || uid()})); persist([...clean, ...observations]); alert(`${clean.length} Beobachtung(en) hinzugefügt.`); } catch { alert('JSON-Datei konnte nicht gelesen werden.'); } finally { e.target.value=''; } }; const copyMarkdown = async () => { await navigator.clipboard.writeText(md); setCopyState('Markdown kopiert. Bitte fachlich prüfen.'); setTimeout(()=>setCopyState(''),2500); }; const downloadMarkdown = () => { const blob = new Blob([md], {type:'text/markdown;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`beobachtung-${activeObs.kuerzel || 'kuerzel'}-${activeObs.datum || today()}.md`; a.click(); URL.revokeObjectURL(url); }; const printObservation = () => { setView('druck'); setTimeout(()=>window.print(),80); }; const addStation = e => { e.preventDefault(); const s = { id:`eigene-${uid()}`, title:newStation.title, pilot:newStation.title, ziel:newStation.ziel, material:newStation.material, einstieg:'Einstieg passend zur Lerngruppe ruhig vorbereiten.', durchfuehrung:newStation.durchfuehrung, basal:newStation.basal, unterstuetzt:newStation.unterstuetzt, erweitert:newStation.erweitert, hilfen:['Wartezeit','Materialreduktion','Vormachen'], beobachtungsfragen:['Welche Bedingung unterstützt Beteiligung?','Welche nächste kleine Handlung ist realistisch?'], impuls:newStation.durchfuehrung, foerderplanung:'nutzt eine vorbereitete eigene Lernwerkstattstation als Zugang zu Beteiligung und Handlung.'}; const next=[...customStations,s]; setCustomStations(next); saveCustomStations(next); setNewStation({title:'',ziel:'',material:'',durchfuehrung:'',basal:'',unterstuetzt:'',erweitert:''}); }; const isQuantityPlaySpace = view === 'mengen-bis-5'; const isChildPlaySpace = view === 'mengen-bis-5' || view === 'symbol-sortiergarten' || view === 'uk-mehr-fertig-nochmal'; return <div className={isChildPlaySpace ? 'app appPlaySpace' : 'app'}>{view !== 'druck' && !isChildPlaySpace && <><header className={view==='dashboard' ? 'top childStartTop' : 'top'}><div><p className="eyebrow">Lernwerkstatt · lokal im Browser</p><h1>{view==='dashboard' ? 'Heute spielen wir' : 'GE Lernwerkstatt Beobachtungs-App'}</h1><p>{view==='dashboard' ? 'Wähle deine Farbe. Dann starte ein Spiel. Hilfe, Pause und Nochmal sind immer erlaubt.' : 'Ressourcenorientierte Beobachtung mit Kompetenzraster, Hilfegrad, Transfer, Verlauf und Export.'}</p></div><div className="shield"><ShieldCheck size={20}/> Keine Namen · keine Diagnosen · lokale Speicherung</div></header>{view==='dashboard' ? <><nav className="studentTopNav" aria-label="Kinder-Startwege"><button type="button" className="active" onClick={()=>setView('dashboard')}>🏠 Start</button><button type="button" onClick={()=>setView('mengen-bis-5')}>🔢 Mengen legen</button><button type="button" onClick={()=>setView('symbol-sortiergarten')}>🌿 Symbol-Garten</button><button type="button" onClick={()=>setView('uk-mehr-fertig-nochmal')}>🃏 UK-Karten</button><button type="button" onClick={()=>setView('uebungen')}>🎮 Spiele für alle</button></nav><details className="teacherDrawer"><summary>Für Lehrkräfte</summary><nav className="mainNav teacherNav" aria-label="Lehrkraftbereiche"><button onClick={startNew}>Neue Beobachtung</button><button onClick={()=>setView('kompetenzraster')}>Kompetenzraster</button><button onClick={()=>setView('stationen')}>Stationen</button><button onClick={()=>setView('materialkarten')}>Materialkarten</button><button onClick={()=>setView('bogen')}>Beobachtungsbogen</button><button onClick={()=>setView('team')}>Teamgespräch</button><button onClick={()=>setView('woche')}>Nächste Woche</button><button onClick={()=>setView('auswertung')}>Auswertung / Export</button><button onClick={()=>setView('verlauf')}><Eye size={16}/> Verlauf</button><button onClick={()=>setView('qualitaet')}>GE-Qualität</button><button onClick={()=>setView('konzept')}>Konzept</button></nav></details></> : <nav className="mainNav" aria-label="Hauptbereiche"><button onClick={()=>setView('dashboard')} className={view==='dashboard'?'active':''}>Kinder-Start</button><button onClick={startNew} className={view==='neu'?'active':''}>Neue Beobachtung</button><button onClick={()=>setView('kompetenzraster')} className={view==='kompetenzraster'?'active':''}>Kompetenzraster</button><button onClick={()=>setView('uebungen')} className={view==='uebungen'?'active':''}>Übungsbibliothek</button><button onClick={()=>setView('stationen')} className={view==='stationen'?'active':''}>Stationen</button><button onClick={()=>setView('materialkarten')} className={view==='materialkarten'?'active':''}>Materialkarten</button><button onClick={()=>setView('bogen')} className={view==='bogen'?'active':''}>Beobachtungsbogen</button><button onClick={()=>setView('team')} className={view==='team'?'active':''}>Teamgespräch</button><button onClick={()=>setView('woche')} className={view==='woche'?'active':''}>Nächste Woche</button><button onClick={()=>setView('auswertung')} className={view==='auswertung'?'active':''}>Auswertung / Export</button><button onClick={()=>setView('verlauf')} className={view==='verlauf'?'active':''}><Eye size={16}/> Verlauf</button><button onClick={()=>setView('qualitaet')} className={view==='qualitaet'?'active':''}>GE-Qualität</button><button onClick={()=>setView('student-beta')} className={view==='student-beta'?'active':''}>Schüler:innenmodus Beta</button><button onClick={()=>setView('symbol-sortiergarten')} className={view==='symbol-sortiergarten'?'active':''}>Symbol-Sortiergarten</button><button onClick={()=>setView('uk-mehr-fertig-nochmal')} className={view==='uk-mehr-fertig-nochmal'?'active':''}>UK-Karten</button><button onClick={()=>setView('mengen-bis-5')} className={view==='mengen-bis-5'?'active':''}>Mengen bis 5</button><button onClick={()=>setView('konzept')} className={view==='konzept'?'active':''}>Konzept</button></nav>}</>}{view==='dashboard' && <Dashboard observations={observations} setView={setView} setActiveId={setActiveId} addExample={addExample} startNew={startNew}/>} {view==='neu' && <ObservationForm form={form} setForm={setForm} stations={stations} sensitiveWarning={sensitiveWarning} editingId={editingId} onSubmit={submit} onCancel={()=>{setEditingId(null);setView('auswertung');}}/>} {view==='kompetenzraster' && <Kompetenzraster/>} {view==='uebungen' && <ExerciseLibrary setView={setView}/>} {view==='mengen-bis-5' && <MengenBis5 setView={setView}/>} {view==='materialkarten' && <MaterialCards stations={stations}/>} {view==='bogen' && <Beobachtungsbogen stations={stations}/>} {view==='team' && <Teamgespraech observations={observations}/>} {view==='woche' && <NaechsteWoche observations={observations} stations={stations}/>} {view==='qualitaet' && <QualityCheck/>} {view==='student-beta' && <StudentModeBeta setView={setView}/>} {view==='symbol-sortiergarten' && <SymbolSortiergarten setView={setView}/>} {view==='uk-mehr-fertig-nochmal' && <UKDecisionStation setView={setView}/>} {view==='stationen' && <main><section className="card"><h2>Eigene Stationen vorbereiten</h2><p className="assist">Die Grundstationen bleiben fest eingebaut. Zusätzlich können eigene Stationen lokal gespeichert werden.</p><form className="miniForm" onSubmit={addStation}><input required placeholder="Titel" value={newStation.title} onChange={e=>setNewStation({...newStation,title:e.target.value})}/><input required placeholder="Ziel" value={newStation.ziel} onChange={e=>setNewStation({...newStation,ziel:e.target.value})}/><textarea required placeholder="Material" value={newStation.material} onChange={e=>setNewStation({...newStation,material:e.target.value})}/><textarea required placeholder="Ablauf / Durchführung" value={newStation.durchfuehrung} onChange={e=>setNewStation({...newStation,durchfuehrung:e.target.value})}/><textarea required placeholder="Basal" value={newStation.basal} onChange={e=>setNewStation({...newStation,basal:e.target.value})}/><textarea required placeholder="Unterstützt" value={newStation.unterstuetzt} onChange={e=>setNewStation({...newStation,unterstuetzt:e.target.value})}/><textarea required placeholder="Erweitert" value={newStation.erweitert} onChange={e=>setNewStation({...newStation,erweitert:e.target.value})}/><button className="primary">Eigene Station lokal speichern</button></form></section><section className="grid three stationGrid">{stations.map(s=><section className="card station" key={s.id}><h2>{s.title}</h2><p><strong>Ziel:</strong> {s.ziel}</p><p><strong>Material:</strong> {s.material}</p><p><strong>Durchführung:</strong> {s.durchfuehrung}</p><div className="levels"><p><strong>Basal:</strong> {s.basal}</p><p><strong>Unterstützt:</strong> {s.unterstuetzt}</p><p><strong>Erweitert:</strong> {s.erweitert}</p></div></section>)}</section></main>} {view==='auswertung' && <main className="grid two"><FilterPanel filters={filters} setFilters={setFilters} stations={stations} kuerzels={kuerzels}/><section className="card"><h2>Beobachtung auswählen</h2>{observations.length===0 && <p>Es sind noch keine gespeicherten Beobachtungen vorhanden. Beispielauswertung wird angezeigt.</p>}{filteredObservations.map(o=><button className={activeObs.id===o.id?'listitem selectedItem':'listitem'} key={o.id} onClick={()=>setActiveId(o.id)}><strong>{o.kuerzel} · {o.datum}</strong><span>{areaById(o.lernbereich).name} · {o.kompetenz}</span><small>{o.einschaetzung}/10 · {scaleMeaning(o.einschaetzung)}</small></button>)}</section><section className="card"><h2>Auswertung</h2><div className="actions"><button onClick={()=>editObservation(activeObs)}><Pencil size={18}/> Bearbeiten</button>{observations.some(o=>o.id===activeObs.id) && <button className="danger" onClick={()=>deleteObservation(activeObs)}><Trash2 size={18}/> Löschen</button>}</div><CompetencyBadge obs={activeObs}/><h3>Beobachtung</h3><p>{analysis.beobachtung}</p><h3>Interpretation</h3><p>{analysis.interpretation}</p><h3>Annahme</h3><p>{analysis.annahme}</p><h3>Empfehlung</h3><p>{analysis.empfehlung}</p><h3>Bericht</h3><ul><li>{analysis.ressourcen}</li><li>{analysis.wirksameHilfe}</li><li>{analysis.barriere}</li><li>Nächster Lernschritt: {analysis.lernschritt}</li><li>Nächste Beobachtungsfrage: {nextQuestion(activeObs)}</li></ul><h3>Förderimpulse</h3>{analysis.impulse.map((i,idx)=><details key={idx} open={idx===0}><summary>Förderimpuls {idx+1}: {i.ziel}</summary><p><strong>Material:</strong> {i.material}</p><p><strong>Einstieg:</strong> {i.einstieg}</p><p><strong>Durchführung:</strong> {i.durchfuehrung}</p><p><strong>Hilfeform:</strong> {i.hilfeform}</p><ul><li><strong>Basal:</strong> {i.basal}</li><li><strong>Unterstützt:</strong> {i.unterstuetzt}</li><li><strong>Erweitert:</strong> {i.erweitert}</li></ul><p><strong>Beobachtungsfrage:</strong> {i.beobachtungsfrage}</p><p><strong>Alltagstransfer:</strong> {i.alltagstransfer}</p><p><strong>Förderplan:</strong> {i.foerderplanung}</p></details>)}<h3>Export</h3><div className="actions"><button onClick={copyMarkdown}><Clipboard size={18}/> Markdown kopieren</button><button onClick={downloadMarkdown}><Download size={18}/> Markdown herunterladen</button><button onClick={printObservation}><Printer size={18}/> Druckansicht</button><button onClick={exportJson}><Download size={18}/> JSON-Backup</button><button onClick={()=>fileInput.current?.click()}><Upload size={18}/> JSON importieren</button><input hidden ref={fileInput} type="file" accept="application/json" onChange={importJson}/></div>{copyState && <p className="success">{copyState}</p>}<pre className="markdownPreview">{md}</pre></section></main>} {view==='verlauf' && <Verlauf observations={observations} selected={verlaufKuerzel} setSelected={setVerlaufKuerzel}/>} {view==='druck' && <main className="printPage"><button className="noPrint" onClick={()=>setView('auswertung')}>Zurück</button><h1>Lernwerkstatt-Beobachtung</h1><p className="printHint">Pseudonymisierte pädagogische Notiz. Keine Diagnose. 1–10 ist keine Note.</p><section><h2>Basisdaten</h2><p><strong>Datum:</strong> {activeObs.datum} · <strong>Kürzel:</strong> {activeObs.kuerzel} · <strong>Lernbereich:</strong> {areaById(activeObs.lernbereich).name}</p><p><strong>Kompetenz:</strong> {activeObs.kompetenz} · <strong>Einschätzung:</strong> {activeObs.einschaetzung}/10 ({scaleMeaning(activeObs.einschaetzung)})</p><p><strong>Hilfegrad:</strong> {activeObs.hilfegrad} · <strong>Transfer:</strong> {activeObs.transfer}</p></section><section><h2>Konkrete Beobachtung</h2><p>{activeObs.konkret || activeObs.gelingt}</p></section><section><h2>Pädagogische Einordnung</h2><p>{analysis.interpretation}</p><p>{analysis.annahme}</p><p><strong>Nächste Beobachtungsfrage:</strong> {nextQuestion(activeObs)}</p><p><strong>Nächster Lernschritt:</strong> {analysis.lernschritt}</p><p><strong>Förderplan-Notiz:</strong> {analysis.foerderplanung}</p></section></main>} {view==='konzept' && <main className="card"><h2>App-Konzept und MVP-Grenzen</h2><p><strong>Ziel:</strong> Lehrkräfte erfassen pseudonymisierte Beobachtungen mit Kompetenzraster, Hilfegrad, Transfer und pädagogischer 1–10-Einschätzung.</p><p><strong>Kernfunktionen:</strong> Dashboard, Kompetenzraster, Beobachtungsformular, Auswertung, Verlauf, Druck, Markdown/JSON-Export und GE-Qualitätscheck.</p><p><strong>Grenzen:</strong> Kein Login, keine Cloud, keine medizinische/psychologische Diagnostik, keine Regelschulnorm, keine automatische Förderplanentscheidung, kein Ranking.</p><h3>Datenmodell</h3><pre>{`Observation: id, datum, kuerzel, lerngruppe?, stationId, situation, setting, lernbereich, kompetenz, einschaetzung(1-10), sicherheit, hilfegrad, transfer, konkret, gelingt, hilfe[], kommunikation[], barriere[], lernschritt, createdAt?, updatedAt?\nKompetenzraster: Lernbereich, Kompetenzen[], Indikatoren[], Beobachtungsfragen[]\nBackup: { exportedAt, app, version, privacy, observations[] }`}</pre></main>}</div>; }

createRoot(document.getElementById('root')).render(<App />);
