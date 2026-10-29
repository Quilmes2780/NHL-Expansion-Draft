# PLAN – "Team 33 – NHL Expansion Draft GM"

Status: **M1–M6 abgeschlossen** (je ein Commit). Als Nächstes: M7 Playoffs, Saisonabschluss, Newsfeed, Owner/Fans.

Abweichungen/Ergänzungen gegenüber dem Plan:
- Kein ESLint; die Engine-Regeln (keine UI-Imports, kein `Math.random`/`Date.now`/DOM) prüft ein Architekturtest.
- Der Build erzeugt eine einzige inline-`dist/index.html` (vite-plugin-singlefile), die auch per `file://` läuft.
- Draft Board hat zusätzlich „Rest auto-füllen“: füllt offene Teams nur auf Basis der gescouteten Spannen (keine echten Werte).
- Spielstände werden noch nicht gespeichert (M8) – ein Reload startet neu.
- M4: Verhandlungen und Side Deals bilden eine gemeinsame Phase „Verhandlungen“ zwischen Reveal und Draft Board;
  bis zur Abgabe kann man frei zwischen Reveal, Verhandlungen und Board wechseln. Die Rollenversprechen werden
  gespeichert und sollen in M6 (Moral) wirken.
- M5: Payroll zählt jetzt One-Way-Verträge im Farmteam (kein „Vergraben“ von Gehalt). Nach dem Expansion Draft
  wird der NHL-Kader positionsausgewogen gewählt (2 G, 8 D, 13 F). Die Offseason ist eine Phase mit vier Tabs;
  die Trade-Logik wird in M6 bis zur Deadline wiederverwendet. KI-initiierte Trade-Angebote sind noch nicht drin.
- M6: Kein Web Worker nötig – eine komplette Saison simuliert in ~1–2 s; die UI simuliert in Häppchen und bleibt
  bedienbar. Box Scores werden nur für eigene Spiele gespeichert. OT-Quote ~17 % (keine Score-Effekte/Empty-Netter).
  Rollenversprechen wirken noch nicht auf die Moral (kommt mit M7 zusammen mit Fan-/Owner-Stimmung).
  `playersOfTeam` ist per Player-Record gecacht – Player-Records daher nie in-place verändern.
- Generator: Cap Hits beim Payroll-Fitting auf max. 2× Marktwert begrenzt; fehlt dann Payroll bis zum Floor,
  verlängern Teams einige ihrer pending FAs.

---

## 1. Architektur-Überblick

```
src/
  engine/                 # reine TS-Logik, keine React/DOM-Imports (per ESLint-Regel erzwungen)
    config/               # LeagueConfig, Regelsets (seattle2021, vegas2017, custom), Defaults
    rng/                  # geseedeter PRNG (sfc32 + splitmix-Seeding), Sub-Streams pro Domäne
    model/                # Typen: Player, Contract, Team, League, DraftPick, GameState …
    gen/                  # Namen (Nationalitäten), Spieler, Teams, Verträge, Liga, Städte
    expansion/            # Eligibility, Schutzlisten-KI, Validierung, Scouting/FoW,
                          # Verhandlung, Side Deals, Mock-Draft, Bewertung (Noten A–F)
    offseason/            # Lotterie, Entry Draft, Free Agency, Trade-Bewertung, Aufstellung
    sim/                  # Spielplan, Spielsimulation (xG/Poisson), Saison, Playoffs
    world/                # Verletzungen, Form, Chemie, Moral, News, Fans/Owner, Awards, Achievements
    io/                   # Serialisierung, Import-Schema (Zod-frei: eigener Validator), Versionierung
    index.ts              # öffentliche API der Engine
  store/                  # Zustand-Stores (dünne Hülle um Engine-Aufrufe), Persistenz (IndexedDB/LS)
  ui/
    components/           # Tabellen, Spielerkarte, Tooltips, Ampeln, Logo-Baukasten (SVG)
    screens/              # Gründung, Draft (Reveal, Scouting, Board, Verhandlung, Deals, Abend),
                          # Offseason, Saison, Playoffs, Bilanz, Einstellungen, Achievements
    i18n/de.ts            # alle UI-Texte zentral (Deutsch, Hockey-Begriffe englisch)
tests/ (bzw. *.test.ts neben den Modulen)
```

