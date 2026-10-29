# Team 33 – Expansion Draft GM

Browserbasiertes Single-Player-Managementspiel: Du gründest das 33. Franchise einer fiktiven, NHL-ähnlichen Liga
und baust deinen Kader über einen regelkonformen Expansion Draft auf. Alle Teams, Spieler und Namen sind prozedural
generiert – keine echten Logos, Marken oder Spieler.

**Stand:** Alle Meilensteine M1–M8 umgesetzt (siehe [PLAN.md](PLAN.md)): kompletter Durchlauf Gründung → Draft →
Offseason → 82 Spiele → Playoffs → Saisonbilanz, Speicherstände mit Autosave, JSON-Import/-Export, Tutorial.

## Spielstände, Einstellungen, Tutorial

- **☰ Menü** (oben rechts) → *Spielstände*: Autosave (nach jeder Änderung, ~2 s verzögert) plus drei manuelle Plätze,
  gespeichert in IndexedDB (Fallback: localStorage). „Als Datei exportieren“ / „Spielstand-Datei importieren“
  (Format `team33-save`, Version 1) für Backups oder andere Rechner. Auf dem Startbildschirm: „Fortsetzen“.
- *Einstellungen*: Simulations-/Animationsgeschwindigkeit (Reveal, Draft-Abend, Ticker), Kurz-Ticker, Misfits-Bonus,
  Tutorial-Hinweise an/aus/zurücksetzen. Regelset, Seed und Schwierigkeit (Scouting-Budget, KI-Aufschlag bei Trades)
  werden beim Start einer neuen Liga gewählt.
- *Achievements*: Übersicht über alle Spiele in diesem Browser.
- **Tutorial:** kurze Hinweiskarte beim ersten Besuch jeder Phase; die ?-Symbole erklären überall die Regeln.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Vitest (Engine-Tests, inkl. 100-Saisons-Kalibrierung, dauert ~2–3 Min.)
npm run build      # Typecheck + statisches Bundle in dist/
```

`npm run build` erzeugt eine einzige, vollständig inline gebaute `dist/index.html`. Sie läuft offline – auch direkt per
Doppelklick (`file://`), ohne Server.

## Spielablauf (aktueller Stand)

1. **Neue Liga:** Seed, Regelset (Seattle 2021 / Vegas 2017 / Custom mit frei einstellbaren Parametern), Schwierigkeit
   (bestimmt das Scouting-Budget).
2. **Franchise-Gründung:** 12 Städte mit Marktgröße, Tradition, Arena, Steuervorteil und Reisebelastung; Teamname,
   Kürzel, Farben, SVG-Logo-Baukasten; Owner-Mandat. Die Divisionen werden geografisch neu eingeteilt.
3. **Schutzlisten-Reveal:** 32 KI-GMs schützen nach Wert, Alter, Vertrag, Cap und Persönlichkeit; Analysten
   kommentieren Überraschungen.
4. **Verhandlungen & Side Deals:**
   - *Exklusives Fenster:* Mit exponierten pending UFAs/RFAs verhandeln (Gehalt, Laufzeit, Rollenversprechen).
     Jeder Spieler hat verdeckte, geseedete Erwartungen; der Agent nennt nur Spannen. Stadtfaktoren (Steuer, Markt,
     Tradition, Reisen) und das Owner-Mandat verschieben die Bereitschaft. Antworten: Zusage, Gegenangebot, Ablehnung
     oder Abbruch (max. 4 Angebote, Stimmung sinkt). Eine Unterschrift zählt als fester Pick von diesem Team.
   - *Side Deals:* KI-GMs bieten Picks/Prospects, damit du einen teuren Vertrag nimmst („Nimm ihn“) oder einen
     Spieler in Ruhe lässt („Nimm ihn nicht“). Zusagen sind bindend, werden bei der Abgabe validiert und beim
     Draft-Abschluss vollzogen (Asset wechselt zum Expansionsteam). Konflikte (z. B. Unterschrift + Deal beim selben
     Team) werden verhindert.
5. **Draft Board:** alle exponierten Spieler mit Filter/Sortierung, Wunschliste, Vergleich (bis 3), Spielerkarte,
   Fog-of-War-Scouting und permanentem Constraint-Tracker mit Ampeln. Ungültige Listen werden mit präziser
   Regelangabe abgelehnt.
6. **Draft-Abend:** animierte Verkündung, Noten A–F pro Pick (inkl. Wert erhaltener Deal-Assets), Gesamtnote.
7. **Bilanz:** Vergleich mit dem KI-Mock-Draft („Was die KI gewählt hätte“ – ohne Deals und Unterschriften),
   beste Picks, verpasste Chancen, Unterschriften und erhaltene Assets.