Leitprinzipien
- **Determinismus:** Kein `Math.random`, kein `Date.now()` in der Engine (Lint-Regel). Jede Entscheidung des
  Spielers ist eine serialisierbare *Action*; GameState = f(Seed, Actions). Damit sind „gleicher Seed +
  gleiche Entscheidungen = identisches Ergebnis“ und Replays/Tests trivial prüfbar.
- **Sub-Streams:** Pro Domäne (Generierung, Draft-KI, Simulation Spiel N …) ein abgeleiteter RNG-Stream,
  damit z. B. ein zusätzlicher Scouting-Klick nicht die gesamte Saisonsimulation verschiebt.
- **Engine-State immutable-ish:** Engine-Funktionen nehmen State + Action und geben neuen State zurück;
  Zustand hält nur den aktuellen State und die Action-Historie.
- **Performance:** Saisonsimulation läuft in einem Web Worker (Engine ist DOM-frei, daher direkt nutzbar),
  damit „schnell simulieren“ die UI nicht blockiert.

## 2. Zentrale Config (Defaults)

| Parameter | Default |
|---|---|
| Saison | 2027-28 |
| Salary Cap | 113,5 Mio. $ |
| Cap Floor | 74 % des Caps (≈ 84,0 Mio. $) |
| Bestehende Teams | 32 (+ Expansionsteam = 33) |
| Kader | 23 aktiv (max), ~10 Prospects/Farmteam, Vertragslimit 50 |
| Spiele | 82, Trade Deadline nach ~75 % des Spielplans |
| Regelset | `seattle2021` |
| Expansion-Kader | 32 Picks, ≥14 F, ≥9 D, ≥3 G, ≥20 mit Vertrag, Cap Hits 60–100 % des Caps |

## 3. Meilensteine

Jeder Meilenstein endet lauffähig (`npm run dev`, `npm run build`, `npm test`, `tsc --noEmit` grün) mit Commit.

### M1 – Setup, Config, PRNG, Datenmodell, Liga-Generator
- Vite + React + TS strict, Tailwind, Zustand, Vitest, ESLint (inkl. Engine-Importverbot für React/DOM).
- PRNG mit Seed-String → Hash, Sub-Streams, Hilfsfunktionen (int, pick, weighted, normal, shuffle).
- Datenmodell vollständig typisiert (Spieler, Vertrag, Team, Picks, Liga, Saisonstatistik).
- Namensgenerator (CA, US, SE, FI, RU, CZ, SK, DE, CH, LV, DK, NO, AT … gewichtet nach realistischer Verteilung).
- Spielergenerator: Attribute je Position/Archetyp, OVR-Formel, Potential, Alterskurve.
- Vertragsgenerator: Cap Hits nach OVR/Alter, Restlaufzeit, UFA/RFA, NMC/NTC, ELCs.
- Liga-Generator: 32 Teams (fiktive Namen), je ~23 aktiv + ~10 Prospects, Caps zwischen Floor und Cap,
  KI-GM-Persönlichkeiten, Picks 3 Jahre, Vorsaison-Spielzahlen/Statistiken.
- **Garantie Exposure-Erfüllbarkeit:** Nach Generierung Prüfung + Reparatur pro Team (z. B. Vertrag eines
  Veteranen verlängern / Spielzahl anpassen), Test über 1000 Seeds.
- Minimal-UI: Seed eingeben, Liga generieren, Teams/Kader als Tabelle ansehen (Debug-Screen).