8. **Offseason:**
   - *Lotterie & Entry Draft:* Das Expansionsteam bekommt die Quoten des drittschlechtesten Teams (2 Ziehungen,
     max. 10 Plätze Sprung). 7 Runden; die KI pickt bis du dran bist. Prospects nur als Spannen, eigenes
     Scouting-Budget; Auto-Pick nutzt nur gescoutete Werte.
   - *Free Agency:* KI-Teams verlängern zuerst einen Teil ihrer pending FAs, der Rest geht auf den Markt. Über
     5 Tage bieten du und die KI (nach Bedarf und Cap Space); jeder Spieler wählt das für ihn beste Angebot (Geld,
     Laufzeit, Rolle, Team-/Stadtfaktor). Offene Angebote blockieren Cap Space. Eigene pending RFAs verlängerst du
     exklusiv per Verhandlung.
   - *Trades:* Die KI bewertet Spieler exponentiell (Stars ≫ Tiefe) nach ihrer Strategie, Pakete mit abnehmendem
     Grenznutzen, verlangt einen Aufschlag (je nach Schwierigkeit 5–30 %), prüft Cap, 50-Vertrags-Limit und
     Goalie-Tiefe. NTC/NMC-Spieler sind nicht handelbar.
   - *Kader & Aufstellung:* NHL-Kader (max. 23) vs. Farmteam, 4 Sturmreihen, 3 Verteidigerpaare, Goalie-Tandem,
     PP1/PP2, PK1/PK2, Kapitän/Assistenten; Auto-Aufstellung; Positionsstrafen für Spieler außerhalb ihrer Position.
   - Vor dem Saisonstart prüft das Spiel Kadergröße (20–23, ≥ 12 F, ≥ 6 D, ≥ 2 G), Cap Floor/Cap und Aufstellung.

9. **Saison (82 Spiele):**
   - *Spielplan:* jedes Team 82 Spiele, exakt 41 heim/41 auswärts, Division-Rivalen 4×, sonst min. 2×; Back-to-Backs
     kommen vor, drei Spiele in drei Tagen nie. Trade Deadline nach ~72 % der Spiele.
   - *Simulation:* Tag, Woche, bis Deadline oder bis Saisonende; eigene Spiele optional mit Kurz-Ticker
     (Tore, Strafen, Verletzungen) und Spielbericht.
   - *Kader:* Verletzungen mit automatischen Ersatz-Call-ups aus dem Farmteam, Goalie-Rotation (automatisch/Starter/
     abwechselnd), Waivers beim Runterschicken von One-Way-Spielern (KI-Teams können claimen), Trades bis zur Deadline.
   - *Tabellen & Statistiken:* Divisionen, Wildcard, Conferences, Liga (Punkte, P%, ROW, Tordifferenz, L10, Serie);
     Scorer, Goalies, Teamwerte (PP%, PK%, Schüsse).

10. **Owner, Fans & Newsfeed:** Fan-Stimmung reagiert auf jedes Spiel (Heimsiege und Playoffs zählen mehr) und
    pendelt zur Hockey-Tradition der Stadt zurück; daraus folgt die Zuschauerzahl (Arena-Kapazität). Die
    Owner-Zufriedenheit wird wöchentlich am Mandat gemessen (Sofort Playoffs: Punkteschnitt/Playoff-Platz;
    Geduldiger Aufbau: Entwicklung und Fans; Budget-Owner: Cap Space und Auslastung). Rollenversprechen aus dem
    Verhandlungsfenster wirken auf Moral und Form. Der Newsfeed generiert Schlagzeilen (erster Sieg, Hattricks,
    Shutouts, Serien, lange Verletzungen, Trade Deadline, Playoff-Serien, Meister).
11. **Playoffs:** Top 3 je Division + 2 Wildcards je Conference, 4 Runden Best-of-7, Heimrecht 2-2-1-1-1 für das in
    der Saison bessere Team, Overtime als 20-Minuten-Sudden-Death (kein Shootout). Bracket-Ansicht, Playoff-Scorer.
12. **Saisonbilanz:** Owner-Note (A–F) mit Urteil, Bilanz und Playoff-Ergebnis, Fans/Zuschauer, fiktive Trophäen
    (Northern Star Trophy, Golden Stick, Sniper Award, Iron Mask Award, Blue Line Trophy, Rising Star Award,
    Gentleman Cup), Expansion-Draft-Rückblick (beste/schlechteste Picks), 18 Achievements, Neustart mit gleichem
    oder neuem Seed.

### Spiel-Engine

- Teamstärke aus Reihen-Ratings, gewichtet nach Eiszeit (Sturmreihen 35/30/22/13 %, Verteidigerpaare 42/35/23 %),
  inkl. Positionsstrafen, Form, Teamchemie und optionalem Misfits-Bonus (+2 in den ersten 20 Spielen).