### M2 – Expansion-Draft-Regelengine, KI-Schutzlisten, Validierung
- Eligibility (Profijahre, ungesignte Picks), NMC-Pflichtschutz (inkl. Waiver-Option), Schutzschemata 7-3-1 / 8-1.
- Schutzlisten-KI: Wert-Score (OVR, Potential, Alter, Vertrag/Cap-Effizienz) × Persönlichkeit
  (Rebuild ↔ Jugend, Contender ↔ Jetzt-Stärke, Cap-gebunden ↔ teure Verträge loswerden); Wahl 7-3-1 vs. 8-1
  per Optimierung; Reparaturschritt für Exposure-Regeln.
- Validierung der Expansionsliste mit präzisen, regelbezogenen Fehlercodes + deutschen Meldungen.
- KI-Mock-Draft (Greedy + lokale Suche unter Constraints), auch als Referenz für Noten.
- Tests: Jede KI-Schutzliste erfüllt alle Regeln (viele Seeds, alle Regelsets); Mock-Draft ist immer gültig;
  Validierer erkennt jede einzelne Regelverletzung; Determinismus.

### M3 – Draft-UI
- Phasen-Navigation mit Fortschrittsanzeige; Gründungs-Screens (Stadt, Name, Farben, Logo-Baukasten, Mandat,
  Divisions-Neueinteilung).
- Schutzlisten-Reveal (inszeniert, Analysten-Kommentare zu Überraschungen).
- Scouting mit Fog of War (Spannen, Budget, Einengung).
- Draft Board: 32 Teams, Filter/Sortierung, Wunschliste, Spielervergleich, Spielerkarte (Modal).
- Constraint-Tracker mit Ampeln; Abgabe-Validierung.
- Draft-Abend: animierte Verkündung, Noten A–F pro Pick + gesamt, Vergleich „Was die KI gewählt hätte“.
- Tooltips zu allen Regeln.

### M4 – Verhandlungsfenster + Side Deals
- Verhandlungs-Mini-Spiel: Spieler hat verdeckte Erwartung (Gehalt, Laufzeit, Rolle); Stadtfaktoren
  (Markt, Tradition, Steuer, Reisen) + Mandat beeinflussen Bereitschaft; begrenzte Runden, Stimmung.
  Unterschrift = Pick vom jeweiligen Team (sperrt weitere Picks dieses Teams).
- Side Deals: KI-GMs generieren Angebote („Nimm Spieler X → 2. Runde“, „Nimm Y nicht → Prospect“),
  annehmen/ablehnen, bindend, Validierung + Vollzug beim Abschluss, Konflikterkennung im Tracker.

### M5 – Offseason
- Draft-Lotterie (Expansionsteam = Quoten des drittschlechtesten Teams), Entry Draft (vereinfachte Prospects, FoW).
- Free Agency mit KI-Mitbietern (Angebot = f(Bedarf, Cap-Raum, Persönlichkeit)); Spielerentscheidung nach
  Geld, Rolle, Stadtfaktoren.
- Trades: Wertmodell (Spielerwert, Alter, Vertrag, Picks, Teamstrategie) mit KI-Aufschlag; Anti-Exploit-Tests
  (z. B. „viele Schrottspieler gegen einen Star“ wird abgelehnt, Wert-Diminishing-Returns).
- Aufstellung: 4 Sturmreihen, 3 D-Paare, Goalie-Tandem, PP1/2, PK1/2, C/A; Auto-Aufstellung.

### M6 – Spiel- und Saisonsimulation
- Spielplan-Generator 82 Spiele für 33 Teams (Division/Conference-Gewichtung, Heim/Auswärts ausgeglichen,
  Back-to-Backs, Reisedistanzen aus Stadtkoordinaten).
- Spiel-Engine: Segmente pro Periode, Reihen nach Eiszeit, Schussvolumen & xG je Situation (5v5, PP, PK),
  Heimvorteil, Goalie-Tagesform, Strafen, OT 3v3, Shootout; optionaler Kurz-Ticker.