- 5v5-Schüsse ~ Poisson(λ) mit λ abhängig von Offensive vs. Defensive, Heimvorteil und Spieltags-Varianz; Strafen
  ~ Poisson(3,1) je Team, jede Strafe ein Powerplay mit eigenen Schüssen (PP-Tor beendet die Strafe).
- Torwahrscheinlichkeit je Schuss (xG-artig) aus Schütze, Spielsituation und Goalie-Tagesform.
- Ermüdung durch Back-to-Backs und lange Reisen; Overtime 3-gegen-3 (5 Min.), danach Shootout.
- Kalibrierung (Test über 100 Saisons): ~3,0 Tore pro Team und Spiel, Fangquote ~.904, PP ~20 %,
  Heimsiegquote ~51–53 %, Punktestreuung ~55–120. Die OT-Quote liegt bei ~17 % (NHL ~22 %, dort zusätzlich
  durch Score-Effekte und Empty-Net-Tore getrieben, die hier nicht modelliert sind).

## Architektur

```
src/
  engine/          reine TypeScript-Spiellogik, keine UI-Abhängigkeiten
    rng.ts         geseedeter PRNG (sfc32 + cyrb128), Sub-Streams via rngFor(seed, ...keys)
    config.ts      LeagueConfig + Regelsets (alle Ligaparameter zentral)
    model.ts       Datenmodell (Player, Contract, Team, DraftPick, League …)
    value.ts       OVR-Formel, Marktwert, Projektion, Vertrags-Surplus
    franchise.ts   Franchise-Gründung, geografische Neueinteilung
    gen/           Spieler- und Liga-Generator
    data/          Städte, Namenspools
    expansion/     Eligibility, Schutzlisten (Validierung + KI), Auswahl-Validierung,
                   Constraint-Tracker, Mock-Draft, Noten, Scouting, Analysten, Draft-State,
                   Verhandlungen, Side Deals
    offseason/     Lotterie + Entry Draft, Free Agency, Trade-Bewertung, Aufstellung/Kader
    sim/           Spielplan, Spiel-Engine, Saison-Loop, Playoffs, Tabellen/Statistiken, Headless-Testkit
    world/         Owner/Fans/Zuschauer/Moral, Newsfeed, Awards, Draft-Rückblick, Achievements
    io/            Import/Export eigener Ligadaten (Schema siehe unten)
  store/           Zustand-Store (dünne Hülle um Engine-Aufrufe), Spielstände/Autosave/Einstellungen
  ui/              React-Komponenten und Screens (Tailwind)
```

- **Determinismus:** Die Engine nutzt ausschließlich den geseedeten PRNG. Ein Architekturtest verbietet
  `Math.random`, `Date.now`, DOM-Zugriffe sowie React/Zustand-Imports in `src/engine/`.
  Gleicher Seed + gleiche Entscheidungen ⇒ identischer Zustand (per Test geprüft).
- **Sub-Streams:** Jede Domäne (Team-Generierung, Logos, Schutz-KI, Scouting je Spieler) hat einen eigenen Stream,
  sodass z. B. zusätzliches Scouting keine anderen Zufallsergebnisse verschiebt.

## Datenmodell (Kurzfassung)

| Typ | Wichtige Felder |
|---|---|
| `Player` | `id`, Name, `age`, `nationality`, `position` (C/LW/RW/D/G), `shoots`, `skater` *oder* `goalie` (Attribute 25–99), `ovr`, `potential`, `contract`, `proYears`, `gpLastSeason`, `gpLastTwo`, `lastSeason`, `morale`, `form`, `injury`, `seasonStats`, `teamId`, `farm` |
| `Contract` | `capHit` ($), `yearsLeft` (ab kommender Saison; 0 = pending FA), `expiryStatus` (UFA/RFA), `nmc`, `ntc`, `nmcWaived`, `elc`, `twoWay` |
| `Team` | `id`, `city`, `name`, `abbrev`, `colors`, `logo`, `conference`, `division`, `lat/lon`, `personality` (rebuild/contender/capStrapped), `gmName`, `isExpansion` |
| `DraftPick` | `year`, `round`, `originalTeamId`, `ownerTeamId` |
| `League` | `seed`, `config`, `teams`, `players` (Map nach id), `picks`, `divisions`, `franchise` |

Attribute Feldspieler: Skating, Shooting, Passing, Puck Handling, Defense, Physical, Hockey IQ.
Goalies: Reflexes, Positioning, Rebound Control, Puck Handling. Der OVR ist ein positionsabhängig gewichtetes Mittel.

Konventionen: Ein Spieler mit `contract === null` ist ein ungesignter Draftpick. „Vertrag für die nächste Saison“
heißt `contract.yearsLeft >= 1`. Payroll = Summe der Cap Hits aller aktiven Spieler mit Vertrag für die nächste Saison.

## Regeln Expansion Draft (Seattle 2021, Standard)