- Dynamik: Verletzungen + Farmteam-Ersatz, Form/Streaks, Ermüdung, Chemie, Misfits-Bonus.
- Saisonmanagement: Wochen-/Deadline-/Ende-Sim, Trades bis Deadline, Waiver, Call-ups, Goalie-Rotation.
- Tabellen (Punkte, ROW, Tordifferenz, Tiebreaker), Statistiken (Scorer, Goalies, Team).
- **Kalibrierungstest:** 100 Saisons headless → Tore/Team/Spiel ≈ 2,9–3,2; SV% .900–.910; Punkte-Spreizung
  der Teams (~60–120), OT-Quote ~20–25 %, PP% ~20 %.

### M7 – Playoffs, Saisonabschluss, Meta
- Playoff-Seeding (Top 3 je Division + 2 WC je Conference), 4 Runden Best-of-7, Bracket-Ansicht.
- Newsfeed (Template-basierte Schlagzeilen), Fan-Stimmung, Zuschauer (Arena-Kapazität), Owner-Zufriedenheit
  vs. Mandat.
- Saisonbilanz, fiktive Trophäen, Draft-Rückblick (beste/schlechteste Picks), Achievements, Neustart (Seed).

### M8 – Persistenz, Import/Export, Feinschliff
- Speicherslots in IndexedDB (Fallback localStorage), JSON-Export/Import (Spielstand + Ligadaten), Versionsfeld.
- Dokumentiertes Import-Schema für eigene Ligadaten (README), Validator mit verständlichen Fehlern.
- Tutorial (optional, kurz), Einstellungen (Regelset, KI-Stärke, Sim-Speed, Seed), Achievement-Übersicht.
- End-to-End-Durchlauf-Test headless (Gründung → Bilanz mit Auto-Entscheidungen), Konsolenfehler-Check,
  Offline-Build-Check.

## 4. Teststrategie
- Engine-Unit-Tests je Modul (Vitest), Property-artige Tests über viele Seeds.
- Regelkonformität: alle KI-Schutzlisten, alle Mock-Drafts, Validator-Negativtests pro Regel.
- Reproduzierbarkeit: Seed + Action-Log → identischer State-Hash (Generierung, Draft, ganze Saison).
- Plausibilität: 100 Saisons headless mit Verteilungsprüfungen (läuft als eigenes, längeres Test-Target).
- Headless-Gesamtdurchlauf als Smoke-Test.

## 5. Annahmen (bitte widersprechen, falls falsch)
1. **Bestehende 32 Teams** spielen in echten nordamerikanischen Städten mit **fiktiven Teamnamen/Farben**
   (keine echten Marken). Die 12 Expansionsstädte sind dann nicht doppelt belegt.
2. **33 Teams:** 2 Conferences (16/17), 4 Divisionen (8/8/8/9). Neueinteilung per Geografie (Clustering nach
   Koordinaten mit Balance-Bedingung); ggf. wechselt ein Team die Conference.
3. **Regelset „Vegas 2017“:** Die realen Kernregeln von 2017 und 2021 sind praktisch identisch (Schutzschemata,
   Exemptions, Exposure, 14/9/3, 20 Verträge, 60–100 % Cap). Ich bilde Vegas daher als eigenes Preset mit
   denselben Kernregeln ab und erfinde keine Unterschiede. **„Custom“** macht alle Zahlen frei einstellbar
   (Schutzschemata, Exposure-Kriterien, Kaderminima, Cap-Korridor, Exempt-Profijahre).
4. **Vereinfachungen:** Keine Arbitration, keine Buyouts, keine LTIR-Feinheiten, keine Bonus-Overages; Waiver
   ohne Re-Entry. Farmteam wird nicht simuliert (nur Entwicklung + Verfügbarkeit).
5. **Entwicklung über die Saison:** leichte Attributveränderungen nach Alter/Potential, Hauptsprung in der
   Offseason (relevant nur für Saison 1 + Rückblick).
6. Kein Multi-Saison-Modus über die erste Saison hinaus (nur Bilanz + Neustart), wie spezifiziert.

## 6. Geklärte Punkte
- Toolchain: Node.js LTS + Git werden per winget installiert.
- Arbeitsweise: M1–M3 durcharbeiten (je ein Commit), dann Review durch den Auftraggeber.
- Annahmen in Abschnitt 5 bestätigt.