- Schutz: 7 F + 3 D + 1 G **oder** 8 Feldspieler + 1 G. NMC-Spieler (ohne Verzicht) müssen geschützt werden.
- Ausgenommen: 1. und 2. Profijahr, ungesignte Draftpicks.
- Mindest-Exposure je Team: ≥ 1 D und ≥ 2 F mit Vertrag für die nächste Saison und ≥ 40 Spielen in der Vorsaison
  oder ≥ 70 in den letzten zwei; ≥ 1 G mit Vertrag oder als pending RFA. Der Generator garantiert die Erfüllbarkeit.
- Expansionsteam: genau 1 Spieler pro Team, ≥ 14 F, ≥ 9 D, ≥ 3 G, ≥ 20 unter Vertrag, Cap Hits 60–100 % des Caps.
- Pending UFAs sind nur über das exklusive Verhandlungsfenster verpflichtbar; der neue Vertrag gilt dann für alle Regeln. Pending RFAs sind wählbar, zählen
  nicht zu den 20 Verträgen; ihr Cap Hit wird mit dem bisherigen Wert angesetzt.

## Vereinfachungen

Keine Arbitration, Buyouts, LTIR oder Bonus-Overages. Im Farmteam zählen nur One-Way-Verträge gegen den Cap
(Two-Way- und Entry-Level-Verträge nicht). Nicht verlängerte eigene RFAs werden nach der Free Agency vertragslos.
Gedraftete Prospects bleiben ungesignt im Farmteam.

## JSON-Import eigener Ligadaten

Auf dem Startbildschirm unter „Eigene Liga importieren“. „Vorlage herunterladen“ exportiert die per Seed generierte
Liga im Importformat – der einfachste Startpunkt für eigene Daten. Seed, Regelset und Schwierigkeit kommen aus dem
Formular „Neue Liga“; der Seed bestimmt alle ergänzten Werte (Import ist deterministisch).

```jsonc
{
  "format": "team33-league",          // Pflicht
  "version": 1,                       // Pflicht
  "name": "Meine Liga",               // optional
  "config": {                         // optional, sonst Standard (Cap 113,5 Mio. $, Floor 74 %)
    "salaryCap": 113500000, "capFloorPct": 0.74, "minSalary": 850000,
    "seasonLabel": "2027-28", "seasonStartYear": 2027
  },
  "teams": [
    {
      "abbrev": "BOS",                // 2–4 Buchstaben, eindeutig, nicht "EXP"
      "city": "Boston", "name": "Harborhawks",
      "conference": "Eastern", "division": "Atlantic",
      "primaryColor": "#1f3a5f", "secondaryColor": "#d4a017",
      "lat": 42.36, "lon": -71.06,     // für Reisen und Divisions-Neueinteilung
      "personality": "contender",      // optional: rebuild | contender | capStrapped
      "lastSeasonPoints": 104          // optional: Draft-Lotterie / Tabellenreihenfolge
    }
  ],
  "players": [
    {
      "firstName": "Liam", "lastName": "Fraser",
      "team": "BOS",                   // Kürzel eines Teams
      "position": "C",                 // C | LW | RW | D | G
      "age": 27,
      "ovr": 78,                       // ODER "attributes" (dann wird der OVR berechnet)
      "attributes": {                  // Feldspieler: skating, shooting, passing, puckHandling,
        "skating": 80                  //   defense, physical, hockeyIQ; Goalies: reflexes,
      },                               //   positioning, reboundControl, puckHandling (1–99)
      "potential": 81,                 // optional
      "nationality": "CAN", "shoots": "L",                         // optional
      "contract": {                    // null = ungesignter Draftpick
        "capHit": 4500000,             // Dollar
        "yearsLeft": 3,                // Saisons ab der kommenden; 0 = pending Free Agent
        "expiryStatus": "UFA",         // optional, sonst nach Alter
        "nmc": false, "ntc": false, "elc": false, "twoWay": false  // optional
      },
      "proYears": 6,                   // optional (abgeschlossene Profijahre → Exemptions)
      "gpLastSeason": 78, "gpLastTwo": 155,                       // optional (Exposure-Regel)
      "farm": false                    // optional: true = Farmteam/Prospect
    }
  ]
}
```

Regeln der Validierung (Fehler nennen Pfad und Regel, z. B. `players[12].contract.yearsLeft: ganze Zahl 0–8`):
28–32 Teams (Expansion Draft braucht ≥ 26 Picks, der 82-Spiele-Plan ≤ 33 Teams), genau 2 Conferences mit je 2
Divisionen à mindestens 4 Teams, jedes Team mit mindestens 12 F, 6 D und 2 G im NHL-Kader. Damit der Expansion Draft
regelkonform möglich ist, passt der Import bei Bedarf einzelne Verträge/Spielzahlen minimal an (Hinweis im Dialog).
